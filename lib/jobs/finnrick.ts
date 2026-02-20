import * as cheerio from "cheerio";

import { sendAdminAlert } from "@/lib/alerts";
import { listVendorsForRatingSync, upsertFinnrickRating } from "@/lib/db/mutations";
import { createScrapeRun, finishScrapeRun, reconcileStaleScrapeRuns, recordScrapeEvent, touchScrapeRunHeartbeat } from "@/lib/db/queries";
import { env } from "@/lib/env";

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseFinnrickRatingRange(rawValue: string): string | null {
  const trimmed = rawValue.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (/^[A-Z]$/i.test(compact)) {
    return compact.toUpperCase();
  }

  const compactRangeMatch = compact.match(/^to([A-Z])([A-Z])$/i) ?? compact.match(/^([A-Z])to([A-Z])$/i);
  if (compactRangeMatch) {
    const start = (compactRangeMatch[1] ?? "").toUpperCase();
    const end = (compactRangeMatch[2] ?? "").toUpperCase();
    if (start && end) {
      return `${start} to ${end}`;
    }
  }

  const spacedRangeMatch = trimmed.match(/^([A-Z])\s*(?:to|-)\s*([A-Z])$/i);
  if (spacedRangeMatch) {
    const start = (spacedRangeMatch[1] ?? "").toUpperCase();
    const end = (spacedRangeMatch[2] ?? "").toUpperCase();
    if (start && end) {
      return `${start} to ${end}`;
    }
  }

  if (/^n\/?a$/i.test(compact)) {
    return "N/A";
  }

  return trimmed;
}

export function parseFinnrickRows(html: string): Array<{ vendorName: string; rating: number | null; ratingLabel: string | null }> {
  const $ = cheerio.load(html);
  const rows: Array<{ vendorName: string; rating: number | null; ratingLabel: string | null }> = [];

  $("table tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());

    if (cells.length === 0) {
      return;
    }

    const compactCells = cells.filter((value) => value.length > 0);
    const vendorName = cells[1] || compactCells[0] || "";
    if (!vendorName || vendorName.length < 2) {
      return;
    }

    const rawRatingRange = cells[2] || compactCells[1] || "";
    const ratingLabel = parseFinnrickRatingRange(rawRatingRange) ?? "N/A";

    rows.push({ vendorName, rating: null, ratingLabel });
  });

  return rows;
}

async function sendAdminAlertWithTimeout(subject: string, html: string): Promise<void> {
  const timeoutMs = 12_000;
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([sendAdminAlert(subject, html), timeoutPromise]);
  } catch (error) {
    console.warn("[job:finnrick] failed to send admin alert", {
      subject,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

export async function runFinnrickSyncJob(): Promise<{ scrapeRunId: string; summary: Record<string, unknown> }> {
  const runStartedAt = Date.now();
  const scrapeRunId = await createScrapeRun({
    jobType: "finnrick",
    runMode: "scheduled",
    scrapeMode: "safe",
    triggeredBy: "system"
  });

  const summary = {
    vendorsTotal: 0,
    vendorsMatched: 0,
    ratingsUpdated: 0,
    notFound: 0
  };
  const heartbeatIntervalMs = env.SCRAPE_RUN_HEARTBEAT_SECONDS * 1000;
  const lagAlertThresholdMs = env.SCRAPE_RUN_LAG_ALERT_SECONDS * 1000;
  let lastProgressAt = Date.now();
  let heartbeatInFlight = false;
  let lagAlertSent = false;

  const heartbeatTimer = setInterval(() => {
    void pulseHeartbeat();
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  function markProgress(): void {
    lastProgressAt = Date.now();
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
          message: `Finnrick sync lag exceeded ${env.SCRAPE_RUN_LAG_ALERT_SECONDS}s`,
          payload: {
            lagMs,
            lagSeconds: Math.round(lagMs / 1000)
          }
        });

        await sendAdminAlertWithTimeout(
          "Stack Tracker Finnrick run lag detected",
          `<p>Run ID: ${scrapeRunId}</p><p>Lag: ${Math.round(lagMs / 1000)}s</p>`
        );
      } else if (lagMs < lagAlertThresholdMs) {
        lagAlertSent = false;
      }
    } catch (error) {
      console.warn("[job:finnrick] heartbeat update failed", {
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
      reason: "finnrick_stale_reconciler",
      jobType: "finnrick",
      excludeScrapeRunId: scrapeRunId
    });

    if (staleRuns.length > 0) {
      const staleRunIds = staleRuns.map((run) => run.id);
      console.warn(
        `[job:finnrick] reconciled ${staleRuns.length} stale run(s): ${staleRunIds.join(", ")}`
      );

      await recordScrapeEvent({
        scrapeRunId,
        vendorId: null,
        severity: "warn",
        code: "STALE_RUN_RECONCILED",
        message: `Marked ${staleRuns.length} stale Finnrick run(s) as failed`,
        payload: {
          staleTtlMinutes: env.SCRAPE_RUN_STALE_TTL_MINUTES,
          staleRunIds
        }
      });
    }

    await pulseHeartbeat(true);

    const response = await fetch(env.FINNRICK_VENDORS_URL, {
      headers: {
        "user-agent": env.SCRAPER_USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`Finnrick fetch failed with HTTP ${response.status}`);
    }

    const html = await response.text();
    const parsedRows = parseFinnrickRows(html);
    const byName = new Map(parsedRows.map((row) => [normalizeName(row.vendorName), row]));

    const vendors = await listVendorsForRatingSync();
    summary.vendorsTotal = vendors.length;
    markProgress();
    await pulseHeartbeat(true);

    for (const vendor of vendors) {
      markProgress();
      const normalizedVendor = normalizeName(vendor.name);
      const row = byName.get(normalizedVendor);

      if (!row) {
        summary.notFound += 1;

        await upsertFinnrickRating({
          vendorId: vendor.id,
          rating: null,
          ratingLabel: "N/A",
          sourceUrl: env.FINNRICK_VENDORS_URL,
          scrapeRunId
        });

        continue;
      }

      summary.vendorsMatched += 1;
      summary.ratingsUpdated += 1;

      await upsertFinnrickRating({
        vendorId: vendor.id,
        rating: row.rating,
        ratingLabel: row.ratingLabel,
        sourceUrl: env.FINNRICK_VENDORS_URL,
        scrapeRunId
      });
    }

    await finishScrapeRun({
      scrapeRunId,
      status: "success",
      summary
    });

    console.log(
      `[job:finnrick] run ${scrapeRunId} completed in ${Math.round((Date.now() - runStartedAt) / 1000)}s`
    );

    return { scrapeRunId, summary };
  } catch (error) {
    const errorMessage =
      error instanceof Error && error.name === "TimeoutError"
        ? `Finnrick fetch timed out after 30s (${env.FINNRICK_VENDORS_URL})`
        : error instanceof Error
          ? error.message
          : "unknown";

    await recordScrapeEvent({
      scrapeRunId,
      vendorId: null,
      severity: "error",
      code: "FINNRICK_SYNC_FAILED",
      message: "Finnrick sync failed",
      payload: {
        error: errorMessage
      }
    });

    await finishScrapeRun({
      scrapeRunId,
      status: "failed",
      summary: {
        ...summary,
        error: errorMessage
      }
    });

    await sendAdminAlertWithTimeout(
      "Stack Tracker Finnrick sync failed",
      `<p>The Finnrick ratings sync failed.</p><p>Error: ${errorMessage}</p>`
    );

    throw new Error(errorMessage);
  } finally {
    clearInterval(heartbeatTimer);
    await pulseHeartbeat(true);
  }
}
