import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/test";
process.env.ADMIN_EMAIL ??= "stacktracker@proton.me";
process.env.ADMIN_AUTH_SECRET ??= "1234567890123456";
process.env.CRON_SECRET ??= "1234567890123456";

interface DiscoveryTarget {
  vendorPageId: string;
  vendorId: string;
  vendorName: string;
  websiteUrl: string;
  pageUrl: string;
}

const TARGET: DiscoveryTarget = {
  vendorPageId: "vp_1",
  vendorId: "v_1",
  vendorName: "Vendor",
  websiteUrl: "https://example.test",
  pageUrl: "https://example.test/shop"
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("offersFromWooCommercePayload", () => {
  it("extracts offers from WooCommerce Store API payload", async () => {
    const { offersFromWooCommercePayload } = await import("@/lib/scraping/discovery");

    const payload = [
      {
        name: "BPC-157 10mg Vial",
        permalink: "https://example.test/product/bpc-157-10mg",
        prices: {
          currency_minor_unit: 2,
          price: "7500"
        },
        stock_status: "instock"
      }
    ];

    const offers = offersFromWooCommercePayload({
      payload,
      target: TARGET
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("BPC-157 10mg Vial");
    expect(offers[0]?.listPriceCents).toBe(7500);
    expect(offers[0]?.productUrl).toBe("https://example.test/product/bpc-157-10mg");
    expect(offers[0]?.rawPayload?.extractor).toBe("woocommerce_store_api");
  });

  it("prefers displayed sale price from price_html when numeric Woo fields are stale", async () => {
    const { offersFromWooCommercePayload } = await import("@/lib/scraping/discovery");

    const payload = [
      {
        name: "S 20MG",
        permalink: "https://example.test/product/s-20mg",
        prices: {
          currency_minor_unit: 2,
          price: "11999",
          regular_price: "11999",
          sale_price: "11999"
        },
        price_html:
          '<del><span class="woocommerce-Price-amount amount"><span class="woocommerce-Price-currencySymbol">&#036;</span>119.99</span></del> <ins><span class="woocommerce-Price-amount amount"><span class="woocommerce-Price-currencySymbol">&#036;</span>95.99</span></ins>',
        stock_status: "instock"
      }
    ];

    const offers = offersFromWooCommercePayload({
      payload,
      target: TARGET
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("S 20MG");
    expect(offers[0]?.listPriceCents).toBe(9599);
  });
});

describe("offersFromShopifyPayload", () => {
  it("extracts variant-level offers from Shopify products payload", async () => {
    const { offersFromShopifyPayload } = await import("@/lib/scraping/discovery");

    const payload = {
      products: [
        {
          title: "BPC-157",
          handle: "bpc-157",
          variants: [
            {
              id: 1234,
              title: "10mg Vial",
              price: "75.00",
              available: true
            }
          ]
        }
      ]
    };

    const offers = offersFromShopifyPayload({
      payload,
      target: TARGET
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]?.productName).toBe("BPC-157 10mg Vial");
    expect(offers[0]?.listPriceCents).toBe(7500);
    expect(offers[0]?.productUrl).toBe("https://example.test/products/bpc-157?variant=1234");
    expect(offers[0]?.rawPayload?.extractor).toBe("shopify_products_api");
  });
});

describe("discoverOffers", () => {
  it("reuses cached WooCommerce API payloads for the same origin", async () => {
    const { createDiscoveryCache, discoverOffers } = await import("@/lib/scraping/discovery");
    const cache = createDiscoveryCache();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wp-json/wc/store/v1/products")) {
        return new Response(
          JSON.stringify([
            {
              name: "BPC-157 10mg Vial",
              permalink: "https://example.test/product/bpc-157-10mg",
              prices: {
                currency_minor_unit: 2,
                price: "7500"
              },
              stock_status: "instock"
            }
          ]),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const first = await discoverOffers({
      target: TARGET,
      fetchPageHtml: async () => "<html></html>",
      cache
    });

    const second = await discoverOffers({
      target: {
        ...TARGET,
        vendorPageId: "vp_2",
        pageUrl: "https://example.test/products"
      },
      fetchPageHtml: async () => "<html></html>",
      cache
    });

    expect(first.source).toBe("woocommerce_store_api");
    expect(first.origin).toBe("https://example.test");
    expect(second.source).toBe("woocommerce_store_api");
    expect(second.origin).toBe("https://example.test");
    expect(second.offers[0]?.vendorPageId).toBe("vp_2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches unsupported API origins to avoid repeated probes", async () => {
    const { createDiscoveryCache, discoverOffers } = await import("@/lib/scraping/discovery");
    const cache = createDiscoveryCache();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wp-json/wc/store/v1/products")) {
        return new Response("", { status: 404 });
      }

      if (url.includes("/products.json")) {
        return new Response("", { status: 404 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const first = await discoverOffers({
      target: TARGET,
      fetchPageHtml: async () => "<html></html>",
      cache
    });

    const second = await discoverOffers({
      target: {
        ...TARGET,
        vendorPageId: "vp_3",
        pageUrl: "https://example.test/collections/all"
      },
      fetchPageHtml: async () => "<html></html>",
      cache
    });

    expect(first.source).toBeNull();
    expect(second.source).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flags invalid Woo payload pricing when products exist but all prices are zero or empty", async () => {
    const { discoverOffers } = await import("@/lib/scraping/discovery");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wp-json/wc/store/v1/products")) {
        return new Response(
          JSON.stringify([
            {
              id: 101,
              name: "BPC-157 10mg",
              permalink: "https://example.test/product/bpc-157-10mg",
              prices: {
                currency_minor_unit: 2,
                price: "0",
                regular_price: "0",
                sale_price: ""
              }
            },
            {
              id: 202,
              name: "TB-500 10mg",
              permalink: "https://example.test/product/tb-500-10mg",
              prices: {
                currency_minor_unit: 2,
                price: "",
                regular_price: "0"
              }
            }
          ]),
          { status: 200 }
        );
      }

      if (url.includes("/products.json")) {
        return new Response("", { status: 404 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await discoverOffers({
      target: TARGET,
      fetchPageHtml: async () => ""
    });

    expect(result.source).toBeNull();
    expect(result.offers).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "INVALID_PRICING_PAYLOAD",
      source: "woocommerce_store_api",
      pageUrl: "https://example.test/shop",
      origin: "https://example.test",
      productCandidates: 2,
      candidatesWithPriceFields: 2,
      candidatesWithPositivePrice: 0,
      observedPriceFieldCounts: {
        price: 1,
        regular_price: 2,
        sale_price: 0
      }
    });
    expect(result.diagnostics[0]?.sampledProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "101",
          productName: "BPC-157 10mg",
          observedPriceFields: expect.objectContaining({
            price: "0",
            regular_price: "0"
          })
        })
      ])
    );
  });

  it("falls back to the vendor root HTML when the page target HTML is empty", async () => {
    const { discoverOffers } = await import("@/lib/scraping/discovery");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wp-json/wc/store/v1/products")) {
        return new Response("", { status: 404 });
      }

      if (url.includes("/products.json")) {
        return new Response("", { status: 404 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const fetchPageHtml = vi.fn(async (pageUrl: string) => {
      if (pageUrl === "https://example.test/products") {
        return "";
      }

      if (pageUrl === "https://example.test/") {
        return `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Product",
                  "name": "BPC-157 10mg",
                  "url": "https://example.test/products/bpc-157-10mg",
                  "offers": {
                    "@type": "Offer",
                    "price": "75.00",
                    "availability": "https://schema.org/InStock"
                  }
                }
              </script>
            </head>
            <body></body>
          </html>
        `;
      }

      throw new Error(`Unexpected html fetch url: ${pageUrl}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await discoverOffers({
      target: {
        ...TARGET,
        pageUrl: "https://example.test/products",
        websiteUrl: "https://example.test/"
      },
      fetchPageHtml
    });

    expect(result.source).toBe("html");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.productUrl).toBe("https://example.test/products/bpc-157-10mg");
    expect(fetchPageHtml).toHaveBeenCalledWith("https://example.test/products");
    expect(fetchPageHtml).toHaveBeenCalledWith("https://example.test/");
  });
});
