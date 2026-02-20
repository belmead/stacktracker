import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/test";
process.env.ADMIN_EMAIL ??= "stacktracker@proton.me";
process.env.ADMIN_AUTH_SECRET ??= "1234567890123456";
process.env.CRON_SECRET ??= "1234567890123456";

const mockGetCompoundBySlug = vi.fn();
const mockGetCompoundCoverageStats = vi.fn();
const mockGetCompoundSelectorOptions = vi.fn();
const mockGetDefaultVariantId = vi.fn();
const mockGetOffersForVariant = vi.fn();
const mockGetTrendPoints = vi.fn();
const mockGetVariantById = vi.fn();
const mockGetVariantFilters = vi.fn();
const mockNotFound = vi.fn();

// Vitest executes JSX-compiled server components without Next's runtime wrapper.
// Expose React globally so TSX modules compiled to React.createElement can run.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db/queries", () => ({
  getCompoundBySlug: mockGetCompoundBySlug,
  getCompoundCoverageStats: mockGetCompoundCoverageStats,
  getCompoundSelectorOptions: mockGetCompoundSelectorOptions,
  getDefaultVariantId: mockGetDefaultVariantId,
  getOffersForVariant: mockGetOffersForVariant,
  getTrendPoints: mockGetTrendPoints,
  getVariantById: mockGetVariantById,
  getVariantFilters: mockGetVariantFilters
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound
}));

vi.mock("@/components/floating-nav", () => ({
  FloatingNav: (props: { currentMetric: string }) =>
    React.createElement("div", {
      "data-testid": "floating-nav",
      "data-metric": props.currentMetric
    })
}));

vi.mock("@/components/trend-chart", () => ({
  TrendChart: () => React.createElement("div", { "data-testid": "trend-chart" })
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; className?: string; children?: React.ReactNode }) =>
    React.createElement(
      "a",
      {
        href: props.href,
        className: props.className
      },
      props.children
    )
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined>): Promise<string> {
  const module = await import("@/app/peptides/[slug]/page");
  const element = await module.default({
    params: Promise.resolve({ slug: "bpc-157" }),
    searchParams: Promise.resolve(searchParams)
  });
  return renderToStaticMarkup(element);
}

describe("/peptides/[slug] page", () => {
  beforeEach(() => {
    mockNotFound.mockReset();
    mockNotFound.mockImplementation(() => {
      throw new Error("notFound");
    });

    mockGetCompoundBySlug.mockReset();
    mockGetCompoundCoverageStats.mockReset();
    mockGetCompoundSelectorOptions.mockReset();
    mockGetDefaultVariantId.mockReset();
    mockGetOffersForVariant.mockReset();
    mockGetTrendPoints.mockReset();
    mockGetVariantById.mockReset();
    mockGetVariantFilters.mockReset();

    mockGetCompoundBySlug.mockResolvedValue({
      id: "compound_1",
      slug: "bpc-157",
      name: "BPC-157",
      description: "Healing peptide."
    });
    mockGetCompoundCoverageStats.mockResolvedValue({
      vendorCount: 3,
      variationCount: 2
    });
    mockGetCompoundSelectorOptions.mockResolvedValue([]);
    mockGetDefaultVariantId.mockResolvedValue("variant_1");
    mockGetVariantById.mockResolvedValue({
      id: "variant_1",
      compoundId: "compound_1",
      formulationCode: "vial",
      formulationLabel: "Vial",
      sizeLabel: "10mg"
    });
    mockGetVariantFilters.mockResolvedValue([
      {
        variantId: "variant_1",
        formulationLabel: "Vial",
        sizeLabel: "10mg"
      }
    ]);
    mockGetOffersForVariant.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 10,
      priceSummary: {
        averageListPriceCents: 7500,
        lowListPriceCents: 6500,
        highListPriceCents: 8500,
        vendorsCounted: 3
      }
    });
    mockGetTrendPoints.mockResolvedValue([]);
  });

  it("shows selected-variant average and low/high price summary", async () => {
    const html = await renderPage({});

    expect(html).toContain("Average price of 10mg vial of BPC-157: $75.00");
    expect(html).toContain("Low: $65.00 High: $85.00");
  });
});
