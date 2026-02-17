import { sendAdminAlert } from "@/lib/alerts";
import {
  createReviewQueueItem,
  createScrapeRun,
  finishScrapeRun,
  getCompoundFormulationCoverageSnapshot,
  getRecentVendorRunSummaries,
  getTopCompoundCoverageSnapshot,
  getActiveScrapeTargets,
  pruneOperationalNoiseData,
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
import { loadManualOfferExclusions } from "@/lib/exclusions/manual-offer-exclusions";
import { computeMetricPrices, resolveVariantTotals } from "@/lib/metrics";
import { createDiscoveryCache, discoverOffers } from "@/lib/scraping/discovery";
import { parseProductName } from "@/lib/scraping/normalize";
import {
  evaluateFormulationDrift,
  evaluateFormulationInvariant,
  evaluateTopCompoundCoverageSmoke,
  parseInvariantResultFromSummary,
  parseTopCompoundCoverageSnapshotFromSummary,
  type FormulationDriftResult,
  type FormulationInvariantResult,
  type SmokeCoverageResult,
  type TopCompoundCoverageSnapshot
} from "@/lib/scraping/quality-guardrails";
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
  offersExcludedByRule: number;
  unresolvedAliases: number;
  aliasesSkippedByAi: number;
  aiTasksQueued: number;
  discoveryNetworkMs: number;
  discoveryWooMs: number;
  discoveryShopifyMs: number;
  discoveryHtmlMs: number;
  discoveryFirecrawlMs: number;
  aliasDeterministicMs: number;
  aliasAiMs: number;
  dbPersistenceMs: number;
}

interface DiscoveryAttemptLog {
  source: string;
  success: boolean;
  offers: number;
  durationMs: number;
  error?: string;
}

interface UnresolvedAliasAlertItem {
  alias: string;
  productName: string;
  reviewId: string;
}

interface QualityGuardrailReport {
  evaluatedAt: string;
  baselineInvariantRunId: string | null;
  baselineTopCoverageRunId: string | null;
  formulationInvariants: FormulationInvariantResult[];
  formulationDriftAlerts: FormulationDriftResult[];
  topCompoundCoverageSnapshot: TopCompoundCoverageSnapshot[];
  smokeCoverage: SmokeCoverageResult;
  criticalFailures: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("aborted")
  );
}

function isTransientDatabaseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as Error & { code?: string }).code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EPIPE") {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("terminating connection") ||
    message.includes("connection not open") ||
    message.includes("socket") ||
    message.includes("read etimedout")
  );
}

async function fetchPageHtml(pageUrl: string): Promise<string> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch(pageUrl, {
        headers: {
          "user-agent": env.SCRAPER_USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9"
        },
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        if (attempt < maxAttempts && isTransientHttpStatus(response.status)) {
          await sleep(350 * attempt);
          continue;
        }

        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    } catch (error) {
      if (attempt < maxAttempts && isTransientNetworkError(error)) {
        await sleep(350 * attempt);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return "";
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

function isAiResolutionReason(reason: string): boolean {
  if (reason === "ai_review_cached") {
    return false;
  }

  return reason.startsWith("ai_");
}

async function withDbTiming<T>(summary: CounterSummary, operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = Date.now();

    try {
      return await operation();
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const waitMs = 200 * attempt;
      console.warn("[job:vendors] transient DB operation failure; retrying", {
        attempt,
        maxAttempts,
        waitMs,
        error: error instanceof Error ? error.message : "unknown"
      });
      await sleep(waitMs);
    } finally {
      summary.dbPersistenceMs += Date.now() - startedAt;
    }
  }

  throw new Error("Unexpected DB retry loop exhaustion");
}

function applyDiscoveryAttemptTiming(summary: CounterSummary, attempts: DiscoveryAttemptLog[]): void {
  for (const attempt of attempts) {
    summary.discoveryNetworkMs += attempt.durationMs;

    if (attempt.source === "woocommerce_store_api") {
      summary.discoveryWooMs += attempt.durationMs;
      continue;
    }

    if (attempt.source === "shopify_products_api") {
      summary.discoveryShopifyMs += attempt.durationMs;
      continue;
    }

    if (attempt.source === "html") {
      summary.discoveryHtmlMs += attempt.durationMs;
      continue;
    }

    if (attempt.source === "firecrawl") {
      summary.discoveryFirecrawlMs += attempt.durationMs;
    }
  }
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildQualityGuardrailAlertHtml(input: {
  scrapeRunId: string;
  report: QualityGuardrailReport;
}): string {
  const invariantItems = input.report.formulationInvariants
    .map((item) => {
      return `<li><strong>${escapeHtml(item.id)}</strong>: ${escapeHtml(item.status)} (${escapeHtml(
        item.reason
      )}; offers=${item.totalOffers}; vial=${item.vialOffers}; vialShare=${formatPercent(item.vialShare)})</li>`;
    })
    .join("");

  const driftItems = input.report.formulationDriftAlerts
    .map((item) => {
      const current = item.currentVialShare === null ? "n/a" : formatPercent(item.currentVialShare);
      const previous = item.previousVialShare === null ? "n/a" : formatPercent(item.previousVialShare);
      return `<li><strong>${escapeHtml(item.id)}</strong>: ${escapeHtml(item.status)} (${escapeHtml(
        item.reason
      )}; current=${current}; previous=${previous})</li>`;
    })
    .join("");

  const smokeFailures = input.report.smokeCoverage.failures
    .slice(0, 20)
    .map((failure) => {
      return `<li><strong>${escapeHtml(failure.compoundName)} (${escapeHtml(
        failure.compoundSlug
      )})</strong>: current=${failure.currentVendorCount}, previous=${failure.previousVendorCount}, required=${
        failure.requiredVendorCount
      }, drop=${formatPercent(failure.dropPct)}</li>`;
    })
    .join("");

  const smokeHidden = input.report.smokeCoverage.failures.length - Math.min(20, input.report.smokeCoverage.failures.length);
  const smokeHiddenNote = smokeHidden > 0 ? `<p>Additional smoke failures not listed: ${smokeHidden}</p>` : "";

  const criticalList = input.report.criticalFailures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("");

  return `
    <p>Scrape Run ID: ${escapeHtml(input.scrapeRunId)}</p>
    <p>Quality guardrail critical failures: ${input.report.criticalFailures.length}</p>
    <ul>${criticalList}</ul>
    <p>Formulation invariants:</p>
    <ul>${invariantItems}</ul>
    <p>Formulation drift checks:</p>
    <ul>${driftItems}</ul>
    <p>Top-compound smoke status: ${escapeHtml(input.report.smokeCoverage.status)} (${escapeHtml(input.report.smokeCoverage.reason)})</p>
    <ul>${smokeFailures}</ul>
    ${smokeHiddenNote}
  `;
}

async function evaluateQualityGuardrails(input: {
  scrapeRunId: string;
  summary: CounterSummary;
}): Promise<QualityGuardrailReport> {
  const invariantConfig = {
    id: "bpc157_10mg_vial_majority",
    compoundSlug: "bpc-157",
    totalMassMg: 10,
    minOffers: env.QUALITY_INVARIANT_BPC157_10MG_MIN_OFFERS,
    minVialShare: env.QUALITY_INVARIANT_BPC157_10MG_MIN_VIAL_SHARE
  };
  const driftConfig = {
    id: invariantConfig.id,
    minOffers: env.QUALITY_INVARIANT_BPC157_10MG_MIN_OFFERS,
    maxVialShareDrop: env.QUALITY_DRIFT_BPC157_10MG_MAX_VIAL_SHARE_DROP
  };
  const smokeConfig = {
    maxVendorDropPct: env.TOP_COMPOUND_SMOKE_MAX_VENDOR_DROP_PCT,
    minBaselineVendorCount: env.TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS
  };

  const formulationCoverage = await withDbTiming(input.summary, () =>
    getCompoundFormulationCoverageSnapshot({
      compoundSlug: invariantConfig.compoundSlug,
      totalMassMg: invariantConfig.totalMassMg
    })
  );
  const formulationCounts = Object.fromEntries(formulationCoverage.rows.map((row) => [row.formulationCode, row.offerCount]));

  const invariant = evaluateFormulationInvariant({
    config: invariantConfig,
    snapshot: {
      compoundSlug: invariantConfig.compoundSlug,
      totalMassMg: invariantConfig.totalMassMg,
      totalOffers: formulationCoverage.totalOffers,
      totalVendors: formulationCoverage.totalVendors,
      formulationCounts
    }
  });

  const topCoverageSnapshot = await withDbTiming(input.summary, () =>
    getTopCompoundCoverageSnapshot({
      limit: env.TOP_COMPOUND_SMOKE_LIMIT
    })
  );
  const normalizedTopCoverage: TopCompoundCoverageSnapshot[] = topCoverageSnapshot.map((row) => ({
    compoundSlug: row.compoundSlug,
    compoundName: row.compoundName,
    vendorCount: row.vendorCount,
    offerCount: row.offerCount
  }));

  const recentRuns = await withDbTiming(input.summary, () =>
    getRecentVendorRunSummaries({
      excludeScrapeRunId: input.scrapeRunId,
      limit: 25
    })
  );

  let previousInvariant: FormulationInvariantResult | null = null;
  let baselineInvariantRunId: string | null = null;
  let previousTopCoverage: TopCompoundCoverageSnapshot[] | null = null;
  let baselineTopCoverageRunId: string | null = null;

  for (const run of recentRuns) {
    if (!previousInvariant) {
      const parsedInvariant = parseInvariantResultFromSummary({
        summary: run.summary,
        id: invariantConfig.id
      });
      if (parsedInvariant) {
        previousInvariant = parsedInvariant;
        baselineInvariantRunId = run.id;
      }
    }

    if (!previousTopCoverage) {
      const parsedTopCoverage = parseTopCompoundCoverageSnapshotFromSummary(run.summary);
      if (parsedTopCoverage) {
        previousTopCoverage = parsedTopCoverage;
        baselineTopCoverageRunId = run.id;
      }
    }

    if (previousInvariant && previousTopCoverage) {
      break;
    }
  }

  const drift = evaluateFormulationDrift({
    config: driftConfig,
    current: invariant,
    previous: previousInvariant
  });

  const smokeCoverage = evaluateTopCompoundCoverageSmoke({
    config: smokeConfig,
    current: normalizedTopCoverage,
    previous: previousTopCoverage
  });

  const criticalFailures: string[] = [];
  if (invariant.status === "fail") {
    criticalFailures.push(`Formulation invariant failed: ${invariant.id} (${invariant.reason})`);
  }
  if (smokeCoverage.status === "fail") {
    criticalFailures.push(`Top-compound smoke test failed: ${smokeCoverage.reason}`);
  }

  if (invariant.status === "fail") {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: null,
        severity: "error",
        code: "QUALITY_INVARIANT_FAILED",
        message: `Quality invariant failed: ${invariant.id}`,
        payload: {
          ...invariant,
          baselineInvariantRunId
        }
      })
    );
  } else {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: null,
        severity: "info",
        code: "QUALITY_INVARIANT_EVALUATED",
        message: `Quality invariant ${invariant.status}: ${invariant.id}`,
        payload: {
          ...invariant,
          baselineInvariantRunId
        }
      })
    );
  }

  if (drift.status === "alert") {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: null,
        severity: "warn",
        code: "QUALITY_DRIFT_ALERT",
        message: `Quality drift alert: ${drift.id}`,
        payload: {
          ...drift,
          baselineInvariantRunId
        }
      })
    );
  }

  if (smokeCoverage.status === "fail") {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: null,
        severity: "error",
        code: "TOP_COMPOUND_SMOKE_FAILED",
        message: "Top-compound coverage smoke test failed",
        payload: {
          ...smokeCoverage,
          baselineTopCoverageRunId
        }
      })
    );
  } else {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: null,
        severity: "info",
        code: "TOP_COMPOUND_SMOKE_EVALUATED",
        message: `Top-compound smoke ${smokeCoverage.status}`,
        payload: {
          ...smokeCoverage,
          baselineTopCoverageRunId
        }
      })
    );
  }

  const report: QualityGuardrailReport = {
    evaluatedAt: new Date().toISOString(),
    baselineInvariantRunId,
    baselineTopCoverageRunId,
    formulationInvariants: [invariant],
    formulationDriftAlerts: [drift],
    topCompoundCoverageSnapshot: normalizedTopCoverage,
    smokeCoverage,
    criticalFailures
  };

  if (criticalFailures.length > 0 || drift.status === "alert") {
    const subject =
      criticalFailures.length > 0
        ? "Stack Tracker quality guardrails failed"
        : "Stack Tracker quality drift alert";

    await sendAdminAlertWithTimeout(
      subject,
      buildQualityGuardrailAlertHtml({
        scrapeRunId: input.scrapeRunId,
        report
      })
    );
  }

  return report;
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
        durationMs: attempt.durationMs,
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
  offerExclusionsByProductUrl: Map<
    string,
    {
      compoundSlug: string;
      reason: string;
      decidedBy: string;
      decidedAt: string;
      notes: string;
    }
  >;
  onProgress?: () => void;
}): Promise<number> {
  let persisted = 0;
  const unresolvedProductUrls: string[] = [];
  const excludedProductUrls: string[] = [];
  const unresolvedAliasAlerts: UnresolvedAliasAlertItem[] = [];
  let aliasesSkippedByAi = 0;
  let offersExcludedByRule = 0;

  console.log(
    `[job:vendors] persisting offers for ${input.target.vendorName}: total=${input.offers.length}`
  );

  input.onProgress?.();

  for (const [offerIndex, extracted] of input.offers.entries()) {
    input.onProgress?.();
    const exclusionRule = input.offerExclusionsByProductUrl.get(extracted.productUrl);
    if (exclusionRule) {
      offersExcludedByRule += 1;
      input.summary.offersExcludedByRule += 1;
      excludedProductUrls.push(extracted.productUrl);

      await withDbTiming(input.summary, () =>
        recordScrapeEvent({
          scrapeRunId: input.scrapeRunId,
          vendorId: input.target.vendorId,
          severity: "info",
          code: "OFFER_EXCLUDED_RULE",
          message: `Skipped offer via manual exclusion rule: ${extracted.productName}`,
          payload: {
            productName: extracted.productName,
            productUrl: extracted.productUrl,
            compoundSlug: exclusionRule.compoundSlug,
            reason: exclusionRule.reason,
            decidedBy: exclusionRule.decidedBy,
            decidedAt: exclusionRule.decidedAt,
            notes: exclusionRule.notes
          }
        })
      );

      continue;
    }

    const parsed = parseProductName(extracted.productName);

    await withDbTiming(input.summary, () => ensureFormulation(parsed.formulationCode, parsed.formulationLabel));

    const aliasStartedAt = Date.now();
    const resolution = await resolveCompoundAlias({
      rawName: parsed.compoundRawName,
      productName: extracted.productName,
      productUrl: extracted.productUrl,
      vendorName: input.target.vendorName
    });
    const aliasDurationMs = Date.now() - aliasStartedAt;
    if (isAiResolutionReason(resolution.reason)) {
      input.summary.aliasAiMs += aliasDurationMs;
    } else {
      input.summary.aliasDeterministicMs += aliasDurationMs;
    }

    const resolvedCompoundId = resolution.compoundId;
    if (!resolvedCompoundId) {
      if (resolution.skipReview) {
        aliasesSkippedByAi += 1;
        input.summary.aliasesSkippedByAi += 1;
        unresolvedProductUrls.push(extracted.productUrl);

        await withDbTiming(input.summary, () =>
          recordScrapeEvent({
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
          })
        );

        continue;
      }

      input.summary.unresolvedAliases += 1;

      const reviewId = await withDbTiming(input.summary, () =>
        createReviewQueueItem({
          type: "alias_match",
          vendorId: input.target.vendorId,
          pageUrl: extracted.productUrl,
          rawText: parsed.compoundRawName,
          confidence: resolution.confidence,
          payload: {
            reason: resolution.reason,
            productName: extracted.productName
          }
        })
      );

      await withDbTiming(input.summary, () =>
        recordScrapeEvent({
          scrapeRunId: input.scrapeRunId,
          vendorId: input.target.vendorId,
          severity: "warn",
          code: "UNKNOWN_ALIAS",
          message: `Alias unresolved: ${parsed.compoundRawName}`,
          payload: {
            reviewId,
            confidence: resolution.confidence
          }
        })
      );

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

    const variantId = await withDbTiming(input.summary, () =>
      upsertCompoundVariant({
        compoundId: resolvedCompoundId,
        formulationCode: parsed.formulationCode,
        displaySizeLabel: parsed.displaySizeLabel,
        strengthValue: totals.strengthValue,
        strengthUnit: totals.strengthUnit,
        packageQuantity: totals.packageQuantity,
        packageUnit: totals.packageUnit,
        totalMassMg: totals.totalMassMg,
        totalVolumeMl: totals.totalVolumeMl,
        totalCountUnits: totals.totalCountUnits
      })
    );

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

    const writeStatus = await withDbTiming(input.summary, () =>
      updateOfferFromExtracted({
        scrapeRunId: input.scrapeRunId,
        extracted,
        variantId,
        metricPrices
      })
    );

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
        `[job:vendors] offer progress ${processed}/${input.offers.length} for ${input.target.vendorName} (persisted=${persisted}, unresolved=${unresolved}, skippedByAi=${aliasesSkippedByAi}, excludedByRule=${offersExcludedByRule})`
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

  const deactivationCandidates = Array.from(
    new Set([...unresolvedProductUrls, ...excludedProductUrls].map((url) => url.trim()).filter(Boolean))
  );

  const deactivatedCount = await withDbTiming(input.summary, () =>
    markVendorOffersUnavailableByUrls({
      vendorId: input.target.vendorId,
      productUrls: deactivationCandidates
    })
  );

  if (deactivatedCount > 0) {
    await withDbTiming(input.summary, () =>
      recordScrapeEvent({
        scrapeRunId: input.scrapeRunId,
        vendorId: input.target.vendorId,
        severity: "info",
        code: "OFFERS_DEACTIVATED",
        message: `Marked ${deactivatedCount} existing offer(s) unavailable after unresolved alias/manual exclusion handling`,
        payload: {
          count: deactivatedCount,
          unresolvedProductCount: unresolvedProductUrls.length,
          excludedProductCount: excludedProductUrls.length
        }
      })
    );
  }

  input.onProgress?.();

  return persisted;
}

export async function runVendorScrapeJob(input: VendorScrapeJobInput): Promise<{ scrapeRunId: string; summary: Record<string, unknown> }> {
  const runStartedAt = Date.now();
  let runFinished = false;
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
    offersExcludedByRule: 0,
    unresolvedAliases: 0,
    aliasesSkippedByAi: 0,
    aiTasksQueued: 0,
    discoveryNetworkMs: 0,
    discoveryWooMs: 0,
    discoveryShopifyMs: 0,
    discoveryHtmlMs: 0,
    discoveryFirecrawlMs: 0,
    aliasDeterministicMs: 0,
    aliasAiMs: 0,
    dbPersistenceMs: 0
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
      offersExcludedByRule: 0,
      unresolvedAliases: 0,
      aliasesSkippedByAi: 0,
      aiTasksQueued: 0,
      discoveryNetworkMs: 0,
      discoveryWooMs: 0,
      discoveryShopifyMs: 0,
      discoveryHtmlMs: 0,
      discoveryFirecrawlMs: 0,
      aliasDeterministicMs: 0,
      aliasAiMs: 0,
      dbPersistenceMs: 0
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
    summary.offersExcludedByRule += delta.offersExcludedByRule;
    summary.unresolvedAliases += delta.unresolvedAliases;
    summary.aliasesSkippedByAi += delta.aliasesSkippedByAi;
    summary.aiTasksQueued += delta.aiTasksQueued;
    summary.discoveryNetworkMs += delta.discoveryNetworkMs;
    summary.discoveryWooMs += delta.discoveryWooMs;
    summary.discoveryShopifyMs += delta.discoveryShopifyMs;
    summary.discoveryHtmlMs += delta.discoveryHtmlMs;
    summary.discoveryFirecrawlMs += delta.discoveryFirecrawlMs;
    summary.aliasDeterministicMs += delta.aliasDeterministicMs;
    summary.aliasAiMs += delta.aliasAiMs;
    summary.dbPersistenceMs += delta.dbPersistenceMs;
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

    const retention = await pruneOperationalNoiseData({
      reviewQueueRetentionDays: env.REVIEW_QUEUE_RETENTION_DAYS,
      nonTrackableAliasRetentionDays: env.NON_TRACKABLE_ALIAS_RETENTION_DAYS
    });

    if (retention.reviewQueueDeleted > 0 || retention.nonTrackableAliasesDeleted > 0) {
      console.log(
        `[job:vendors] retention prune removed review_queue=${retention.reviewQueueDeleted}, non_trackable_aliases=${retention.nonTrackableAliasesDeleted}`
      );

      await recordScrapeEvent({
        scrapeRunId,
        vendorId: null,
        severity: "info",
        code: "RETENTION_PRUNE",
        message: "Pruned aged operational noise records",
        payload: {
          reviewQueueDeleted: retention.reviewQueueDeleted,
          nonTrackableAliasesDeleted: retention.nonTrackableAliasesDeleted,
          reviewQueueRetentionDays: env.REVIEW_QUEUE_RETENTION_DAYS,
          nonTrackableAliasRetentionDays: env.NON_TRACKABLE_ALIAS_RETENTION_DAYS
        }
      });

      await touchScrapeRunHeartbeat({
        scrapeRunId,
        patchSummary: {
          retentionReviewQueueDeleted: retention.reviewQueueDeleted,
          retentionNonTrackableAliasesDeleted: retention.nonTrackableAliasesDeleted
        }
      });
    }

    await pulseHeartbeat(true);

    const targets = input.vendorId ? await getVendorScrapeTargets(input.vendorId) : await getActiveScrapeTargets();
    const manualOfferExclusions = await loadManualOfferExclusions();
    if (manualOfferExclusions.rulesByProductUrl.size > 0) {
      console.log(
        `[job:vendors] loaded ${manualOfferExclusions.rulesByProductUrl.size} manual offer exclusion rule(s) from ${manualOfferExclusions.filePath}`
      );
    }

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
              offerExclusionsByProductUrl: manualOfferExclusions.rulesByProductUrl,
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
        applyDiscoveryAttemptTiming(pageSummary, discovery.attempts);
        await withDbTiming(pageSummary, () =>
          recordDiscoveryEvents({
            scrapeRunId,
            vendorId: target.vendorId,
            pageUrl: target.pageUrl,
            origin: discovery.origin,
            source: discovery.source,
            attempts: discovery.attempts
          })
        );

        if (offers.length === 0 && input.scrapeMode === "aggressive_manual") {
          offers = await scrapeWithPlaywright({
            vendorPageId: target.vendorPageId,
            vendorId: target.vendorId,
            pageUrl: target.pageUrl
          });
        }

        if (offers.length === 0) {
          const invalidPricingDiagnostic = discovery.diagnostics.find(
            (diagnostic) => diagnostic.code === "INVALID_PRICING_PAYLOAD"
          );
          const aiTaskReason = invalidPricingDiagnostic ? "invalid_pricing_payload" : "empty_or_js_rendered";
          const noOffersReason = invalidPricingDiagnostic ? "invalid_pricing_payload" : "no_offers_found";
          const noOffersStatus = invalidPricingDiagnostic ? "no_data_invalid_pricing" : "no_data";
          const noOffersEventCode = invalidPricingDiagnostic ? "INVALID_PRICING_PAYLOAD" : "NO_OFFERS";
          const noOffersMessage = invalidPricingDiagnostic
            ? `Invalid pricing payload detected for ${target.pageUrl}`
            : `No offers parsed for ${target.pageUrl}`;

          pageStatus = invalidPricingDiagnostic ? "invalid_pricing_payload" : "no_offers";
          const taskId = await withDbTiming(pageSummary, () =>
            createAiAgentTask({
              vendorId: target.vendorId,
              pageUrl: target.pageUrl,
              reason: aiTaskReason,
              scrapeRunId,
              requestedBy: input.triggeredBy
            })
          );

          pageSummary.aiTasksQueued += 1;
          pageSummary.pagesFailed += 1;

          await withDbTiming(pageSummary, () =>
            createReviewQueueItem({
              type: "parse_failure",
              vendorId: target.vendorId,
              pageUrl: target.pageUrl,
              payload: {
                taskId,
                reason: noOffersReason,
                diagnosticCode: invalidPricingDiagnostic?.code ?? null
              }
            })
          );

          await withDbTiming(pageSummary, () =>
            markVendorPageScrape({
              vendorPageId: target.vendorPageId,
              status: noOffersStatus
            })
          );

          await withDbTiming(pageSummary, () =>
            recordScrapeEvent({
              scrapeRunId,
              vendorId: target.vendorId,
              severity: "warn",
              code: noOffersEventCode,
              message: noOffersMessage,
              payload: invalidPricingDiagnostic
                ? {
                    taskId,
                    source: invalidPricingDiagnostic.source,
                    pageUrl: target.pageUrl,
                    diagnostic: invalidPricingDiagnostic
                  }
                : {
                    taskId
                  }
            })
          );

          return;
        }

        const isApiSource = isApiDiscoverySource(discovery.source);
        if (isApiSource && discovery.origin) {
          const originKey = `${target.vendorId}::${discovery.source}::${discovery.origin}`;
          if (persistedApiOrigins.has(originKey)) {
            await withDbTiming(pageSummary, () => updateVendorLastSeen(target.vendorId));
            await withDbTiming(pageSummary, () =>
              markVendorPageScrape({
                vendorPageId: target.vendorPageId,
                status: "success"
              })
            );

            await withDbTiming(pageSummary, () =>
              recordScrapeEvent({
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
              })
            );

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
          offerExclusionsByProductUrl: manualOfferExclusions.rulesByProductUrl,
          onProgress: markProgress
        });

        await withDbTiming(pageSummary, () => updateVendorLastSeen(target.vendorId));
        await withDbTiming(pageSummary, () =>
          markVendorPageScrape({
            vendorPageId: target.vendorPageId,
            status: "success"
          })
        );

        pageStatus = "success";
        pageSummary.pagesSuccess += 1;
      } catch (error) {
        pageStatus = "failed";
        pageSummary.pagesFailed += 1;

        await withDbTiming(pageSummary, () =>
          markVendorPageScrape({
            vendorPageId: target.vendorPageId,
            status: "failed"
          })
        );

        await withDbTiming(pageSummary, () =>
          recordScrapeEvent({
            scrapeRunId,
            vendorId: target.vendorId,
            severity: "error",
            code: "SCRAPE_PAGE_ERROR",
            message: `Vendor page scrape failed: ${target.pageUrl}`,
            payload: {
              error: error instanceof Error ? error.message : "unknown"
            }
          })
        );
      } finally {
        mergeCounterSummary(pageSummary);
        markProgress();

        const pageDuration = formatDurationMs(Date.now() - pageStartedAt);

        console.log(
          `[job:vendors] [${index + 1}/${targets.length}] ${pageStatus} in ${pageDuration} (created=${pageSummary.offersCreated}, updated=${pageSummary.offersUpdated}, unchanged=${pageSummary.offersUnchanged}, excludedByRule=${pageSummary.offersExcludedByRule}, unresolved=${pageSummary.unresolvedAliases}, skippedByAi=${pageSummary.aliasesSkippedByAi}, aiQueued=${pageSummary.aiTasksQueued}, failed=${pageSummary.pagesFailed}, policyBlocked=${pageSummary.policyBlocked}, discoveryWait=${formatDurationMs(pageSummary.discoveryNetworkMs)}, aliasDet=${formatDurationMs(pageSummary.aliasDeterministicMs)}, aliasAi=${formatDurationMs(pageSummary.aliasAiMs)}, dbPersist=${formatDurationMs(pageSummary.dbPersistenceMs)})`
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

    const qualityGuardrails = input.vendorId
      ? null
      : await evaluateQualityGuardrails({
          scrapeRunId,
          summary
        });
    const statusBase = summarizeStatus({
      failures: summary.pagesFailed,
      policyBlocked: summary.policyBlocked
    });
    const qualityCriticalFailureCount = qualityGuardrails?.criticalFailures.length ?? 0;
    const status: ScrapeStatus = qualityCriticalFailureCount > 0 ? "failed" : statusBase;
    const runSummary = {
      ...summary,
      qualityGuardrails:
        qualityGuardrails ??
        {
          evaluatedAt: new Date().toISOString(),
          skipped: true,
          reason: "vendor_scoped_run"
        }
    } as unknown as Record<string, unknown>;

    await finishScrapeRun({
      scrapeRunId,
      status,
      summary: runSummary
    });
    runFinished = true;

    console.log(
      `[job:vendors] run ${scrapeRunId} completed in ${formatDurationMs(Date.now() - runStartedAt)} with status=${status}`
    );
    console.log(
      `[job:vendors] run ${scrapeRunId} timing (discovery=${formatDurationMs(summary.discoveryNetworkMs)} woo=${formatDurationMs(summary.discoveryWooMs)} shopify=${formatDurationMs(summary.discoveryShopifyMs)} html=${formatDurationMs(summary.discoveryHtmlMs)} firecrawl=${formatDurationMs(summary.discoveryFirecrawlMs)} aliasDet=${formatDurationMs(summary.aliasDeterministicMs)} aliasAi=${formatDurationMs(summary.aliasAiMs)} dbPersist=${formatDurationMs(summary.dbPersistenceMs)})`
    );
    if (qualityGuardrails && qualityGuardrails.criticalFailures.length > 0) {
      console.error(
        `[job:vendors] run ${scrapeRunId} failed quality guardrails: ${qualityGuardrails.criticalFailures.join(" | ")}`
      );
      throw new Error(`Vendor quality guardrails failed (${qualityGuardrails.criticalFailures.length} critical checks)`);
    }

    return { scrapeRunId, summary: runSummary };
  } catch (error) {
    if (!runFinished) {
      await finishScrapeRun({
        scrapeRunId,
        status: "failed",
        summary: {
          ...summary,
          fatalError: error instanceof Error ? error.message : "unknown"
        }
      });
      runFinished = true;
    }

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
