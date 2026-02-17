import Link from "next/link";
import { notFound } from "next/navigation";

import { FloatingNav } from "@/components/floating-nav";
import { TrendChart } from "@/components/trend-chart";
import {
  getCompoundBySlug,
  getCompoundCoverageStats,
  getCompoundSelectorOptions,
  getDefaultVariantId,
  getOffersForVariant,
  getTrendPoints,
  getVariantById,
  getVariantFilters
} from "@/lib/db/queries";
import { formatMetricLabel, formatPriceCents } from "@/lib/metrics";
import { parseMetric, parsePositiveInt, parseTrendRange, pickMetricForFormulation } from "@/lib/request";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string): string | null {
  const value = params[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
}

function withQuery(basePath: string, values: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

interface PeptidePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function PeptidePage({ params, searchParams }: PeptidePageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const compound = await getCompoundBySlug(slug);
  if (!compound) {
    notFound();
  }

  const [compounds, variantFilters, defaultVariantId, coverage] = await Promise.all([
    getCompoundSelectorOptions(),
    getVariantFilters(compound.id),
    getDefaultVariantId(compound.id),
    getCompoundCoverageStats(compound.id)
  ]);

  const selectedVariantId = getParam(query, "variantId") ?? defaultVariantId;
  const variant = selectedVariantId ? await getVariantById(selectedVariantId) : null;
  if (!variant) {
    notFound();
  }

  const requestedMetric = parseMetric(getParam(query, "metric"), "price_per_mg");
  const metric = pickMetricForFormulation({
    requestedMetric,
    formulationCode: variant.formulationCode
  });

  const range = parseTrendRange(getParam(query, "range"), "1m");
  const page = parsePositiveInt(getParam(query, "page"), 1);
  const pageSize = 10;

  const [offersPage, points] = await Promise.all([
    getOffersForVariant({
      variantId: variant.id,
      metric,
      page,
      pageSize
    }),
    getTrendPoints({
      variantId: variant.id,
      metric,
      range
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(offersPage.total / pageSize));
  const coverageSummary = `${coverage.vendorCount} vendor${coverage.vendorCount === 1 ? "" : "s"} · ${coverage.variationCount} variation${coverage.variationCount === 1 ? "" : "s"}`;
  const subhead = `${compound.description ?? "Normalized vendor offers, trends, and ratings by formulation."} ${coverageSummary}`;
  const variantDescriptor = `${variant.sizeLabel} ${variant.formulationLabel.toLowerCase()}`.trim();

  return (
    <main className="page-shell">
      <FloatingNav compounds={compounds} currentMetric={metric} currentSlug={slug} />

      <section className="hero-block">
        <p className="eyebrow">Compound detail</p>
        <h1>{compound.name}</h1>
        <p>{subhead}</p>
      </section>

      <section className="section-shell">
        <div className="section-header-row">
          <h2>Pricing Trend</h2>
          <div className="chip-row">
            {(["1w", "1m", "6m", "1y"] as const).map((option) => (
              <Link
                key={option}
                href={withQuery(`/peptides/${slug}`, {
                  metric,
                  variantId: variant.id,
                  range: option,
                  page: 1
                })}
                className="chip"
                data-active={range === option}
              >
                {option.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>

        <TrendChart points={points} />
      </section>

      <section className="section-shell">
        <div className="section-header-row">
          <h2>Formulation + Size</h2>
          <p>{formatMetricLabel(metric)}</p>
        </div>

        <div className="chip-row">
          {variantFilters.map((item) => (
            <Link
              key={item.variantId}
              href={withQuery(`/peptides/${slug}`, {
                metric,
                variantId: item.variantId,
                range,
                page: 1
              })}
              className="chip"
              data-active={item.variantId === variant.id}
            >
              {item.formulationLabel} · {item.sizeLabel}
            </Link>
          ))}
        </div>

        <p className="metric-line">
          Average price of {variantDescriptor} of {compound.name}: {formatPriceCents(offersPage.priceSummary.averageListPriceCents)}
        </p>
        <p className="metric-line">
          Low: {formatPriceCents(offersPage.priceSummary.lowListPriceCents)} High: {formatPriceCents(offersPage.priceSummary.highListPriceCents)}
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Listing</th>
                <th>{formatMetricLabel(metric)}</th>
                <th>Finnrick</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {offersPage.rows.map((row) => (
                <tr key={row.vendorId}>
                  <td>
                    <Link href={`/vendors/${row.vendorSlug}?metric=${metric}`}>{row.vendorName}</Link>
                  </td>
                  <td>
                    <a href={row.vendorUrl} target="_blank" rel="noopener noreferrer nofollow">
                      View offer
                    </a>
                  </td>
                  <td>{formatPriceCents(row.metricPrice)}</td>
                  <td>
                    <span className="rating-badge">{row.finnrickRating === null ? "N/A" : row.finnrickRating.toFixed(1)}</span>
                  </td>
                  <td>{new Date(row.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="pager">
            <Link
              href={withQuery(`/peptides/${slug}`, {
                metric,
                variantId: variant.id,
                range,
                page: Math.max(1, page - 1)
              })}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
            <span>
              Page {page} of {totalPages}
            </span>
            <Link
              href={withQuery(`/peptides/${slug}`, {
                metric,
                variantId: variant.id,
                range,
                page: Math.min(totalPages, page + 1)
              })}
              aria-disabled={page >= totalPages}
            >
              Next
            </Link>
          </div>
        ) : null}
      </section>

      <footer className="site-footer">Footer content placeholder.</footer>
    </main>
  );
}
