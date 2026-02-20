import { FloatingNav } from "@/components/floating-nav";
import { HomeCard } from "@/components/home-card";
import { getCompoundSelectorOptions, getHomePayload } from "@/lib/db/queries";
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

interface HomePageProps {
  searchParams: Promise<SearchParams>;
}

const HOME_METRICS: MetricType[] = ["price_per_vial", "price_per_mg"];

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const requestedMetric = parseMetric(getParam(params, "metric"), "price_per_mg");
  const metric = HOME_METRICS.includes(requestedMetric) ? requestedMetric : "price_per_mg";

  const [compounds, home] = await Promise.all([getCompoundSelectorOptions(), getHomePayload(metric)]);

  return (
    <main className="page-shell">
      <FloatingNav compounds={compounds} currentMetric={metric} metricOptions={HOME_METRICS} />

      <section className="hero-block">
        <p className="eyebrow">Real-time market indexing</p>
        <h1>{home.heroHeadline}</h1>
        <p>{home.heroSubhead}</p>
      </section>

      <section className="cards-stack">
        {home.cards.map((card) => (
          <HomeCard key={card.compoundSlug} card={card} />
        ))}
      </section>

      <footer className="site-footer">Footer content placeholder.</footer>
    </main>
  );
}
