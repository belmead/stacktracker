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
}

const METRIC_OPTIONS: Array<{ value: MetricType; label: string }> = [
  { value: "price_per_mg", label: "Per mg" },
  { value: "price_per_ml", label: "Per mL" },
  { value: "price_per_vial", label: "Per vial" },
  { value: "price_per_unit", label: "Per unit" }
];

export function FloatingNav({ compounds, currentMetric, currentSlug }: FloatingNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedSlug = currentSlug ?? "";

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const setMetric = (metric: MetricType): void => {
    const next = new URLSearchParams(params.toString());
    next.set("metric", metric);
    router.push(`${pathname}?${next.toString()}`);
  };

  const onSelectCompound = (slug: string): void => {
    if (!slug) {
      router.push(`/?metric=${currentMetric}`);
      return;
    }

    router.push(`/peptides/${slug}?metric=${currentMetric}`);
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
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={currentMetric === option.value}
              data-active={currentMetric === option.value}
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
