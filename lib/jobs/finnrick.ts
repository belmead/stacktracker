import * as cheerio from "cheerio";

import { sendAdminAlert } from "@/lib/alerts";
import { listVendorsForRatingSync, upsertFinnrickRating } from "@/lib/db/mutations";
import { createScrapeRun, finishScrapeRun, recordScrapeEvent } from "@/lib/db/queries";
import { env } from "@/lib/env";

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractRating(input: string): number | null {
  const match = input.match(/(\d(?:\.\d+)?)(?:\s*\/\s*5)?/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 5) {
    return null;
  }

  return value;
}

function parseFinnrickRows(html: string): Array<{ vendorName: string; rating: number | null; ratingLabel: string | null }> {
  const $ = cheerio.load(html);
  const rows: Array<{ vendorName: string; rating: number | null; ratingLabel: string | null }> = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (cells.length === 0) {
      return;
    }

    const vendorName = cells[0];
    if (!vendorName || vendorName.length < 2) {
      return;
    }

    const joined = cells.join(" ");
    const rating = extractRating(joined);
    const ratingLabel = rating === null ? "N/A" : `${rating}/5`;

    rows.push({ vendorName, rating, ratingLabel });
  });

  return rows;
}

export async function runFinnrickSyncJob(): Promise<{ scrapeRunId: string; summary: Record<string, unknown> }> {
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

  try {
    const response = await fetch(env.FINNRICK_VENDORS_URL, {
      headers: {
        "user-agent": env.SCRAPER_USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Finnrick fetch failed with HTTP ${response.status}`);
    }

    const html = await response.text();
    const parsedRows = parseFinnrickRows(html);
    const byName = new Map(parsedRows.map((row) => [normalizeName(row.vendorName), row]));

    const vendors = await listVendorsForRatingSync();
    summary.vendorsTotal = vendors.length;

    for (const vendor of vendors) {
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

    return { scrapeRunId, summary };
  } catch (error) {
    await recordScrapeEvent({
      scrapeRunId,
      vendorId: null,
      severity: "error",
      code: "FINNRICK_SYNC_FAILED",
      message: "Finnrick sync failed",
      payload: {
        error: error instanceof Error ? error.message : "unknown"
      }
    });

    await finishScrapeRun({
      scrapeRunId,
      status: "failed",
      summary: {
        ...summary,
        error: error instanceof Error ? error.message : "unknown"
      }
    });

    await sendAdminAlert(
      "Stack Tracker Finnrick sync failed",
      `<p>The Finnrick ratings sync failed.</p><p>Error: ${error instanceof Error ? error.message : "unknown"}</p>`
    );

    throw error;
  }
}
