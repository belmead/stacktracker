import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/test";
process.env.ADMIN_EMAIL ??= "stacktracker@proton.me";
process.env.ADMIN_AUTH_SECRET ??= "1234567890123456";
process.env.CRON_SECRET ??= "1234567890123456";

describe("buildAliasReviewAlertHtml", () => {
  it("summarizes unresolved aliases with a bounded preview", async () => {
    const { buildAliasReviewAlertHtml } = await import("@/lib/scraping/worker");

    const unresolved = Array.from({ length: 30 }, (_, index) => ({
      alias: `Alias ${index + 1}`,
      productName: `Product ${index + 1}`,
      reviewId: `rq_${index + 1}`
    }));

    const html = buildAliasReviewAlertHtml({
      vendorName: "Vendor & Co <Test>",
      unresolved
    });

    expect(html).toContain("Unresolved aliases in this scrape page: 30");
    expect(html).toContain("Additional unresolved aliases not listed: 5");
    expect(html).toContain("Vendor &amp; Co &lt;Test&gt;");
    expect((html.match(/Review Queue ID:/g) ?? []).length).toBe(25);
  });
});
