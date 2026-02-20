import Link from "next/link";
import { notFound } from "next/navigation";

import { FloatingNav } from "@/components/floating-nav";
import { getCategoryBySlug, getCompoundsForCategorySlug, getCompoundSelectorOptions } from "@/lib/db/queries";
import { parseMetric } from "@/lib/request";
import type { MetricType } from "@/lib/types";

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

function withQuery(basePath: string, values: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (!value) {
      continue;
    }

    search.set(key, value);
  }

  const suffix = search.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

const HOME_METRICS: MetricType[] = ["price_per_vial", "price_per_mg"];

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedMetric = parseMetric(getParam(query, "metric"), "price_per_mg");
  const metric = HOME_METRICS.includes(requestedMetric) ? requestedMetric : "price_per_mg";

  const [compounds, category, categoryCompounds] = await Promise.all([
    getCompoundSelectorOptions(),
    getCategoryBySlug(slug),
    getCompoundsForCategorySlug(slug)
  ]);

  if (!category) {
    notFound();
  }

  return (
    <main className="page-shell">
      <FloatingNav
        compounds={compounds}
        currentMetric={metric}
        currentCategorySlug={category.slug}
        metricOptions={HOME_METRICS}
      />

      <section className="hero-block">
        <p className="eyebrow">Category view</p>
        <h1>{category.name}</h1>
        <p>{category.compoundCount} tracked compounds in this category.</p>
      </section>

      <section className="section-shell">
        <div className="section-header-row">
          <h2>Compounds</h2>
          <Link href={withQuery("/categories", { metric })} className="chip">
            All categories
          </Link>
        </div>

        {categoryCompounds.length === 0 ? (
          <p className="empty-state">No compounds are mapped to this category yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Compound</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {categoryCompounds.map((compound) => (
                  <tr key={compound.id}>
                    <td>
                      <Link
                        href={withQuery(`/peptides/${compound.slug}`, {
                          metric,
                          category: category.slug
                        })}
                      >
                        {compound.name}
                      </Link>
                    </td>
                    <td>{compound.description ?? "No description yet."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="site-footer">Footer content placeholder.</footer>
    </main>
  );
}
