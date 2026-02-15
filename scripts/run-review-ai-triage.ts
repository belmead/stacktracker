import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { markReviewIgnored, markReviewResolvedWithCompound, resolveCompoundAlias } from "@/lib/db/mutations";

interface ReviewRow {
  id: string;
  rawText: string | null;
  pageUrl: string | null;
  payload: Record<string, unknown> | null;
  vendorName: string | null;
}

function payloadProductName(payload: Record<string, unknown> | null): string | null {
  const value = payload?.productName;
  return typeof value === "string" ? value : null;
}

async function run(): Promise<void> {
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
  console.log(`[job:review-ai] scanning ${rows.length} open alias review item(s)`);

  for (const [index, row] of rows.entries()) {
    const productName = payloadProductName(row.payload) ?? row.rawText ?? "";
    const rawName = row.rawText ?? productName;

    const resolution = await resolveCompoundAlias({
      rawName,
      productName,
      productUrl: row.pageUrl ?? "",
      vendorName: row.vendorName ?? ""
    });

    if (resolution.compoundId) {
      await markReviewResolvedWithCompound({
        reviewId: row.id,
        compoundId: resolution.compoundId,
        actorEmail: env.ADMIN_EMAIL
      });
      resolved += 1;
      continue;
    }

    if (resolution.skipReview) {
      await markReviewIgnored({
        reviewId: row.id,
        actorEmail: env.ADMIN_EMAIL
      });
      ignored += 1;
      continue;
    }

    leftOpen += 1;

    if ((index + 1) % 25 === 0 || index + 1 === rows.length) {
      console.log(
        `[job:review-ai] progress ${index + 1}/${rows.length} (resolved=${resolved}, ignored=${ignored}, leftOpen=${leftOpen})`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        itemsScanned: rows.length,
        resolved,
        ignored,
        leftOpen
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
