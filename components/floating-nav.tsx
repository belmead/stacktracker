"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { MetricType } from "@/lib/types";

interface CompoundOption {
  id: string;
  slug: string;
  name: string;
}

interface FloatingNavProps {
  compounds: CompoundOption[];
  currentMetric: MetricType;
  currentSlug?: string;
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

export function FloatingNav({ compounds, currentMetric, currentSlug, metricOptions }: FloatingNavProps) {
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

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const setMetric = (metric: MetricType): void => {
    const next = new URLSearchParams(params.toString());
    next.set("metric", metric);
    router.push(`${pathname}?${next.toString()}`);
  };

  const onSelectCompound = (slug: string): void => {
    if (!slug) {
      router.push(`/?metric=${activeMetric}`);
      return;
    }

    router.push(`/peptides/${slug}?metric=${activeMetric}`);
  };

  return (
    <header className="floating-nav">
      <div className="nav-brand">Stack Tracker</div>

      <div className="nav-actions">
        <select
          className="select-control"
          value={selectedSlug}
          onChange={(event) => onSelectCompound(event.target.value)}
          aria-label="Select peptide"
        >
          <option value="">Browse peptides</option>
          {compounds.map((compound) => (
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
