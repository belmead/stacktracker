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
});
