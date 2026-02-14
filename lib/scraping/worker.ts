import { sendAdminAlert } from "@/lib/alerts";
import {
  createReviewQueueItem,
  createScrapeRun,
  finishScrapeRun,
  getActiveScrapeTargets,
  getVendorScrapeTargets,
  markVendorPageScrape,
  recordScrapeEvent
} from "@/lib/db/queries";
import {
  markVendorOffersUnavailableByUrls,
  createAiAgentTask,
  ensureFormulation,
  resolveCompoundAlias,
  updateAiAgentTask,
  updateOfferFromExtracted,
  updateVendorLastSeen,
  upsertCompoundVariant
} from "@/lib/db/mutations";
import { env } from "@/lib/env";
import { computeMetricPrices, resolveVariantTotals } from "@/lib/metrics";
import { discoverOffers } from "@/lib/scraping/discovery";
import { parseProductName } from "@/lib/scraping/normalize";
import { scrapeWithPlaywright } from "@/lib/scraping/playwright-agent";
import { checkRobotsPermission } from "@/lib/scraping/robots";
import type { ExtractedOffer, JobRunMode, ScrapeMode, ScrapeStatus } from "@/lib/types";

interface VendorScrapeJobInput {
  runMode: JobRunMode;
  scrapeMode: ScrapeMode;
  triggeredBy: string | null;
  vendorId?: string;
}

interface CounterSummary {
  pagesTotal: number;
  pagesSuccess: number;
  pagesFailed: number;
  policyBlocked: number;
  offersCreated: number;
  offersUpdated: number;
  offersUnchanged: number;
  unresolvedAliases: number;
  aliasesSkippedByAi: number;
  aiTasksQueued: number;
}

async function fetchPageHtml(pageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(pageUrl, {
      headers: {
        "user-agent": env.SCRAPER_USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function canBypassRobots(scrapeMode: ScrapeMode, allowAggressive: boolean): boolean {
  return scrapeMode === "aggressive_manual" && allowAggressive;
}

function summarizeStatus(input: {
  failures: number;
  policyBlocked: number;
}): ScrapeStatus {
  if (input.failures > 0 || input.policyBlocked > 0) {
    return "partial";
  }

  return "success";
}

async function recordDiscoveryEvents(input: {
  scrapeRunId: string;
  vendorId: string;
  pageUrl: string;
  source: string | null;
  attempts: Array<{
    source: string;
    success: boolean;
    offers: number;
    error?: string;
  }>;
}): Promise<void> {
  if (input.source) {
    await recordScrapeEvent({
      scrapeRunId: input.scrapeRunId,
      vendorId: input.vendorId,
      severity: "info",
      code: "DISCOVERY_SOURCE",
      message: `Offer discovery succeeded via ${input.source}`,
      payload: {
        pageUrl: input.pageUrl,
        source: input.source,
        attempts: input.attempts
      }
    });
  }

  for (const attempt of input.attempts) {
    if (!attempt.error) {
      continue;
    }

    await recordScrapeEvent({
      scrapeRunId: input.scrapeRunId,
      vendorId: input.vendorId,
      severity: "warn",
      code: "DISCOVERY_ATTEMPT_FAILED",
      message: `Discovery source ${attempt.source} failed`,
      payload: {
        pageUrl: input.pageUrl,
        source: attempt.source,
        error: attempt.error
      }
    });
  }
}

async function persistExtractedOffers(input: {
  scrapeRunId: string;
  target: {
    vendorId: string;
    vendorName: string;
  };
  offers: ExtractedOffer[];
  summary: CounterSummary;
}): Promise<number> {
  let persisted = 0;
  const unresolvedProductUrls: string[] = [];

  for (const extracted of input.offers) {
    const parsed = parseProductName(extracted.productName);

    await ensureFormulation(parsed.formulationCode, parsed.formulationLabel);

    const resolution = await resolveCompoundAlias({
      rawName: parsed.compoundRawName,
      productName: extracted.productName,
      productUrl: extracted.productUrl,
      vendorName: input.target.vendorName
    });
    if (!resolution.compoundId) {
      if (resolution.skipReview) {
        input.summary.aliasesSkippedByAi += 1;
        unresolvedProductUrls.push(extracted.productUrl);

        await recordScrapeEvent({
          scrapeRunId: input.scrapeRunId,
          vendorId: input.target.vendorId,
          severity: "info",
          code: "ALIAS_SKIPPED_AI",
          message: `Skipped alias by AI classification: ${parsed.compoundRawName}`,
          payload: {
            productName: extracted.productName,
            productUrl: extracted.productUrl,
            reason: resolution.reason,
            confidence: resolution.confidence
          }
        });

        continue;
      }

      input.summary.unresolvedAliases += 1;

      const reviewId = await createReviewQueueItem({
        type: "alias_match",
        vendorId: input.target.vendorId,
        pageUrl: extracted.productUrl,
        rawText: parsed.compoundRawName,
        confidence: resolution.confidence,
        payload: {
          reason: resolution.reason,
          productName: extracted.productName
        }
      });

      await recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: input.target.vendorId,
        severity: "warn",
        code: "UNKNOWN_ALIAS",
        message: `Alias unresolved: ${parsed.compoundRawName}`,
        payload: {
          reviewId,
          confidence: resolution.confidence
        }
      });

      await sendAdminAlert(
        "Stack Tracker alias review required",
        `<p>Vendor: ${input.target.vendorName}</p><p>Product: ${extracted.productName}</p><p>Unresolved alias: ${parsed.compoundRawName}</p><p>Review Queue ID: ${reviewId}</p>`
      );

      unresolvedProductUrls.push(extracted.productUrl);
      continue;
    }

    const totals = resolveVariantTotals({
      strengthValue: parsed.strengthValue,
      strengthUnit: parsed.strengthUnit,
      packageQuantity: parsed.packageQuantity,
      packageUnit: parsed.packageUnit
    });

    const variantId = await upsertCompoundVariant({
      compoundId: resolution.compoundId,
      formulationCode: parsed.formulationCode,
      displaySizeLabel: parsed.displaySizeLabel,
      strengthValue: totals.strengthValue,
      strengthUnit: totals.strengthUnit,
      packageQuantity: totals.packageQuantity,
      packageUnit: totals.packageUnit,
      totalMassMg: totals.totalMassMg,
      totalVolumeMl: totals.totalVolumeMl,
      totalCountUnits: totals.totalCountUnits
    });

    const metricPrices = computeMetricPrices(extracted.listPriceCents, {
      formulationCode: parsed.formulationCode,
      displaySizeLabel: parsed.displaySizeLabel,
      strengthValue: totals.strengthValue,
      strengthUnit: totals.strengthUnit,
      packageQuantity: totals.packageQuantity,
      packageUnit: totals.packageUnit,
      totalMassMg: totals.totalMassMg,
      totalVolumeMl: totals.totalVolumeMl,
      totalCountUnits: totals.totalCountUnits
    });

    const writeStatus = await updateOfferFromExtracted({
      scrapeRunId: input.scrapeRunId,
      extracted,
      variantId,
      metricPrices
    });

    if (writeStatus === "created") {
      input.summary.offersCreated += 1;
    } else if (writeStatus === "updated") {
      input.summary.offersUpdated += 1;
    } else {
      input.summary.offersUnchanged += 1;
    }

    persisted += 1;
  }

  const deactivatedCount = await markVendorOffersUnavailableByUrls({
    vendorId: input.target.vendorId,
    productUrls: unresolvedProductUrls
  });

  if (deactivatedCount > 0) {
    await recordScrapeEvent({
      scrapeRunId: input.scrapeRunId,
      vendorId: input.target.vendorId,
      severity: "info",
      code: "OFFERS_DEACTIVATED",
      message: `Marked ${deactivatedCount} existing offer(s) unavailable after unresolved alias detection`,
      payload: {
        count: deactivatedCount
      }
    });
  }

  return persisted;
}

export async function runVendorScrapeJob(input: VendorScrapeJobInput): Promise<{ scrapeRunId: string; summary: Record<string, unknown> }> {
  const scrapeRunId = await createScrapeRun({
    jobType: "vendor",
    runMode: input.runMode,
    scrapeMode: input.scrapeMode,
    triggeredBy: input.triggeredBy
  });

  const summary: CounterSummary = {
    pagesTotal: 0,
    pagesSuccess: 0,
    pagesFailed: 0,
    policyBlocked: 0,
    offersCreated: 0,
    offersUpdated: 0,
    offersUnchanged: 0,
    unresolvedAliases: 0,
    aliasesSkippedByAi: 0,
    aiTasksQueued: 0
  };

  try {
    const targets = input.vendorId ? await getVendorScrapeTargets(input.vendorId) : await getActiveScrapeTargets();

    summary.pagesTotal = targets.length;

    for (const target of targets) {
      try {
        const robots = await checkRobotsPermission(target.pageUrl);
        const bypassRobots = canBypassRobots(input.scrapeMode, target.allowAggressive);

        if (!robots.allowed && !bypassRobots) {
          summary.policyBlocked += 1;

          await createReviewQueueItem({
            type: "policy_block",
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            rawText: target.vendorName,
            payload: {
              reason: robots.reason,
              robotsUrl: robots.robotsUrl
            }
          });

          const taskId = await createAiAgentTask({
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            reason: "policy_blocked_safe_mode",
            scrapeRunId,
            requestedBy: input.triggeredBy
          });

          summary.aiTasksQueued += 1;

          await recordScrapeEvent({
            scrapeRunId,
            vendorId: target.vendorId,
            severity: "warn",
            code: "POLICY_BLOCKED",
            message: `Robots disallowed ${target.pageUrl}; AI agent fallback triggered`,
            payload: {
              taskId,
              robotsUrl: robots.robotsUrl,
              reason: robots.reason
            }
          });

          await sendAdminAlert(
            "Stack Tracker scrape blocked by policy",
            `<p>Vendor: ${target.vendorName}</p><p>URL: ${target.pageUrl}</p><p>Reason: ${robots.reason}</p><p>AI fallback task: ${taskId}</p>`
          );

          await updateAiAgentTask({
            taskId,
            status: "running"
          });

          try {
            const aiOffers = await scrapeWithPlaywright({
              vendorPageId: target.vendorPageId,
              vendorId: target.vendorId,
              pageUrl: target.pageUrl
            });

            if (aiOffers.length === 0) {
              await updateAiAgentTask({
                taskId,
                status: "failed",
                errorMessage: "No offers detected by AI fallback"
              });

              summary.pagesFailed += 1;
              await markVendorPageScrape({
                vendorPageId: target.vendorPageId,
                status: "policy_blocked"
              });

              continue;
            }

            const persisted = await persistExtractedOffers({
              scrapeRunId,
              target,
              offers: aiOffers,
              summary
            });

            await updateAiAgentTask({
              taskId,
              status: "completed",
              outputPayload: {
                offersDetected: aiOffers.length,
                offersPersisted: persisted
              }
            });

            await updateVendorLastSeen(target.vendorId);
            await markVendorPageScrape({
              vendorPageId: target.vendorPageId,
              status: "success_ai_override"
            });

            summary.pagesSuccess += 1;
            continue;
          } catch (error) {
            await updateAiAgentTask({
              taskId,
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "unknown"
            });

            summary.pagesFailed += 1;
            await markVendorPageScrape({
              vendorPageId: target.vendorPageId,
              status: "policy_blocked"
            });
            continue;
          }
        }

        let offers = [] as ExtractedOffer[];
        const discovery = await discoverOffers({
          target: {
            vendorPageId: target.vendorPageId,
            vendorId: target.vendorId,
            vendorName: target.vendorName,
            websiteUrl: target.websiteUrl,
            pageUrl: target.pageUrl
          },
          fetchPageHtml
        });

        offers = discovery.offers;
        await recordDiscoveryEvents({
          scrapeRunId,
          vendorId: target.vendorId,
          pageUrl: target.pageUrl,
          source: discovery.source,
          attempts: discovery.attempts
        });

        if (offers.length === 0 && input.scrapeMode === "aggressive_manual") {
          offers = await scrapeWithPlaywright({
            vendorPageId: target.vendorPageId,
            vendorId: target.vendorId,
            pageUrl: target.pageUrl
          });
        }

        if (offers.length === 0) {
          const taskId = await createAiAgentTask({
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            reason: "empty_or_js_rendered",
            scrapeRunId,
            requestedBy: input.triggeredBy
          });

          summary.aiTasksQueued += 1;
          summary.pagesFailed += 1;

          await createReviewQueueItem({
            type: "parse_failure",
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            payload: {
              taskId,
              reason: "no_offers_found"
            }
          });

          await markVendorPageScrape({
            vendorPageId: target.vendorPageId,
            status: "no_data"
          });

          await recordScrapeEvent({
            scrapeRunId,
            vendorId: target.vendorId,
            severity: "warn",
            code: "NO_OFFERS",
            message: `No offers parsed for ${target.pageUrl}`,
            payload: {
              taskId
            }
          });

          continue;
        }

        await persistExtractedOffers({
          scrapeRunId,
          target,
          offers,
          summary
        });

        await updateVendorLastSeen(target.vendorId);
        await markVendorPageScrape({
          vendorPageId: target.vendorPageId,
          status: "success"
        });

        summary.pagesSuccess += 1;
      } catch (error) {
        summary.pagesFailed += 1;

        await markVendorPageScrape({
          vendorPageId: target.vendorPageId,
          status: "failed"
        });

        await recordScrapeEvent({
          scrapeRunId,
          vendorId: target.vendorId,
          severity: "error",
          code: "SCRAPE_PAGE_ERROR",
          message: `Vendor page scrape failed: ${target.pageUrl}`,
          payload: {
            error: error instanceof Error ? error.message : "unknown"
          }
        });
      }
    }

    const status = summarizeStatus({
      failures: summary.pagesFailed,
      policyBlocked: summary.policyBlocked
    });

    await finishScrapeRun({
      scrapeRunId,
      status,
      summary: summary as unknown as Record<string, unknown>
    });

    return { scrapeRunId, summary: summary as unknown as Record<string, unknown> };
  } catch (error) {
    await finishScrapeRun({
      scrapeRunId,
      status: "failed",
      summary: {
        ...summary,
        fatalError: error instanceof Error ? error.message : "unknown"
      }
    });

    throw error;
  }
}
