import Link from "next/link";
import { notFound } from "next/navigation";

import { FloatingNav } from "@/components/floating-nav";
import { LocalTimeLabel } from "@/components/local-time-label";
import { getCompoundSelectorOptions, getOffersForVendor, getVendorBySlug } from "@/lib/db/queries";
import { formatMetricLabel, formatPriceCents } from "@/lib/metrics";
import { parseMetric, parsePositiveInt } from "@/lib/request";

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

interface VendorPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function VendorPage({ params, searchParams }: VendorPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const vendor = await getVendorBySlug(slug);
  if (!vendor) {
    notFound();
  }

  const compounds = await getCompoundSelectorOptions();

  const metric = parseMetric(getParam(query, "metric"), "price_per_mg");
  const page = parsePositiveInt(getParam(query, "page"), 1);
  const pageSize = 50;
  const offersPage = await getOffersForVendor({
    vendorId: vendor.id,
    metric,
    page,
    pageSize
  });

  const totalPages = Math.max(1, Math.ceil(offersPage.total / pageSize));

  return (
    <main className="page-shell">
      <FloatingNav compounds={compounds} currentMetric={metric} />

      <section className="hero-block">
        <p className="eyebrow">Vendor offerings</p>
        <h1>{vendor.name}</h1>
        <p>
          <a href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer nofollow">
            {vendor.websiteUrl}
          </a>
        </p>
        <p>
          Finnrick:{" "}
          <span className="rating-badge">{vendor.finnrickRating === null ? "N/A" : vendor.finnrickRating.toFixed(1)}</span>
        </p>
        <p>
          <LocalTimeLabel isoTimestamp={vendor.lastUpdatedAt} />
        </p>
      </section>

      <section className="section-shell">
        <div className="section-header-row">
          <h2>Active offers</h2>
          <p>
            Showing {offersPage.rows.length} of {offersPage.total}
          </p>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Compound</th>
                <th>Product</th>
                <th>Formulation + Size</th>
                <th>List price</th>
                <th>{formatMetricLabel(metric)}</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {offersPage.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={withQuery(`/peptides/${row.compoundSlug}`, { metric })}>{row.compoundName}</Link>
                  </td>
                  <td>
                    <a href={row.productUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {row.productName}
                    </a>
                  </td>
                  <td>
                    {row.formulationLabel} · {row.sizeLabel}
                  </td>
                  <td>{formatPriceCents(row.listPriceCents)}</td>
                  <td>{formatPriceCents(row.metricPrice)}</td>
                  <td>{new Date(row.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="pager">
            <Link
              href={withQuery(`/vendors/${vendor.slug}`, {
                metric,
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
              href={withQuery(`/vendors/${vendor.slug}`, {
                metric,
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
