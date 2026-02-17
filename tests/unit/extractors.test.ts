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

  it("extracts product offers from Inertia data-page payloads", () => {
    const payload = {
      component: "Shop/Home",
      props: {
        products: [
          {
            name: "BPC-157",
            slug: "bpc-157",
            variants: [
              {
                id: 11,
                amount: "10.00",
                unit: "mg",
                price: "75.00",
                sold_out: 0,
                num_available: 12
              }
            ]
          }
        ]
      }
    };

    const dataPage = JSON.stringify(payload).replace(/"/g, "&quot;");
    const html = `
      <html>
        <body>
          <div id="app" data-page="${dataPage}"></div>
        </body>
      </html>
    `;

    const offers = extractOffersFromHtml({
      html,
      vendorPageId: "page-1",
      vendorId: "vendor-1",
      pageUrl: "https://example.test"
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("BPC-157 10mg");
    expect(offers[0]?.productUrl).toBe("https://example.test/products/bpc-157?variant=11");
    expect(offers[0]?.listPriceCents).toBe(7500);
    expect(offers[0]?.rawPayload?.extractor).toBe("inertia_data_page");
  });

  it("extracts product offers from Wix warmup data payloads", () => {
    const warmupData = {
      appsWarmupData: {
        stores: {
          widget: {
            catalog: {
              category: {
                productsWithMetaData: {
                  list: [
                    {
                      name: "Tirz 30mg",
                      price: 70,
                      urlPart: "tirz-30",
                      isInStock: true,
                      productType: "physical"
                    }
                  ]
                }
              }
            }
          }
        }
      }
    };

    const html = `
      <html>
        <body>
          <script type="application/json" id="wix-warmup-data">${JSON.stringify(warmupData)}</script>
        </body>
      </html>
    `;

    const offers = extractOffersFromHtml({
      html,
      vendorPageId: "page-2",
      vendorId: "vendor-2",
      pageUrl: "https://example.test"
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("Tirz 30mg");
    expect(offers[0]?.productUrl).toBe("https://example.test/product-page/tirz-30");
    expect(offers[0]?.listPriceCents).toBe(7000);
    expect(offers[0]?.rawPayload?.extractor).toBe("wix_warmup_data");
  });

  it("extracts PrestaShop-style product tiles", () => {
    const html = `
      <html>
        <body>
          <ul class="product_list grid row">
            <li class="ajax_block_product col-xs-12 col-sm-6 col-lg-4">
              <div class="product-container">
                <h5 itemprop="name">
                  <a class="product-name" href="https://dragonpharmastore.com/peptides/982-bpc-157.html">BPC 157 5mg</a>
                </h5>
                <div class="content_price">
                  <span class="old-price product-price">$40</span>
                  <span class="price product-price">$30</span>
                </div>
                <a class="ajax_add_to_cart_button btn-red" href="https://dragonpharmastore.com/cart?add=1&id_product=982">Add to cart</a>
              </div>
            </li>
          </ul>
        </body>
      </html>
    `;

    const offers = extractOffersFromHtml({
      html,
      vendorPageId: "page-3",
      vendorId: "vendor-3",
      pageUrl: "https://dragonpharmastore.com/64-peptides"
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("BPC 157 5mg");
    expect(offers[0]?.productUrl).toBe("https://dragonpharmastore.com/peptides/982-bpc-157.html");
    expect(offers[0]?.listPriceCents).toBe(4000);
    expect(offers[0]?.rawPayload?.extractor).toBe("card_selector");
  });
});
