import { sql } from "@/lib/db/client";
import { getCompoundCoverageBySlugs, getRecentVendorRunSummaries, getTopCompoundCoverageSnapshot } from "@/lib/db/queries";
import { env } from "@/lib/env";
import {
  evaluateTopCompoundCoverageSmoke,
  getMissingSmokeCoverageSlugs,
  mergeCoverageSnapshots,
  parseTopCompoundCoverageSnapshotFromSummary,
  type TopCompoundCoverageSnapshot
} from "@/lib/scraping/quality-guardrails";

async function main(): Promise<void> {
  const currentRows = await getTopCompoundCoverageSnapshot({
    limit: env.TOP_COMPOUND_SMOKE_LIMIT
  });
  const current: TopCompoundCoverageSnapshot[] = currentRows.map((row) => ({
    compoundSlug: row.compoundSlug,
    compoundName: row.compoundName,
    vendorCount: row.vendorCount,
    offerCount: row.offerCount
  }));

  const runs = await getRecentVendorRunSummaries({
    limit: 25
  });

  let baseline: TopCompoundCoverageSnapshot[] | null = null;
  let baselineRunId: string | null = null;
  for (const run of runs) {
    const parsed = parseTopCompoundCoverageSnapshotFromSummary(run.summary);
    if (parsed) {
      baseline = parsed;
      baselineRunId = run.id;
      break;
    }
  }

  let smokeCurrentCoverage = current;
  const missingCoverageSlugs = getMissingSmokeCoverageSlugs({
    current: smokeCurrentCoverage,
    previous: baseline,
    minBaselineVendorCount: env.TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS
  });
  if (missingCoverageSlugs.length > 0) {
    const supplementalRows = await getCompoundCoverageBySlugs({
      compoundSlugs: missingCoverageSlugs
    });
    const supplementalCoverage: TopCompoundCoverageSnapshot[] = supplementalRows.map((row) => ({
      compoundSlug: row.compoundSlug,
      compoundName: row.compoundName,
      vendorCount: row.vendorCount,
      offerCount: row.offerCount
    }));
    smokeCurrentCoverage = mergeCoverageSnapshots({
      primary: smokeCurrentCoverage,
      supplemental: supplementalCoverage
    });
  }

  const result = evaluateTopCompoundCoverageSmoke({
    config: {
      maxVendorDropPct: env.TOP_COMPOUND_SMOKE_MAX_VENDOR_DROP_PCT,
      minBaselineVendorCount: env.TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS
    },
    current: smokeCurrentCoverage,
    previous: baseline
  });

  console.log(
    JSON.stringify(
      {
        status: result.status,
        reason: result.reason,
        comparedCompounds: result.comparedCompounds,
        failureCount: result.failures.length,
        baselineRunId,
        config: {
          topCompoundSmokeLimit: env.TOP_COMPOUND_SMOKE_LIMIT,
          topCompoundSmokeMinBaselineVendors: env.TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS,
          topCompoundSmokeMaxVendorDropPct: env.TOP_COMPOUND_SMOKE_MAX_VENDOR_DROP_PCT
        },
        failures: result.failures
      },
      null,
      2
    )
  );

  if (result.status === "fail") {
    throw new Error(`Top-compound smoke test failed (${result.failures.length} compounds below expected coverage)`);
  }
}

async function shutdown(): Promise<void> {
  await sql.end({ timeout: 5 }).catch(() => {});
}

main()
  .then(async () => {
    await shutdown();
  })
  .catch(async (error) => {
    console.error(error);
    await shutdown();
    process.exit(1);
  });
