import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

export interface ManualOfferExclusionRule {
  productUrl: string;
  compoundSlug: string;
  compoundName: string;
  vendorSlug: string;
  vendorName: string;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  notes: string;
}

const exclusionEntrySchema = z.object({
  productUrl: z.string().url(),
  compoundSlug: z.string().min(1),
  compoundName: z.string().min(1),
  vendorSlug: z.string().min(1),
  vendorName: z.string().min(1),
  reason: z.string().min(1),
  decidedBy: z.string().min(1),
  decidedAt: z.string().datetime(),
  notes: z.string().default(""),
  isActive: z.boolean().default(true)
});

const exclusionFileSchema = z.object({
  updatedAt: z.string().datetime(),
  sourceReportPath: z.string().optional(),
  sourceReportGeneratedAt: z.string().datetime().optional(),
  exclusions: z.array(exclusionEntrySchema).default([])
});

function resolveConfigPath(): string {
  const configured = process.env.MANUAL_OFFER_EXCLUSIONS_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }

  return path.join(process.cwd(), "config", "manual-offer-exclusions.json");
}

export async function loadManualOfferExclusions(): Promise<{
  filePath: string;
  rulesByProductUrl: Map<string, ManualOfferExclusionRule>;
}> {
  const filePath = resolveConfigPath();

  let fileContent: string;
  try {
    fileContent = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        filePath,
        rulesByProductUrl: new Map()
      };
    }

    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fileContent);
  } catch (error) {
    console.warn("[job:vendors] manual-offer-exclusions JSON parse failed; ignoring rules", {
      filePath,
      error: error instanceof Error ? error.message : "unknown"
    });
    return {
      filePath,
      rulesByProductUrl: new Map()
    };
  }

  const parsed = exclusionFileSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn("[job:vendors] manual-offer-exclusions schema invalid; ignoring rules", {
      filePath,
      issueCount: parsed.error.issues.length
    });
    return {
      filePath,
      rulesByProductUrl: new Map()
    };
  }

  const rulesByProductUrl = new Map<string, ManualOfferExclusionRule>();
  for (const entry of parsed.data.exclusions) {
    if (!entry.isActive) {
      continue;
    }

    const normalizedUrl = entry.productUrl.trim();
    if (!normalizedUrl) {
      continue;
    }

    rulesByProductUrl.set(normalizedUrl, {
      productUrl: normalizedUrl,
      compoundSlug: entry.compoundSlug,
      compoundName: entry.compoundName,
      vendorSlug: entry.vendorSlug,
      vendorName: entry.vendorName,
      reason: entry.reason,
      decidedBy: entry.decidedBy,
      decidedAt: entry.decidedAt,
      notes: entry.notes
    });
  }

  return {
    filePath,
    rulesByProductUrl
  };
}
