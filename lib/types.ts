export type MetricType = "price_per_mg" | "price_per_ml" | "price_per_vial" | "price_per_unit";

export type UnitFamily = "mass" | "volume" | "count" | "mixed";

export type ResolutionStatus = "auto_matched" | "needs_review" | "resolved";

export type ScrapeMode = "safe" | "aggressive_manual";

export type JobType = "vendor" | "finnrick";

export type JobRunMode = "scheduled" | "manual";

export type ScrapeStatus = "running" | "success" | "partial" | "failed";

export type ReviewQueueType = "alias_match" | "scrape_blocked" | "parse_failure" | "policy_block" | "other";

export type ReviewQueueStatus = "open" | "in_progress" | "resolved" | "ignored";

export type TrendRange = "1w" | "1m" | "6m" | "1y";

export interface MetricPriceMap {
  price_per_mg: number | null;
  price_per_ml: number | null;
  price_per_vial: number | null;
  price_per_unit: number | null;
}

export interface NormalizedVariant {
  formulationCode: string;
  displaySizeLabel: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  totalMassMg: number | null;
  totalVolumeMl: number | null;
  totalCountUnits: number | null;
}

export interface ExtractedOffer {
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
  productUrl: string;
  productName: string;
  compoundRawName: string;
  formulationRaw: string | null;
  sizeRaw: string | null;
  currencyCode: "USD";
  listPriceCents: number;
  available: boolean;
  rawPayload: Record<string, unknown>;
}

export interface CompoundResolution {
  compoundId: string | null;
  confidence: number;
  status: ResolutionStatus;
  aliasNormalized: string;
  reason: string;
}

export interface HomeCardRow {
  vendorName: string;
  vendorUrl: string;
  metricPrice: number | null;
  metricType: MetricType;
  finnrickRating: number | null;
}

export interface HomeCard {
  compoundSlug: string;
  compoundName: string;
  categoryName: string | null;
  heroMetricType: MetricType;
  heroMetricPrice: number | null;
  imageUrl: string;
  rows: HomeCardRow[];
}

export interface HomePayload {
  heroHeadline: string;
  heroSubhead: string;
  cards: HomeCard[];
}

export interface TrendPoint {
  timestamp: string;
  value: number;
}
