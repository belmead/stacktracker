"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  mappedCompounds: number;
}

interface CompoundAssignmentRow {
  id: string;
  name: string;
  slug: string;
  categoryIds: string[];
  primaryCategoryId: string | null;
  activeOfferCount: number;
}

interface RowState {
  categoryIds: string[];
  primaryCategoryId: string | null;
  baselineCategoryIds: string[];
  baselinePrimaryCategoryId: string | null;
  saving: boolean;
  status: string | null;
  error: boolean;
}

interface CategoryEditorProps {
  categories: CategoryOption[];
  compounds: CompoundAssignmentRow[];
}

function compareCategoryIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function nextPrimaryCategory(categoryIds: string[], preferred: string | null): string | null {
  if (categoryIds.length === 0) {
    return null;
  }

  if (preferred && categoryIds.includes(preferred)) {
    return preferred;
  }

  return categoryIds[0] ?? null;
}

export function CategoryEditor({ categories, compounds }: CategoryEditorProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      compounds.map((compound) => [
        compound.id,
        {
          categoryIds: compound.categoryIds,
          primaryCategoryId: nextPrimaryCategory(compound.categoryIds, compound.primaryCategoryId),
          baselineCategoryIds: compound.categoryIds,
          baselinePrimaryCategoryId: nextPrimaryCategory(compound.categoryIds, compound.primaryCategoryId),
          saving: false,
          status: null,
          error: false
        }
      ])
    )
  );

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const setRow = (compoundId: string, patch: Partial<RowState>): void => {
    setRows((current) => ({
      ...current,
      [compoundId]: {
        ...current[compoundId],
        ...patch
      }
    }));
  };

  const onCategorySelection = (compoundId: string, selectedIds: string[]): void => {
    setRows((current) => {
      const row = current[compoundId];
      const unique = Array.from(new Set(selectedIds));
      const primaryCategoryId = nextPrimaryCategory(unique, row.primaryCategoryId);

      return {
        ...current,
        [compoundId]: {
          ...row,
          categoryIds: unique,
          primaryCategoryId,
          status: null,
          error: false
        }
      };
    });
  };

  const onPrimarySelection = (compoundId: string, primaryCategoryId: string): void => {
    setRows((current) => {
      const row = current[compoundId];
      return {
        ...current,
        [compoundId]: {
          ...row,
          primaryCategoryId: primaryCategoryId || null,
          status: null,
          error: false
        }
      };
    });
  };

  const isDirty = (row: RowState): boolean => {
    const initialPrimary = nextPrimaryCategory(row.baselineCategoryIds, row.baselinePrimaryCategoryId);
    const currentPrimary = nextPrimaryCategory(row.categoryIds, row.primaryCategoryId);
    return !compareCategoryIds(row.baselineCategoryIds, row.categoryIds) || initialPrimary !== currentPrimary;
  };

  const saveRow = async (compound: CompoundAssignmentRow): Promise<void> => {
    const row = rows[compound.id];
    if (!row) {
      return;
    }

    setRow(compound.id, {
      saving: true,
      status: null,
      error: false
    });

    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          compoundId: compound.id,
          categoryIds: row.categoryIds,
          primaryCategoryId: nextPrimaryCategory(row.categoryIds, row.primaryCategoryId)
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setRow(compound.id, {
          saving: false,
          status: payload?.error ?? "Could not save categories.",
          error: true
        });
        return;
      }

      setRow(compound.id, {
        saving: false,
        baselineCategoryIds: row.categoryIds,
        baselinePrimaryCategoryId: nextPrimaryCategory(row.categoryIds, row.primaryCategoryId),
        status: "Saved.",
        error: false
      });
    } catch (error) {
      setRow(compound.id, {
        saving: false,
        status: error instanceof Error ? error.message : "Could not save categories.",
        error: true
      });
    }
  };

  return (
    <div className="review-list">
      {compounds.map((compound) => {
        const row = rows[compound.id];
        const selectedCategories = row.categoryIds.map((categoryId) => categoryById.get(categoryId)).filter(Boolean);
        const rowPrimary = nextPrimaryCategory(row.categoryIds, row.primaryCategoryId);
        const dirty = isDirty(row);

        return (
          <article key={compound.id} className="review-item">
            <header>
              <h3>{compound.name}</h3>
              <span className="badge">{compound.activeOfferCount} active offers</span>
            </header>

            <p>
              <Link href={`/peptides/${compound.slug}`}>Open peptide page</Link>
            </p>

            <div className="category-editor-controls">
              <label className="category-field">
                Categories
                <select
                  className="category-multi-select"
                  multiple
                  size={Math.max(4, Math.min(8, categories.length))}
                  value={row.categoryIds}
                  onChange={(event) => {
                    const selectedIds = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
                    onCategorySelection(compound.id, selectedIds);
                  }}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="category-field">
                Primary category
                <select
                  value={rowPrimary ?? ""}
                  onChange={(event) => onPrimarySelection(compound.id, event.currentTarget.value)}
                  disabled={row.categoryIds.length === 0}
                >
                  <option value="">No primary</option>
                  {selectedCategories.map((category) => (
                    <option key={category?.id} value={category?.id}>
                      {category?.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={() => void saveRow(compound)} disabled={row.saving || !dirty}>
                {row.saving ? "Saving..." : "Save categories"}
              </button>

              {row.status ? (
                <p className="form-status" data-error={row.error}>
                  {row.status}
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
