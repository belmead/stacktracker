import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCompoundSelectorOptions = vi.fn();
const mockGetCategorySummaries = vi.fn();

// Vitest executes JSX-compiled server components without Next's runtime wrapper.
// Expose React globally so TSX modules compiled to React.createElement can run.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db/queries", () => ({
  getCompoundSelectorOptions: mockGetCompoundSelectorOptions,
  getCategorySummaries: mockGetCategorySummaries
}));

vi.mock("@/components/floating-nav", () => ({
  FloatingNav: (props: { currentMetric: string; metricOptions?: string[] }) =>
    React.createElement("div", {
      "data-testid": "floating-nav",
      "data-metric": props.currentMetric,
      "data-options": (props.metricOptions ?? []).join(",")
    })
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

type SearchParams = Record<string, string | string[] | undefined>;

async function renderPage(searchParams: SearchParams): Promise<string> {
  const module = await import("@/app/categories/page");
  const element = await module.default({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe("/categories page", () => {
  beforeEach(() => {
    mockGetCompoundSelectorOptions.mockReset();
    mockGetCategorySummaries.mockReset();
    mockGetCompoundSelectorOptions.mockResolvedValue([]);
  });

  it("falls back to per-mg when a non-home metric is requested", async () => {
    mockGetCategorySummaries.mockResolvedValue([{ id: "1", slug: "healing", name: "Healing", compoundCount: 2 }]);

    const html = await renderPage({ metric: "price_per_ml" });

    expect(html).toContain('data-metric="price_per_mg"');
    expect(html).toContain('href="/categories/healing?metric=price_per_mg"');
  });

  it("preserves per-vial metric and renders category links with counts", async () => {
    mockGetCategorySummaries.mockResolvedValue([
      { id: "1", slug: "healing", name: "Healing", compoundCount: 3 },
      { id: "2", slug: "growth-hormone", name: "Growth hormone", compoundCount: 7 }
    ]);

    const html = await renderPage({ metric: "price_per_vial" });

    expect(html).toContain('data-metric="price_per_vial"');
    expect(html).toContain('href="/categories/healing?metric=price_per_vial"');
    expect(html).toContain('href="/categories/growth-hormone?metric=price_per_vial"');
    expect(html).toContain("Healing (3)");
    expect(html).toContain("Growth hormone (7)");
  });

  it("renders empty state when no categories are returned", async () => {
    mockGetCategorySummaries.mockResolvedValue([]);

    const html = await renderPage({ metric: "price_per_mg" });

    expect(html).toContain("No categories are available yet.");
  });
});
