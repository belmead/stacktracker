import { chromium } from "playwright";

import { env } from "@/lib/env";
import { extractOffersFromHtml } from "@/lib/scraping/extractors";
import type { ExtractedOffer } from "@/lib/types";

export async function scrapeWithPlaywright(input: {
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
}): Promise<ExtractedOffer[]> {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext({
      userAgent: env.SCRAPER_USER_AGENT,
      viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();
    await page.goto(input.pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.waitForTimeout(4_000);

    const html = await page.content();

    return extractOffersFromHtml({
      html,
      vendorPageId: input.vendorPageId,
      vendorId: input.vendorId,
      pageUrl: input.pageUrl
    });
  } finally {
    await browser.close();
  }
}
