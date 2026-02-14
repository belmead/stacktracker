import { describe, expect, it } from "vitest";

import { extractOffersFromHtml } from "@/lib/scraping/extractors";

describe("extractOffersFromHtml", () => {
  it("extracts product offers from schema.org JSON-LD", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              "itemListElement": [
                {
                  "@type": "Product",
                  "name": "BPC-157 10mg Vial",
                  "url": "https://example.test/products/bpc-157-10mg",
                  "offers": {
                    "@type": "Offer",
                    "priceCurrency": "USD",
                    "price": "75.00",
                    "availability": "https://schema.org/InStock"
                  }
                }
              ]
            }
          </script>
        </head>
        <body>
          <a href="/cart">Add to cart</a>
        </body>
      </html>
    `;

    const offers = extractOffersFromHtml({
      html,
      vendorPageId: "page-1",
      vendorId: "vendor-1",
      pageUrl: "https://example.test/shop"
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("BPC-157 10mg Vial");
    expect(offers[0]?.productUrl).toBe("https://example.test/products/bpc-157-10mg");
    expect(offers[0]?.listPriceCents).toBe(7500);
    expect(offers[0]?.rawPayload?.extractor).toBe("json_ld");
  });
});
