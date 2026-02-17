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
});
