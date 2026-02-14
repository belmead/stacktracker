"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { MetricType } from "@/lib/types";

interface CompoundOption {
  id: string;
  slug: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
}

interface CategoryOption {
  slug: string;
  name: string;
}

interface FloatingNavProps {
  compounds: CompoundOption[];
  currentMetric: MetricType;
  currentSlug?: string;
  currentCategorySlug?: string;
  metricOptions?: MetricType[];
}

const DEFAULT_METRIC_OPTIONS: MetricType[] = ["price_per_mg", "price_per_ml", "price_per_vial", "price_per_unit"];

const METRIC_LABELS: Record<MetricType, string> = {
  price_per_mg: "Per mg",
  price_per_ml: "Per mL",
  price_per_vial: "Per vial",
  price_per_unit: "Per unit"
};

function normalizeMetricOptions(values: MetricType[] | undefined): MetricType[] {
  const source = values && values.length > 0 ? values : DEFAULT_METRIC_OPTIONS;
  return Array.from(new Set(source));
}

function withQuery(pathname: string, values: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (!value) {
      continue;
    }

    search.set(key, value);
  }

  const suffix = search.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function FloatingNav({ compounds, currentMetric, currentSlug, currentCategorySlug, metricOptions }: FloatingNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleMetrics = useMemo(
    () => normalizeMetricOptions(metricOptions).map((value) => ({ value, label: METRIC_LABELS[value] })),
    [metricOptions]
  );

  const activeMetric = visibleMetrics.some((option) => option.value === currentMetric)
    ? currentMetric
    : visibleMetrics[0].value;

  const selectedSlug = currentSlug ?? "";
  const activeCompound = compounds.find((compound) => compound.slug === selectedSlug) ?? null;

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const grouped = new Map<string, string>();

    for (const compound of compounds) {
      if (!compound.categorySlug || !compound.categoryName) {
        continue;
      }

      grouped.set(compound.categorySlug, compound.categoryName);
    }

    return Array.from(grouped.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [compounds]);

  const requestedCategory = searchParams.get("category") ?? "";
  const hasRequestedCategory = categoryOptions.some((option) => option.slug === requestedCategory);
  const hasCurrentCategory = currentCategorySlug
    ? categoryOptions.some((option) => option.slug === currentCategorySlug)
    : false;
  const selectedCategory = hasRequestedCategory
    ? requestedCategory
    : hasCurrentCategory
      ? (currentCategorySlug ?? "")
      : activeCompound?.categorySlug ?? "";

  const visibleCompounds = useMemo(() => {
    if (!selectedCategory) {
      return compounds;
    }

    return compounds.filter((compound) => compound.categorySlug === selectedCategory);
  }, [compounds, selectedCategory]);

  const selectedVisibleSlug = visibleCompounds.some((compound) => compound.slug === selectedSlug) ? selectedSlug : "";

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const setMetric = (metric: MetricType): void => {
    const next = new URLSearchParams(params.toString());
    next.set("metric", metric);
    router.push(`${pathname}?${next.toString()}`);
  };

  const onSelectCategory = (categorySlug: string): void => {
    if (!categorySlug) {
      router.push(
        withQuery("/", {
          metric: activeMetric
        })
      );
      return;
    }

    router.push(
      withQuery(`/categories/${categorySlug}`, {
        metric: activeMetric
      })
    );
  };

  const onSelectCompound = (slug: string): void => {
    if (!slug) {
      if (selectedCategory) {
        router.push(
          withQuery(`/categories/${selectedCategory}`, {
            metric: activeMetric
          })
        );
        return;
      }

      router.push(
        withQuery("/", {
          metric: activeMetric
        })
      );
      return;
    }

    const nextCompound = compounds.find((compound) => compound.slug === slug) ?? null;
    const nextCategory = selectedCategory || nextCompound?.categorySlug || null;

    router.push(
      withQuery(`/peptides/${slug}`, {
        metric: activeMetric,
        category: nextCategory
      })
    );
  };

  return (
    <header className="floating-nav">
      <div className="nav-brand">Stack Tracker</div>

      <div className="nav-actions">
        <select
          className="select-control"
          value={selectedCategory}
          onChange={(event) => onSelectCategory(event.target.value)}
          aria-label="Select category"
        >
          <option value="">All categories</option>
          {categoryOptions.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          className="select-control"
          value={selectedVisibleSlug}
          onChange={(event) => onSelectCompound(event.target.value)}
          aria-label="Select peptide"
          disabled={visibleCompounds.length === 0}
        >
          <option value="">{selectedCategory ? "Browse peptides in category" : "Browse peptides"}</option>
          {visibleCompounds.map((compound) => (
            <option key={compound.id} value={compound.slug}>
              {compound.name}
            </option>
          ))}
        </select>

        <div className="metric-toggle" role="tablist" aria-label="Price metric">
          {visibleMetrics.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={activeMetric === option.value}
              data-active={activeMetric === option.value}
              className="metric-pill"
              onClick={() => setMetric(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
