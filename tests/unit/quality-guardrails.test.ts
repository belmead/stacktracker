import { describe, expect, it } from "vitest";

import {
  evaluateFormulationDrift,
  evaluateFormulationInvariant,
  evaluateTopCompoundCoverageSmoke,
  getMissingSmokeCoverageSlugs,
  mergeCoverageSnapshots,
  parseInvariantResultFromSummary,
  parseTopCompoundCoverageSnapshotFromSummary
} from "@/lib/scraping/quality-guardrails";

describe("quality guardrails", () => {
  it("fails formulation invariant when vial share is below threshold", () => {
    const result = evaluateFormulationInvariant({
      config: {
        id: "bpc157_10mg_vial_majority",
        compoundSlug: "bpc-157",
        totalMassMg: 10,
        minOffers: 10,
        minVialShare: 0.8
      },
      snapshot: {
        compoundSlug: "bpc-157",
        totalMassMg: 10,
        totalOffers: 20,
        totalVendors: 18,
        formulationCounts: {
          vial: 7,
          other: 13
        }
      }
    });

    expect(result.status).toBe("fail");
    expect(result.vialShare).toBeCloseTo(0.35, 5);
  });

  it("passes formulation invariant when vial share meets threshold", () => {
    const result = evaluateFormulationInvariant({
      config: {
        id: "bpc157_10mg_vial_majority",
        compoundSlug: "bpc-157",
        totalMassMg: 10,
        minOffers: 10,
        minVialShare: 0.8
      },
      snapshot: {
        compoundSlug: "bpc-157",
        totalMassMg: 10,
        totalOffers: 20,
        totalVendors: 18,
        formulationCounts: {
          vial: 17,
          other: 3
        }
      }
    });

    expect(result.status).toBe("pass");
    expect(result.vialShare).toBeCloseTo(0.85, 5);
  });

  it("alerts on formulation drift when vial share drops too far", () => {
    const result = evaluateFormulationDrift({
      config: {
        id: "bpc157_10mg_vial_majority",
        minOffers: 10,
        maxVialShareDrop: 0.2
      },
      previous: {
        id: "bpc157_10mg_vial_majority",
        status: "pass",
        reason: "",
        totalOffers: 20,
        totalVendors: 18,
        vialOffers: 19,
        vialShare: 0.95,
        minOffers: 10,
        minVialShare: 0.8
      },
      current: {
        id: "bpc157_10mg_vial_majority",
        status: "fail",
        reason: "",
        totalOffers: 20,
        totalVendors: 18,
        vialOffers: 10,
        vialShare: 0.5,
        minOffers: 10,
        minVialShare: 0.8
      }
    });

    expect(result.status).toBe("alert");
    expect(result.drop).toBeCloseTo(0.45, 5);
  });

  it("fails smoke test when top-compound vendor coverage drops beyond threshold", () => {
    const result = evaluateTopCompoundCoverageSmoke({
      config: {
        maxVendorDropPct: 0.3,
        minBaselineVendorCount: 4
      },
      previous: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 10,
          offerCount: 80
        }
      ],
      current: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 5,
          offerCount: 45
        }
      ]
    });

    expect(result.status).toBe("fail");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.requiredVendorCount).toBe(7);
  });

  it("passes smoke test when coverage remains above threshold", () => {
    const result = evaluateTopCompoundCoverageSmoke({
      config: {
        maxVendorDropPct: 0.3,
        minBaselineVendorCount: 4
      },
      previous: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 10,
          offerCount: 80
        }
      ],
      current: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 8,
          offerCount: 60
        }
      ]
    });

    expect(result.status).toBe("pass");
    expect(result.failures).toHaveLength(0);
  });

  it("identifies baseline-tracked compounds missing from current snapshot", () => {
    const missing = getMissingSmokeCoverageSlugs({
      minBaselineVendorCount: 4,
      previous: [
        {
          compoundSlug: "thymosin-alpha-1",
          compoundName: "THYMOSIN ALPHA-1",
          vendorCount: 24,
          offerCount: 24
        },
        {
          compoundSlug: "small-sample",
          compoundName: "Small Sample",
          vendorCount: 2,
          offerCount: 2
        }
      ],
      current: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 30,
          offerCount: 50
        }
      ]
    });

    expect(missing).toEqual(["thymosin-alpha-1"]);
  });

  it("merges supplemental coverage rows without overwriting primary snapshot rows", () => {
    const merged = mergeCoverageSnapshots({
      primary: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 30,
          offerCount: 50
        }
      ],
      supplemental: [
        {
          compoundSlug: "bpc-157",
          compoundName: "BPC-157",
          vendorCount: 1,
          offerCount: 1
        },
        {
          compoundSlug: "thymosin-alpha-1",
          compoundName: "THYMOSIN ALPHA-1",
          vendorCount: 27,
          offerCount: 27
        }
      ]
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]?.compoundSlug).toBe("bpc-157");
    expect(merged[0]?.vendorCount).toBe(30);
    expect(merged[1]?.compoundSlug).toBe("thymosin-alpha-1");
    expect(merged[1]?.vendorCount).toBe(27);
  });

  it("parses invariant and top-compound snapshots from run summary", () => {
    const summary = {
      qualityGuardrails: {
        formulationInvariants: [
          {
            id: "bpc157_10mg_vial_majority",
            status: "pass",
            reason: "ok",
            totalOffers: 20,
            totalVendors: 17,
            vialOffers: 18,
            vialShare: 0.9,
            minOffers: 10,
            minVialShare: 0.8
          }
        ],
        topCompoundCoverageSnapshot: [
          {
            compoundSlug: "bpc-157",
            compoundName: "BPC-157",
            vendorCount: 12,
            offerCount: 90
          }
        ]
      }
    };

    const invariant = parseInvariantResultFromSummary({
      summary,
      id: "bpc157_10mg_vial_majority"
    });
    const topCoverage = parseTopCompoundCoverageSnapshotFromSummary(summary);

    expect(invariant?.status).toBe("pass");
    expect(topCoverage).toHaveLength(1);
    expect(topCoverage?.[0]?.compoundSlug).toBe("bpc-157");
  });
});
