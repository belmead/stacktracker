import { sendAdminAlert } from "@/lib/alerts";
import {
  createReviewQueueItem,
  createScrapeRun,
  finishScrapeRun,
  getActiveScrapeTargets,
  getVendorScrapeTargets,
  markVendorPageScrape,
  reconcileStaleScrapeRuns,
  recordScrapeEvent,
  touchScrapeRunHeartbeat
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
import { createDiscoveryCache, discoverOffers } from "@/lib/scraping/discovery";
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

interface DiscoveryAttemptLog {
  source: string;
  success: boolean;
  offers: number;
  error?: string;
}

interface UnresolvedAliasAlertItem {
  alias: string;
  productName: string;
  reviewId: string;
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

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isApiDiscoverySource(source: string | null): source is "woocommerce_store_api" | "shopify_products_api" {
  return source === "woocommerce_store_api" || source === "shopify_products_api";
}

export function buildAliasReviewAlertHtml(input: {
  vendorName: string;
  unresolved: UnresolvedAliasAlertItem[];
}): string {
  const previewLimit = 25;
  const preview = input.unresolved.slice(0, previewLimit);
  const hidden = input.unresolved.length - preview.length;

  const rows = preview
    .map((item) => {
      return `<li><strong>${escapeHtml(item.alias)}</strong> (${escapeHtml(item.productName)}) - Review Queue ID: ${escapeHtml(item.reviewId)}</li>`;
    })
    .join("");

  const hiddenNote =
    hidden > 0 ? `<p>Additional unresolved aliases not listed: ${hidden}. Check the review queue for the full set.</p>` : "";

  return `<p>Vendor: ${escapeHtml(input.vendorName)}</p><p>Unresolved aliases in this scrape page: ${input.unresolved.length}</p><ul>${rows}</ul>${hiddenNote}`;
}

async function sendAdminAlertWithTimeout(subject: string, html: string): Promise<void> {
  const timeoutMs = 12_000;
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([sendAdminAlert(subject, html), timeoutPromise]);
  } catch (error) {
    console.warn("[alerts] failed to send admin alert", {
      subject,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function recordDiscoveryEvents(input: {
  scrapeRunId: string;
  vendorId: string;
  pageUrl: string;
  origin: string | null;
  source: string | null;
  attempts: DiscoveryAttemptLog[];
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
        origin: input.origin,
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
  onProgress?: () => void;
}): Promise<number> {
  let persisted = 0;
  const unresolvedProductUrls: string[] = [];
  const unresolvedAliasAlerts: UnresolvedAliasAlertItem[] = [];
  let aliasesSkippedByAi = 0;

  console.log(
    `[job:vendors] persisting offers for ${input.target.vendorName}: total=${input.offers.length}`
  );

  input.onProgress?.();

  for (const [offerIndex, extracted] of input.offers.entries()) {
    input.onProgress?.();
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
        aliasesSkippedByAi += 1;
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

      unresolvedAliasAlerts.push({
        alias: parsed.compoundRawName,
        productName: extracted.productName,
        reviewId
      });

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

    if ((offerIndex + 1) % 25 === 0 || offerIndex + 1 === input.offers.length) {
      const processed = offerIndex + 1;
      const unresolved = unresolvedAliasAlerts.length;
      console.log(
        `[job:vendors] offer progress ${processed}/${input.offers.length} for ${input.target.vendorName} (persisted=${persisted}, unresolved=${unresolved}, skippedByAi=${aliasesSkippedByAi})`
      );
      input.onProgress?.();
    }
  }

  if (unresolvedAliasAlerts.length > 0) {
    await sendAdminAlertWithTimeout(
      "Stack Tracker alias review required",
      buildAliasReviewAlertHtml({
        vendorName: input.target.vendorName,
        unresolved: unresolvedAliasAlerts
      })
    );
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

  input.onProgress?.();

  return persisted;
}

export async function runVendorScrapeJob(input: VendorScrapeJobInput): Promise<{ scrapeRunId: string; summary: Record<string, unknown> }> {
  const runStartedAt = Date.now();
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
  const discoveryCache = createDiscoveryCache();
  const persistedApiOrigins = new Set<string>();
  const maxConcurrency = Math.min(3, Math.max(1, env.VENDOR_SCRAPE_CONCURRENCY));
  const heartbeatIntervalMs = env.SCRAPE_RUN_HEARTBEAT_SECONDS * 1000;
  const lagAlertThresholdMs = env.SCRAPE_RUN_LAG_ALERT_SECONDS * 1000;
  let lastProgressAt = Date.now();
  let heartbeatInFlight = false;
  let lagAlertSent = false;

  const heartbeatTimer = setInterval(() => {
    void pulseHeartbeat();
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  function createCounterSummary(): CounterSummary {
    return {
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
  }

  function markProgress(): void {
    lastProgressAt = Date.now();
  }

  function mergeCounterSummary(delta: CounterSummary): void {
    summary.pagesSuccess += delta.pagesSuccess;
    summary.pagesFailed += delta.pagesFailed;
    summary.policyBlocked += delta.policyBlocked;
    summary.offersCreated += delta.offersCreated;
    summary.offersUpdated += delta.offersUpdated;
    summary.offersUnchanged += delta.offersUnchanged;
    summary.unresolvedAliases += delta.unresolvedAliases;
    summary.aliasesSkippedByAi += delta.aliasesSkippedByAi;
    summary.aiTasksQueued += delta.aiTasksQueued;
  }

  async function pulseHeartbeat(force = false): Promise<void> {
    if (heartbeatInFlight && !force) {
      return;
    }

    heartbeatInFlight = true;
    try {
      await touchScrapeRunHeartbeat({ scrapeRunId });

      const lagMs = Date.now() - lastProgressAt;
      if (lagMs >= lagAlertThresholdMs && !lagAlertSent) {
        lagAlertSent = true;

        await recordScrapeEvent({
          scrapeRunId,
          vendorId: null,
          severity: "warn",
          code: "RUN_HEARTBEAT_LAG",
          message: `Vendor scrape run lag exceeded ${env.SCRAPE_RUN_LAG_ALERT_SECONDS}s`,
          payload: {
            lagMs,
            lagSeconds: Math.round(lagMs / 1000),
            runMode: input.runMode,
            scrapeMode: input.scrapeMode
          }
        });

        await sendAdminAlertWithTimeout(
          "Stack Tracker vendor run lag detected",
          `<p>Run ID: ${scrapeRunId}</p><p>Lag: ${Math.round(lagMs / 1000)}s</p><p>Mode: ${input.runMode}/${input.scrapeMode}</p>`
        );
      } else if (lagMs < lagAlertThresholdMs) {
        lagAlertSent = false;
      }
    } catch (error) {
      console.warn("[job:vendors] heartbeat update failed", {
        scrapeRunId,
        error: error instanceof Error ? error.message : "unknown"
      });
    } finally {
      heartbeatInFlight = false;
    }
  }

  try {
    markProgress();
    const staleRuns = await reconcileStaleScrapeRuns({
      staleTtlMinutes: env.SCRAPE_RUN_STALE_TTL_MINUTES,
      reason: "vendor_stale_reconciler",
      jobType: "vendor",
      excludeScrapeRunId: scrapeRunId
    });

    if (staleRuns.length > 0) {
      const staleRunIds = staleRuns.map((run) => run.id);
      console.warn(
        `[job:vendors] reconciled ${staleRuns.length} stale run(s): ${staleRunIds.join(", ")}`
      );

      await recordScrapeEvent({
        scrapeRunId,
        vendorId: null,
        severity: "warn",
        code: "STALE_RUN_RECONCILED",
        message: `Marked ${staleRuns.length} stale running scrape run(s) as failed`,
        payload: {
          staleTtlMinutes: env.SCRAPE_RUN_STALE_TTL_MINUTES,
          staleRunIds
        }
      });

      await sendAdminAlertWithTimeout(
        "Stack Tracker stale runs reconciled",
        `<p>Reconciled stale vendor scrape runs (${staleRuns.length}): ${staleRunIds.join(", ")}</p><p>TTL: ${env.SCRAPE_RUN_STALE_TTL_MINUTES} minutes</p>`
      );
    }

    await pulseHeartbeat(true);

    const targets = input.vendorId ? await getVendorScrapeTargets(input.vendorId) : await getActiveScrapeTargets();

    summary.pagesTotal = targets.length;
    markProgress();
    await pulseHeartbeat(true);

    console.log(
      `[job:vendors] run ${scrapeRunId} started (${input.runMode}/${input.scrapeMode}); targets=${targets.length}; concurrency=${maxConcurrency}`
    );

    const processTarget = async (target: (typeof targets)[number], index: number): Promise<void> => {
      const pageStartedAt = Date.now();
      const pageSummary = createCounterSummary();
      let pageStatus = "unknown";

      try {
        markProgress();
        console.log(
          `[job:vendors] [${index + 1}/${targets.length}] scraping ${target.vendorName} (${target.pageUrl})`
        );

        const robots = await checkRobotsPermission(target.pageUrl);
        const bypassRobots = canBypassRobots(input.scrapeMode, target.allowAggressive);

        if (!robots.allowed && !bypassRobots) {
          pageStatus = "policy_blocked";
          pageSummary.policyBlocked += 1;

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

          pageSummary.aiTasksQueued += 1;

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

          await sendAdminAlertWithTimeout(
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
              pageStatus = "policy_blocked_no_offers";
              await updateAiAgentTask({
                taskId,
                status: "failed",
                errorMessage: "No offers detected by AI fallback"
              });

              pageSummary.pagesFailed += 1;
              await markVendorPageScrape({
                vendorPageId: target.vendorPageId,
                status: "policy_blocked"
              });

              return;
            }

            const persisted = await persistExtractedOffers({
              scrapeRunId,
              target,
              offers: aiOffers,
              summary: pageSummary,
              onProgress: markProgress
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

            pageStatus = "success_ai_override";
            pageSummary.pagesSuccess += 1;
            return;
          } catch (error) {
            pageStatus = "policy_blocked_failed";
            await updateAiAgentTask({
              taskId,
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "unknown"
            });

            pageSummary.pagesFailed += 1;
            await markVendorPageScrape({
              vendorPageId: target.vendorPageId,
              status: "policy_blocked"
            });
            return;
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
          fetchPageHtml,
          cache: discoveryCache
        });

        offers = discovery.offers;
        await recordDiscoveryEvents({
          scrapeRunId,
          vendorId: target.vendorId,
          pageUrl: target.pageUrl,
          origin: discovery.origin,
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
          pageStatus = "no_offers";
          const taskId = await createAiAgentTask({
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            reason: "empty_or_js_rendered",
            scrapeRunId,
            requestedBy: input.triggeredBy
          });

          pageSummary.aiTasksQueued += 1;
          pageSummary.pagesFailed += 1;

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

          return;
        }

        const isApiSource = isApiDiscoverySource(discovery.source);
        if (isApiSource && discovery.origin) {
          const originKey = `${target.vendorId}::${discovery.source}::${discovery.origin}`;
          if (persistedApiOrigins.has(originKey)) {
            await updateVendorLastSeen(target.vendorId);
            await markVendorPageScrape({
              vendorPageId: target.vendorPageId,
              status: "success"
            });

            await recordScrapeEvent({
              scrapeRunId,
              vendorId: target.vendorId,
              severity: "info",
              code: "DISCOVERY_REUSED_ORIGIN",
              message: `Reused ${discovery.source} discovery for ${discovery.origin}`,
              payload: {
                pageUrl: target.pageUrl,
                source: discovery.source,
                origin: discovery.origin,
                offers: offers.length
              }
            });

            pageStatus = "success_reused_origin";
            pageSummary.pagesSuccess += 1;
            return;
          }

          persistedApiOrigins.add(originKey);
        }

        await persistExtractedOffers({
          scrapeRunId,
          target,
          offers,
          summary: pageSummary,
          onProgress: markProgress
        });

        await updateVendorLastSeen(target.vendorId);
        await markVendorPageScrape({
          vendorPageId: target.vendorPageId,
          status: "success"
        });

        pageStatus = "success";
        pageSummary.pagesSuccess += 1;
      } catch (error) {
        pageStatus = "failed";
        pageSummary.pagesFailed += 1;

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
      } finally {
        mergeCounterSummary(pageSummary);
        markProgress();

        const pageDuration = formatDurationMs(Date.now() - pageStartedAt);

        console.log(
          `[job:vendors] [${index + 1}/${targets.length}] ${pageStatus} in ${pageDuration} (created=${pageSummary.offersCreated}, updated=${pageSummary.offersUpdated}, unchanged=${pageSummary.offersUnchanged}, unresolved=${pageSummary.unresolvedAliases}, skippedByAi=${pageSummary.aliasesSkippedByAi}, aiQueued=${pageSummary.aiTasksQueued}, failed=${pageSummary.pagesFailed}, policyBlocked=${pageSummary.policyBlocked})`
        );
      }
    };

    let nextIndex = 0;
    const workerCount = Math.min(maxConcurrency, targets.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= targets.length) {
          break;
        }

        await processTarget(targets[currentIndex], currentIndex);
      }
    });

    await Promise.all(workers);

    const status = summarizeStatus({
      failures: summary.pagesFailed,
      policyBlocked: summary.policyBlocked
    });

    await finishScrapeRun({
      scrapeRunId,
      status,
      summary: summary as unknown as Record<string, unknown>
    });

    console.log(
      `[job:vendors] run ${scrapeRunId} completed in ${formatDurationMs(Date.now() - runStartedAt)} with status=${status}`
    );

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

    console.error(
      `[job:vendors] run ${scrapeRunId} failed after ${formatDurationMs(Date.now() - runStartedAt)}`,
      error
    );

    throw error;
  } finally {
    clearInterval(heartbeatTimer);
    await pulseHeartbeat(true);
  }
}
