import Link from "next/link";

import { FloatingNav } from "@/components/floating-nav";
import { getCategorySummaries, getCompoundSelectorOptions } from "@/lib/db/queries";
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

interface CategoriesPageProps {
  searchParams: Promise<SearchParams>;
}

const HOME_METRICS: MetricType[] = ["price_per_vial", "price_per_mg"];

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const params = await searchParams;
  const requestedMetric = parseMetric(getParam(params, "metric"), "price_per_mg");
  const metric = HOME_METRICS.includes(requestedMetric) ? requestedMetric : "price_per_mg";

  const [compounds, categories] = await Promise.all([getCompoundSelectorOptions(), getCategorySummaries()]);

  return (
    <main className="page-shell">
      <FloatingNav compounds={compounds} currentMetric={metric} metricOptions={HOME_METRICS} />

      <section className="hero-block">
        <p className="eyebrow">Browse categories</p>
        <h1>Explore by category</h1>
        <p>Select a category to narrow down peptide options before drilling into a specific compound.</p>
      </section>

      <section className="section-shell">
        <div className="section-header-row">
          <h2>Categories</h2>
          <p>{categories.length} tracked</p>
        </div>

        {categories.length === 0 ? (
          <p className="empty-state">No categories are available yet.</p>
        ) : (
          <div className="chip-row">
            {categories.map((category) => (
              <Link key={category.id} href={withQuery(`/categories/${category.slug}`, { metric })} className="chip">
                {category.name} ({category.compoundCount})
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">Footer content placeholder.</footer>
    </main>
  );
}
