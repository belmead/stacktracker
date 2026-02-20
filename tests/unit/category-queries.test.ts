import { beforeEach, describe, expect, it, vi } from "vitest";

type SqlCall = {
  query: string;
  values: unknown[];
};

const sqlCalls: SqlCall[] = [];

const mockSql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  sqlCalls.push({
    query: strings.join(" "),
    values
  });

  return Promise.resolve([]);
});

vi.mock("@/lib/db/client", () => ({
  sql: mockSql
}));

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("category query guards", () => {
  beforeEach(() => {
    sqlCalls.length = 0;
    mockSql.mockClear();
  });

  it("limits category summaries to compounds with active variants", async () => {
    const { getCategorySummaries } = await import("@/lib/db/queries");

    await getCategorySummaries();

    expect(sqlCalls).toHaveLength(1);
    const normalized = normalizeSql(sqlCalls[0].query);

    expect(normalized).toContain("left join compounds c on c.id = ccm.compound_id");
    expect(normalized).toContain("and c.is_active = true");
    expect(normalized).toContain("and exists (");
    expect(normalized).toContain("from compound_variants cv");
    expect(normalized).toContain("where cv.compound_id = c.id and cv.is_active = true");
  });

  it("applies the same active-variant guard when loading category by slug", async () => {
    const { getCategoryBySlug } = await import("@/lib/db/queries");

    await getCategoryBySlug("growth-hormone");

    expect(sqlCalls).toHaveLength(1);
    const normalized = normalizeSql(sqlCalls[0].query);

    expect(normalized).toContain("where cat.slug =");
    expect(normalized).toContain("and exists (");
    expect(normalized).toContain("from compound_variants cv");
    expect(normalized).toContain("where cv.compound_id = c.id and cv.is_active = true");
    expect(sqlCalls[0].values).toEqual(["growth-hormone"]);
  });

  it("filters category compound lists to active compounds with active variants", async () => {
    const { getCompoundsForCategorySlug } = await import("@/lib/db/queries");

    await getCompoundsForCategorySlug("healing");

    expect(sqlCalls).toHaveLength(1);
    const normalized = normalizeSql(sqlCalls[0].query);

    expect(normalized).toContain("where cat.slug =");
    expect(normalized).toContain("and c.is_active = true");
    expect(normalized).toContain("and exists (");
    expect(normalized).toContain("from compound_variants cv");
    expect(normalized).toContain("where cv.compound_id = c.id and cv.is_active = true");
    expect(sqlCalls[0].values).toEqual(["healing"]);
  });
});
