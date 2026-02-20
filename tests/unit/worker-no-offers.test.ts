import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/test";
process.env.ADMIN_EMAIL ??= "stacktracker@proton.me";
process.env.ADMIN_AUTH_SECRET ??= "1234567890123456";
process.env.CRON_SECRET ??= "1234567890123456";

const mockCreateReviewQueueItem = vi.fn();
const mockCreateScrapeRun = vi.fn();
const mockFinishScrapeRun = vi.fn();
const mockGetActiveScrapeTargets = vi.fn();
const mockGetVendorScrapeTargets = vi.fn();
const mockMarkVendorPageScrape = vi.fn();
const mockPruneOperationalNoiseData = vi.fn();
const mockReconcileStaleScrapeRuns = vi.fn();
const mockRecordScrapeEvent = vi.fn();
const mockShouldSuppressNetworkFilterBlockedParseFailure = vi.fn();
const mockTouchScrapeRunHeartbeat = vi.fn();

const mockCreateAiAgentTask = vi.fn();
const mockEnsureFormulation = vi.fn();
const mockMarkVendorOffersUnavailableByUrls = vi.fn();
const mockResolveCompoundAlias = vi.fn();
const mockUpdateAiAgentTask = vi.fn();
const mockUpdateOfferFromExtracted = vi.fn();
const mockUpdateVendorLastSeen = vi.fn();
const mockUpsertCompoundVariant = vi.fn();

const mockLoadManualOfferExclusions = vi.fn();
const mockCreateDiscoveryCache = vi.fn();
const mockDiscoverOffers = vi.fn();
const mockCheckRobotsPermission = vi.fn();
const mockScrapeWithPlaywright = vi.fn();
const mockSendAdminAlert = vi.fn();

vi.mock("@/lib/db/queries", () => ({
  createReviewQueueItem: mockCreateReviewQueueItem,
  createScrapeRun: mockCreateScrapeRun,
  finishScrapeRun: mockFinishScrapeRun,
  getActiveScrapeTargets: mockGetActiveScrapeTargets,
  getCompoundFormulationCoverageSnapshot: vi.fn(),
  getRecentVendorRunSummaries: vi.fn(),
  getTopCompoundCoverageSnapshot: vi.fn(),
  getVendorScrapeTargets: mockGetVendorScrapeTargets,
  markVendorPageScrape: mockMarkVendorPageScrape,
  pruneOperationalNoiseData: mockPruneOperationalNoiseData,
  reconcileStaleScrapeRuns: mockReconcileStaleScrapeRuns,
  recordScrapeEvent: mockRecordScrapeEvent,
  shouldSuppressNetworkFilterBlockedParseFailure: mockShouldSuppressNetworkFilterBlockedParseFailure,
  touchScrapeRunHeartbeat: mockTouchScrapeRunHeartbeat
}));

vi.mock("@/lib/db/mutations", () => ({
  createAiAgentTask: mockCreateAiAgentTask,
  ensureFormulation: mockEnsureFormulation,
  markVendorOffersUnavailableByUrls: mockMarkVendorOffersUnavailableByUrls,
  resolveCompoundAlias: mockResolveCompoundAlias,
  updateAiAgentTask: mockUpdateAiAgentTask,
  updateOfferFromExtracted: mockUpdateOfferFromExtracted,
  updateVendorLastSeen: mockUpdateVendorLastSeen,
  upsertCompoundVariant: mockUpsertCompoundVariant
}));

vi.mock("@/lib/exclusions/manual-offer-exclusions", () => ({
  loadManualOfferExclusions: mockLoadManualOfferExclusions
}));

vi.mock("@/lib/scraping/discovery", () => ({
  createDiscoveryCache: mockCreateDiscoveryCache,
  discoverOffers: mockDiscoverOffers
}));

vi.mock("@/lib/scraping/robots", () => ({
  checkRobotsPermission: mockCheckRobotsPermission
}));

vi.mock("@/lib/scraping/playwright-agent", () => ({
  scrapeWithPlaywright: mockScrapeWithPlaywright
}));

vi.mock("@/lib/alerts", () => ({
  sendAdminAlert: mockSendAdminAlert
}));

describe("runVendorScrapeJob no-offers diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockCreateScrapeRun.mockResolvedValue("run_1");
    mockFinishScrapeRun.mockResolvedValue(undefined);
    mockGetActiveScrapeTargets.mockResolvedValue([]);
    mockGetVendorScrapeTargets.mockResolvedValue([
      {
        vendorPageId: "vp_1",
        vendorId: "vendor_1",
        vendorName: "PeptiAtlas",
        websiteUrl: "https://peptiatlas.com/",
        pageUrl: "https://peptiatlas.com/",
        allowAggressive: false
      }
    ]);
    mockMarkVendorPageScrape.mockResolvedValue(undefined);
    mockPruneOperationalNoiseData.mockResolvedValue({
      reviewQueueDeleted: 0,
      nonTrackableAliasesDeleted: 0
    });
    mockReconcileStaleScrapeRuns.mockResolvedValue([]);
    mockRecordScrapeEvent.mockResolvedValue(undefined);
    mockShouldSuppressNetworkFilterBlockedParseFailure.mockResolvedValue(false);
    mockTouchScrapeRunHeartbeat.mockResolvedValue(undefined);

    mockCreateAiAgentTask.mockResolvedValue("task_1");
    mockCreateReviewQueueItem.mockResolvedValue("rq_1");
    mockEnsureFormulation.mockResolvedValue("formulation_1");
    mockMarkVendorOffersUnavailableByUrls.mockResolvedValue(0);
    mockResolveCompoundAlias.mockResolvedValue({
      compoundId: null,
      confidence: 0.4,
      status: "needs_review",
      aliasNormalized: "unknown",
      reason: "needs_review"
    });
    mockUpdateAiAgentTask.mockResolvedValue(undefined);
    mockUpdateOfferFromExtracted.mockResolvedValue("updated");
    mockUpdateVendorLastSeen.mockResolvedValue(undefined);
    mockUpsertCompoundVariant.mockResolvedValue("variant_1");

    mockLoadManualOfferExclusions.mockResolvedValue({
      generatedAt: "2026-02-16T00:00:00.000Z",
      filePath: "/tmp/manual-offer-exclusions.json",
      rulesByProductUrl: new Map()
    });
    mockCreateDiscoveryCache.mockReturnValue({
      apiResultsByOrigin: new Map(),
      unsupportedSourcesByOrigin: new Map()
    });
    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: [],
      diagnostics: []
    });
    mockCheckRobotsPermission.mockResolvedValue({
      allowed: true,
      reason: "allowed",
      robotsUrl: "https://peptiatlas.com/robots.txt"
    });
    mockScrapeWithPlaywright.mockResolvedValue([]);
    mockSendAdminAlert.mockResolvedValue(undefined);
  });

  it("emits INVALID_PRICING_PAYLOAD with diagnostic payload details", async () => {
    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: [],
      diagnostics: [
        {
          code: "INVALID_PRICING_PAYLOAD",
          source: "woocommerce_store_api",
          pageUrl: "https://peptiatlas.com/",
          origin: "https://peptiatlas.com",
          productsObserved: 5,
          productCandidates: 5,
          candidatesWithPriceFields: 5,
          candidatesWithPositivePrice: 0,
          observedPriceFieldCounts: {
            price: 5,
            regular_price: 5,
            sale_price: 0
          },
          sampledProducts: [
            {
              productId: "101",
              productName: "BPC-157 10mg",
              observedPriceFields: {
                price: "0",
                regular_price: "0",
                sale_price: null
              },
              parsedPriceCents: {
                price: 0,
                regular_price: 0,
                sale_price: null
              }
            }
          ]
        }
      ]
    });

    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "invalid_pricing_payload"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "invalid_pricing_payload",
          diagnosticCode: "INVALID_PRICING_PAYLOAD"
        })
      })
    );
    expect(mockMarkVendorPageScrape).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_data_invalid_pricing"
      })
    );

    const eventCodes = mockRecordScrapeEvent.mock.calls.map(([payload]) => payload.code);
    expect(eventCodes).toContain("INVALID_PRICING_PAYLOAD");
    expect(eventCodes).not.toContain("NO_OFFERS");

    const invalidPricingEvent = mockRecordScrapeEvent.mock.calls.find(
      ([payload]) => payload.code === "INVALID_PRICING_PAYLOAD"
    )?.[0];
    expect(invalidPricingEvent).toMatchObject({
      severity: "warn",
      vendorId: "vendor_1",
      payload: expect.objectContaining({
        taskId: "task_1",
        source: "woocommerce_store_api",
        pageUrl: "https://peptiatlas.com/"
      })
    });
  });

  it("preserves NO_OFFERS behavior for true empty/no-catalog pages", async () => {
    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "empty_or_js_rendered"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "no_offers_found"
        })
      })
    );
    expect(mockMarkVendorPageScrape).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_data"
      })
    );

    const eventCodes = mockRecordScrapeEvent.mock.calls.map(([payload]) => payload.code);
    expect(eventCodes).toContain("NO_OFFERS");
    expect(eventCodes).not.toContain("INVALID_PRICING_PAYLOAD");
  });

  it("classifies Cloudflare 403 safe-mode blocks with explicit parse-failure reason", async () => {
    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: [
        {
          source: "html",
          success: false,
          offers: 0,
          durationMs: 42,
          error: "HTTP 403 (cloudflare_challenge_safe_mode; cf-ray=test-ray)"
        }
      ],
      diagnostics: []
    });

    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "safe_mode_cloudflare_blocked"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "safe_mode_cloudflare_blocked",
          cloudflareBlocked: true
        })
      })
    );

    const noOffersEvent = mockRecordScrapeEvent.mock.calls.find(([payload]) => payload.code === "NO_OFFERS")?.[0];
    expect(noOffersEvent?.message).toContain("Cloudflare");
    expect(noOffersEvent?.payload).toMatchObject({
      cloudflareBlocked: true
    });
  });

  it("classifies non-Cloudflare safe-mode access blocks with generic reason and provider metadata", async () => {
    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: [
        {
          source: "html",
          success: false,
          offers: 0,
          durationMs: 44,
          error: "HTTP 403 (safe_mode_access_blocked; provider=imperva; status=403)"
        }
      ],
      diagnostics: []
    });

    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "safe_mode_access_blocked"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "safe_mode_access_blocked",
          safeModeBlocked: true,
          safeModeBlockProvider: "imperva",
          cloudflareBlocked: false
        })
      })
    );

    const noOffersEvent = mockRecordScrapeEvent.mock.calls.find(([payload]) => payload.code === "NO_OFFERS")?.[0];
    expect(noOffersEvent?.message).toContain("imperva");
    expect(noOffersEvent?.payload).toMatchObject({
      safeModeBlocked: true,
      safeModeBlockProvider: "imperva",
      cloudflareBlocked: false
    });
  });

  it("classifies repeated discovery transport failures as discovery_fetch_failed", async () => {
    const transportFailureAttempts = [
      {
        source: "woocommerce_store_api",
        success: false,
        offers: 0,
        durationMs: 41,
        error: "fetch failed | getaddrinfo ENOTFOUND example.test"
      },
      {
        source: "shopify_products_api",
        success: false,
        offers: 0,
        durationMs: 39,
        error: "fetch failed | getaddrinfo ENOTFOUND example.test"
      },
      {
        source: "html",
        success: false,
        offers: 0,
        durationMs: 22,
        error: "fetch failed | getaddrinfo ENOTFOUND example.test"
      }
    ];

    mockDiscoverOffers
      .mockResolvedValueOnce({
        offers: [],
        source: null,
        origin: null,
        attempts: transportFailureAttempts,
        diagnostics: []
      })
      .mockResolvedValueOnce({
        offers: [],
        source: null,
        origin: null,
        attempts: transportFailureAttempts,
        diagnostics: []
      });

    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockDiscoverOffers).toHaveBeenCalledTimes(2);
    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "discovery_fetch_failed"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "discovery_fetch_failed",
          discoveryFetchFailed: true,
          discoveryFetchFailedSources: [
            "woocommerce_store_api",
            "shopify_products_api",
            "html",
            "woocommerce_store_api",
            "shopify_products_api",
            "html"
          ]
        })
      })
    );
    expect(mockMarkVendorPageScrape).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_data_fetch_failed"
      })
    );
    expect(mockShouldSuppressNetworkFilterBlockedParseFailure).not.toHaveBeenCalled();

    const eventCodes = mockRecordScrapeEvent.mock.calls.map(([payload]) => payload.code);
    expect(eventCodes).toContain("DISCOVERY_FETCH_FAILED");
    expect(eventCodes).not.toContain("NO_OFFERS");
  });

  it("classifies network-filter blocked transport failures with dedicated reason and metadata", async () => {
    const transportFailureAttempts = [
      {
        source: "woocommerce_store_api",
        success: false,
        offers: 0,
        durationMs: 41,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      },
      {
        source: "shopify_products_api",
        success: false,
        offers: 0,
        durationMs: 39,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      },
      {
        source: "html",
        success: false,
        offers: 0,
        durationMs: 22,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      }
    ];

    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: transportFailureAttempts,
      diagnostics: []
    });

    const fetchProbe = vi.fn(async () => {
      return new Response("", {
        status: 302,
        headers: {
          location:
            "http://wired.meraki.com:8090/blocked.cgi?blocked_server=198.251.81.14:80&blocked_url=http%3A%2F%2Faminoasylumllc.com%2F&blocked_categories=bs_047"
        }
      });
    });

    vi.stubGlobal("fetch", fetchProbe);
    const envRef = process.env as Record<string, string | undefined>;
    const previousEnv = envRef.NODE_ENV;
    envRef.NODE_ENV = "development";

    try {
      const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
      await runVendorScrapeJob({
        runMode: "manual",
        scrapeMode: "safe",
        triggeredBy: "test",
        vendorId: "vendor_1"
      });
    } finally {
      envRef.NODE_ENV = previousEnv;
      vi.unstubAllGlobals();
    }

    expect(mockCreateAiAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "network_filter_blocked"
      })
    );
    expect(mockCreateReviewQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: "network_filter_blocked",
          networkFilterBlocked: true,
          networkFilterSignature: expect.any(String),
          networkFilterProvider: "meraki",
          networkFilterCategory: "bs_047",
          parseFailureQueueSuppressed: false
        })
      })
    );
    expect(mockShouldSuppressNetworkFilterBlockedParseFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: "vendor_1",
        pageUrl: "https://peptiatlas.com/",
        networkFilterSignature: expect.any(String)
      })
    );
    expect(mockMarkVendorPageScrape).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_data_network_filter_blocked"
      })
    );

    const eventCodes = mockRecordScrapeEvent.mock.calls.map(([payload]) => payload.code);
    expect(eventCodes).toContain("NETWORK_FILTER_BLOCKED");
    const blockedEvent = mockRecordScrapeEvent.mock.calls.find(([payload]) => payload.code === "NETWORK_FILTER_BLOCKED")?.[0];
    expect(blockedEvent?.payload).toMatchObject({
      networkFilterBlocked: true,
      networkFilterSignature: expect.any(String),
      parseFailureQueueSuppressed: false
    });
  });

  it("suppresses repeated identical network-filter parse-failure queue noise while keeping events", async () => {
    const transportFailureAttempts = [
      {
        source: "woocommerce_store_api",
        success: false,
        offers: 0,
        durationMs: 41,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      },
      {
        source: "shopify_products_api",
        success: false,
        offers: 0,
        durationMs: 39,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      },
      {
        source: "html",
        success: false,
        offers: 0,
        durationMs: 22,
        error: "fetch failed | read ECONNRESET | code=ECONNRESET"
      }
    ];

    mockShouldSuppressNetworkFilterBlockedParseFailure.mockResolvedValueOnce(true);
    mockDiscoverOffers.mockResolvedValue({
      offers: [],
      source: null,
      origin: null,
      attempts: transportFailureAttempts,
      diagnostics: []
    });

    const fetchProbe = vi.fn(async () => {
      return new Response("", {
        status: 302,
        headers: {
          location:
            "http://wired.meraki.com:8090/blocked.cgi?blocked_server=198.251.81.14:80&blocked_url=http%3A%2F%2Faminoasylumllc.com%2F&blocked_categories=bs_047"
        }
      });
    });

    vi.stubGlobal("fetch", fetchProbe);
    const envRef = process.env as Record<string, string | undefined>;
    const previousEnv = envRef.NODE_ENV;
    envRef.NODE_ENV = "development";

    try {
      const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
      await runVendorScrapeJob({
        runMode: "manual",
        scrapeMode: "safe",
        triggeredBy: "test",
        vendorId: "vendor_1"
      });
    } finally {
      envRef.NODE_ENV = previousEnv;
      vi.unstubAllGlobals();
    }

    expect(mockShouldSuppressNetworkFilterBlockedParseFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: "vendor_1",
        pageUrl: "https://peptiatlas.com/",
        networkFilterSignature: expect.any(String)
      })
    );
    expect(mockCreateReviewQueueItem).not.toHaveBeenCalled();
    expect(mockMarkVendorPageScrape).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_data_network_filter_blocked"
      })
    );

    const blockedEvent = mockRecordScrapeEvent.mock.calls.find(([payload]) => payload.code === "NETWORK_FILTER_BLOCKED")?.[0];
    expect(blockedEvent?.payload).toMatchObject({
      networkFilterBlocked: true,
      networkFilterSignature: expect.any(String),
      parseFailureQueueSuppressed: true
    });
  });

  it("excludes multi-unit offers before alias and variant persistence", async () => {
    mockDiscoverOffers.mockResolvedValue({
      offers: [
        {
          vendorPageId: "vp_1",
          vendorId: "vendor_1",
          pageUrl: "https://example.test/catalog",
          productUrl: "https://example.test/product/bpc-157-10mg-10-vials",
          productName: "BPC-157 10mg 10 vials",
          compoundRawName: "BPC-157",
          formulationRaw: "vial",
          sizeRaw: "10mg",
          currencyCode: "USD",
          listPriceCents: 12500,
          available: true,
          rawPayload: {
            extractor: "html"
          }
        },
        {
          vendorPageId: "vp_1",
          vendorId: "vendor_1",
          pageUrl: "https://example.test/catalog",
          productUrl: "https://example.test/product/bpc-157-10mg",
          productName: "BPC-157 10mg Vial",
          compoundRawName: "BPC-157",
          formulationRaw: "vial",
          sizeRaw: "10mg",
          currencyCode: "USD",
          listPriceCents: 3500,
          available: true,
          rawPayload: {
            extractor: "html"
          }
        }
      ],
      source: "html",
      origin: null,
      attempts: [],
      diagnostics: []
    });
    mockResolveCompoundAlias.mockResolvedValue({
      compoundId: "compound_1",
      confidence: 0.99,
      status: "auto_matched",
      aliasNormalized: "bpc 157",
      reason: "rules_exact"
    });
    mockUpdateOfferFromExtracted.mockResolvedValue("created");

    const { runVendorScrapeJob } = await import("@/lib/scraping/worker");
    await runVendorScrapeJob({
      runMode: "manual",
      scrapeMode: "safe",
      triggeredBy: "test",
      vendorId: "vendor_1"
    });

    expect(mockResolveCompoundAlias).toHaveBeenCalledTimes(1);
    expect(mockResolveCompoundAlias).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "BPC-157 10mg Vial"
      })
    );
    expect(mockUpsertCompoundVariant).toHaveBeenCalledTimes(1);
    expect(mockUpdateOfferFromExtracted).toHaveBeenCalledTimes(1);
    expect(mockUpdateOfferFromExtracted).toHaveBeenCalledWith(
      expect.objectContaining({
        extracted: expect.objectContaining({
          productName: "BPC-157 10mg Vial"
        })
      })
    );

    const eventCodes = mockRecordScrapeEvent.mock.calls.map(([payload]) => payload.code);
    expect(eventCodes).toContain("OFFER_EXCLUDED_SCOPE_SINGLE_UNIT");

    expect(mockMarkVendorOffersUnavailableByUrls).toHaveBeenCalledWith(
      expect.objectContaining({
        productUrls: expect.arrayContaining(["https://example.test/product/bpc-157-10mg-10-vials"])
      })
    );

    const finishArgs = mockFinishScrapeRun.mock.calls.at(-1)?.[0] as { summary?: { offersExcludedByRule?: number } } | undefined;
    expect(finishArgs?.summary?.offersExcludedByRule).toBe(1);
  });
});
