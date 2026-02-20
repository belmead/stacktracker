import {
  getPendingManualScrapes,
  markScrapeRequestStatus,
  saveScrapeRequestCompletion,
  saveScrapeRequestFailure
} from "@/lib/db/mutations";
import { runVendorScrapeJob } from "@/lib/scraping/worker";

export async function runVendorScheduledCycle(): Promise<{
  manualProcessed: number;
  manualFailed: number;
  scheduled: { scrapeRunId: string; summary: Record<string, unknown> };
}> {
  const pending = await getPendingManualScrapes();

  let manualProcessed = 0;
  let manualFailed = 0;

  for (const request of pending) {
    try {
      await markScrapeRequestStatus({ id: request.id, status: "processing" });

      const run = await runVendorScrapeJob({
        runMode: "manual",
        scrapeMode: request.scrapeMode,
        triggeredBy: request.requestedBy,
        vendorId: request.vendorId
      });

      await saveScrapeRequestCompletion({
        requestId: request.id,
        scrapeRunId: run.scrapeRunId
      });

      manualProcessed += 1;
    } catch (error) {
      manualFailed += 1;
      await saveScrapeRequestFailure({
        requestId: request.id,
        message: error instanceof Error ? error.message : "manual scrape failed"
      });
    }
  }

  const scheduled = await runVendorScrapeJob({
    runMode: "scheduled",
    scrapeMode: "safe",
    triggeredBy: "system"
  });

  return {
    manualProcessed,
    manualFailed,
    scheduled
  };
}
