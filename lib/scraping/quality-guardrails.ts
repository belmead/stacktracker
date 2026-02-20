export interface FormulationMixSnapshot {
  compoundSlug: string;
  totalMassMg: number;
  totalOffers: number;
  totalVendors: number;
  formulationCounts: Record<string, number>;
}

export interface FormulationInvariantConfig {
  id: string;
  compoundSlug: string;
  totalMassMg: number;
  minOffers: number;
  minVialShare: number;
}

export interface FormulationInvariantResult {
  id: string;
  status: "pass" | "fail" | "skip";
  reason: string;
  totalOffers: number;
  totalVendors: number;
  vialOffers: number;
  vialShare: number;
  minOffers: number;
  minVialShare: number;
}

export interface FormulationDriftConfig {
  id: string;
  minOffers: number;
  maxVialShareDrop: number;
}

export interface FormulationDriftResult {
  id: string;
  status: "pass" | "alert" | "skip";
  reason: string;
  currentVialShare: number | null;
  previousVialShare: number | null;
  currentOffers: number;
  previousOffers: number;
  drop: number | null;
  maxVialShareDrop: number;
}

export interface TopCompoundCoverageSnapshot {
  compoundSlug: string;
  compoundName: string;
  vendorCount: number;
  offerCount: number;
}

export interface SmokeCoverageConfig {
  maxVendorDropPct: number;
  minBaselineVendorCount: number;
}

export interface SmokeCoverageFailure {
  compoundSlug: string;
  compoundName: string;
  previousVendorCount: number;
  currentVendorCount: number;
  requiredVendorCount: number;
  dropPct: number;
}

export interface SmokeCoverageResult {
  status: "pass" | "fail" | "skip";
  reason: string;
  comparedCompounds: number;
  failures: SmokeCoverageFailure[];
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getVialOffers(snapshot: FormulationMixSnapshot): number {
  return snapshot.formulationCounts.vial ?? 0;
}

export function getVialShare(snapshot: FormulationMixSnapshot): number {
  if (snapshot.totalOffers <= 0) {
    return 0;
  }

  return getVialOffers(snapshot) / snapshot.totalOffers;
}

export function evaluateFormulationInvariant(input: {
  config: FormulationInvariantConfig;
  snapshot: FormulationMixSnapshot;
}): FormulationInvariantResult {
  const vialOffers = getVialOffers(input.snapshot);
  const vialShare = getVialShare(input.snapshot);

  if (input.snapshot.totalOffers < input.config.minOffers) {
    return {
      id: input.config.id,
      status: "skip",
      reason: `insufficient sample (${input.snapshot.totalOffers} < ${input.config.minOffers})`,
      totalOffers: input.snapshot.totalOffers,
      totalVendors: input.snapshot.totalVendors,
      vialOffers,
      vialShare,
      minOffers: input.config.minOffers,
      minVialShare: input.config.minVialShare
    };
  }

  if (vialShare >= input.config.minVialShare) {
    return {
      id: input.config.id,
      status: "pass",
      reason: `vial share ${toPercent(vialShare)} >= ${toPercent(input.config.minVialShare)}`,
      totalOffers: input.snapshot.totalOffers,
      totalVendors: input.snapshot.totalVendors,
      vialOffers,
      vialShare,
      minOffers: input.config.minOffers,
      minVialShare: input.config.minVialShare
    };
  }

  return {
    id: input.config.id,
    status: "fail",
    reason: `vial share ${toPercent(vialShare)} below ${toPercent(input.config.minVialShare)}`,
    totalOffers: input.snapshot.totalOffers,
    totalVendors: input.snapshot.totalVendors,
    vialOffers,
    vialShare,
    minOffers: input.config.minOffers,
    minVialShare: input.config.minVialShare
  };
}

export function evaluateFormulationDrift(input: {
  config: FormulationDriftConfig;
  current: FormulationInvariantResult | null;
  previous: FormulationInvariantResult | null;
}): FormulationDriftResult {
  if (!input.current || !input.previous) {
    return {
      id: input.config.id,
      status: "skip",
      reason: "missing baseline",
      currentVialShare: input.current?.vialShare ?? null,
      previousVialShare: input.previous?.vialShare ?? null,
      currentOffers: input.current?.totalOffers ?? 0,
      previousOffers: input.previous?.totalOffers ?? 0,
      drop: null,
      maxVialShareDrop: input.config.maxVialShareDrop
    };
  }

  if (input.previous.totalOffers < input.config.minOffers || input.current.totalOffers < input.config.minOffers) {
    return {
      id: input.config.id,
      status: "skip",
      reason: "insufficient sample for drift comparison",
      currentVialShare: input.current.vialShare,
      previousVialShare: input.previous.vialShare,
      currentOffers: input.current.totalOffers,
      previousOffers: input.previous.totalOffers,
      drop: null,
      maxVialShareDrop: input.config.maxVialShareDrop
    };
  }

  const drop = input.previous.vialShare - input.current.vialShare;
  if (drop >= input.config.maxVialShareDrop) {
    return {
      id: input.config.id,
      status: "alert",
      reason: `vial share drop ${toPercent(drop)} exceeds ${toPercent(input.config.maxVialShareDrop)}`,
      currentVialShare: input.current.vialShare,
      previousVialShare: input.previous.vialShare,
      currentOffers: input.current.totalOffers,
      previousOffers: input.previous.totalOffers,
      drop,
      maxVialShareDrop: input.config.maxVialShareDrop
    };
  }

  return {
    id: input.config.id,
    status: "pass",
    reason: `vial share drop ${toPercent(Math.max(drop, 0))} within threshold`,
    currentVialShare: input.current.vialShare,
    previousVialShare: input.previous.vialShare,
    currentOffers: input.current.totalOffers,
    previousOffers: input.previous.totalOffers,
    drop,
    maxVialShareDrop: input.config.maxVialShareDrop
  };
}

export function evaluateTopCompoundCoverageSmoke(input: {
  config: SmokeCoverageConfig;
  current: TopCompoundCoverageSnapshot[];
  previous: TopCompoundCoverageSnapshot[] | null;
}): SmokeCoverageResult {
  if (!input.previous || input.previous.length === 0) {
    return {
      status: "skip",
      reason: "missing baseline",
      comparedCompounds: 0,
      failures: []
    };
  }

  const currentBySlug = new Map(input.current.map((item) => [item.compoundSlug, item]));
  const failures: SmokeCoverageFailure[] = [];
  let comparedCompounds = 0;

  for (const previousItem of input.previous) {
    if (previousItem.vendorCount < input.config.minBaselineVendorCount) {
      continue;
    }

    comparedCompounds += 1;
    const currentItem = currentBySlug.get(previousItem.compoundSlug);
    const currentVendorCount = currentItem?.vendorCount ?? 0;
    const requiredVendorCount = Math.max(1, Math.ceil(previousItem.vendorCount * (1 - input.config.maxVendorDropPct)));
    if (currentVendorCount >= requiredVendorCount) {
      continue;
    }

    const dropPct = previousItem.vendorCount <= 0 ? 0 : (previousItem.vendorCount - currentVendorCount) / previousItem.vendorCount;
    failures.push({
      compoundSlug: previousItem.compoundSlug,
      compoundName: previousItem.compoundName,
      previousVendorCount: previousItem.vendorCount,
      currentVendorCount,
      requiredVendorCount,
      dropPct
    });
  }

  if (comparedCompounds === 0) {
    return {
      status: "skip",
      reason: "no baseline compounds met minimum vendor count",
      comparedCompounds: 0,
      failures: []
    };
  }

  if (failures.length === 0) {
    return {
      status: "pass",
      reason: `all ${comparedCompounds} tracked compounds within coverage threshold`,
      comparedCompounds,
      failures: []
    };
  }

  return {
    status: "fail",
    reason: `${failures.length}/${comparedCompounds} tracked compounds fell below expected vendor coverage`,
    comparedCompounds,
    failures
  };
}

export function getMissingSmokeCoverageSlugs(input: {
  current: TopCompoundCoverageSnapshot[];
  previous: TopCompoundCoverageSnapshot[] | null;
  minBaselineVendorCount: number;
}): string[] {
  if (!input.previous || input.previous.length === 0) {
    return [];
  }

  const currentSlugs = new Set(input.current.map((item) => item.compoundSlug));
  const missing: string[] = [];

  for (const previousItem of input.previous) {
    if (previousItem.vendorCount < input.minBaselineVendorCount) {
      continue;
    }

    if (!currentSlugs.has(previousItem.compoundSlug)) {
      missing.push(previousItem.compoundSlug);
    }
  }

  return missing;
}

export function mergeCoverageSnapshots(input: {
  primary: TopCompoundCoverageSnapshot[];
  supplemental: TopCompoundCoverageSnapshot[];
}): TopCompoundCoverageSnapshot[] {
  const merged = new Map<string, TopCompoundCoverageSnapshot>();

  for (const item of input.primary) {
    merged.set(item.compoundSlug, item);
  }

  for (const item of input.supplemental) {
    if (!merged.has(item.compoundSlug)) {
      merged.set(item.compoundSlug, item);
    }
  }

  return Array.from(merged.values());
}

export function parseInvariantResultFromSummary(input: { summary: unknown; id: string }): FormulationInvariantResult | null {
  const summaryObj = asObject(input.summary);
  const quality = asObject(summaryObj?.qualityGuardrails);
  const invariantsValue = quality?.formulationInvariants;
  if (!Array.isArray(invariantsValue)) {
    return null;
  }

  for (const item of invariantsValue) {
    const row = asObject(item);
    if (!row || row.id !== input.id) {
      continue;
    }

    const status = row.status;
    const reason = row.reason;
    const totalOffers = asNumber(row.totalOffers);
    const totalVendors = asNumber(row.totalVendors);
    const vialOffers = asNumber(row.vialOffers);
    const vialShare = asNumber(row.vialShare);
    const minOffers = asNumber(row.minOffers);
    const minVialShare = asNumber(row.minVialShare);

    if (
      (status !== "pass" && status !== "fail" && status !== "skip") ||
      typeof reason !== "string" ||
      totalOffers === null ||
      totalVendors === null ||
      vialOffers === null ||
      vialShare === null ||
      minOffers === null ||
      minVialShare === null
    ) {
      return null;
    }

    return {
      id: input.id,
      status,
      reason,
      totalOffers,
      totalVendors,
      vialOffers,
      vialShare,
      minOffers,
      minVialShare
    };
  }

  return null;
}

export function parseTopCompoundCoverageSnapshotFromSummary(summary: unknown): TopCompoundCoverageSnapshot[] | null {
  const summaryObj = asObject(summary);
  const quality = asObject(summaryObj?.qualityGuardrails);
  const snapshotValue = quality?.topCompoundCoverageSnapshot;
  if (!Array.isArray(snapshotValue)) {
    return null;
  }

  const parsed: TopCompoundCoverageSnapshot[] = [];
  for (const item of snapshotValue) {
    const row = asObject(item);
    if (!row) {
      continue;
    }

    if (typeof row.compoundSlug !== "string" || typeof row.compoundName !== "string") {
      continue;
    }

    const vendorCount = asNumber(row.vendorCount);
    const offerCount = asNumber(row.offerCount);
    if (vendorCount === null || offerCount === null) {
      continue;
    }

    parsed.push({
      compoundSlug: row.compoundSlug,
      compoundName: row.compoundName,
      vendorCount,
      offerCount
    });
  }

  return parsed.length > 0 ? parsed : null;
}
