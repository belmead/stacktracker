import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { markReviewIgnored, markReviewResolvedWithCompound, resolveCompoundAlias } from "@/lib/db/mutations";

const PROGRESS_LOG_EVERY = 10;

interface ReviewRow {
  id: string;
  rawText: string | null;
  pageUrl: string | null;
  payload: Record<string, unknown> | null;
  vendorName: string | null;
}

type ReviewOutcome = "resolved" | "ignored" | "leftOpen";

function payloadProductName(payload: Record<string, unknown> | null): string | null {
  const value = payload?.productName;
  return typeof value === "string" ? value : null;
}

function truncate(value: string, max = 80): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

async function run(): Promise<void> {
  const startedAtMs = Date.now();
  const rows = await sql<ReviewRow[]>`
    select
      rq.id,
      rq.raw_text as "rawText",
      rq.page_url as "pageUrl",
      rq.payload,
      v.name as "vendorName"
    from review_queue rq
    left join vendors v on v.id = rq.vendor_id
    where rq.queue_type = 'alias_match'
      and rq.status in ('open', 'in_progress')
    order by rq.created_at asc
  `;

  let resolved = 0;
  let ignored = 0;
  let leftOpen = 0;
  console.log(
    `[job:review-ai] scanning ${rows.length} open alias review item(s) (logging every ${PROGRESS_LOG_EVERY} item(s))`
  );

  for (const [index, row] of rows.entries()) {
    const productName = payloadProductName(row.payload) ?? row.rawText ?? "";
    const rawName = row.rawText ?? productName;

    const resolution = await resolveCompoundAlias({
      rawName,
      productName,
      productUrl: row.pageUrl ?? "",
      vendorName: row.vendorName ?? ""
    });

    let outcome: ReviewOutcome = "leftOpen";

    if (resolution.compoundId) {
      await markReviewResolvedWithCompound({
        reviewId: row.id,
        compoundId: resolution.compoundId,
        actorEmail: env.ADMIN_EMAIL
      });
      resolved += 1;
      outcome = "resolved";
    } else if (resolution.skipReview) {
      await markReviewIgnored({
        reviewId: row.id,
        actorEmail: env.ADMIN_EMAIL
      });
      ignored += 1;
      outcome = "ignored";
    } else {
      leftOpen += 1;
    }

    if ((index + 1) % PROGRESS_LOG_EVERY === 0 || index + 1 === rows.length) {
      const processed = index + 1;
      const elapsedSeconds = Math.max(0.001, (Date.now() - startedAtMs) / 1000);
      const itemsPerMinute = (processed / elapsedSeconds) * 60;
      const secondsPerItem = elapsedSeconds / processed;
      const remaining = rows.length - processed;
      const etaSeconds = remaining * secondsPerItem;
      const percent = rows.length > 0 ? (processed / rows.length) * 100 : 100;
      const vendorPreview = truncate(row.vendorName ?? "unknown", 40);
      const aliasPreview = truncate(rawName, 80);

      console.log(
        `[job:review-ai] progress ${processed}/${rows.length} (${percent.toFixed(1)}%) ` +
          `elapsed=${formatDuration(elapsedSeconds)} rate=${itemsPerMinute.toFixed(2)} items/min ` +
          `eta=${formatDuration(etaSeconds)} resolved=${resolved} ignored=${ignored} leftOpen=${leftOpen} ` +
          `lastOutcome=${outcome} lastReason=${resolution.reason} vendor="${vendorPreview}" alias="${aliasPreview}"`
      );
    }
  }

  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAtMs) / 1000);
  const itemsScanned = rows.length;

  console.log(
    JSON.stringify(
      {
        itemsScanned,
        resolved,
        ignored,
        leftOpen,
        durationSeconds: Number(elapsedSeconds.toFixed(2)),
        itemsPerMinute: Number(((itemsScanned / elapsedSeconds) * 60).toFixed(2)),
        secondsPerItem: Number((elapsedSeconds / Math.max(1, itemsScanned)).toFixed(2))
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
