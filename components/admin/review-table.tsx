"use client";

import { FormEvent, useMemo, useState } from "react";

interface ReviewItem {
  id: string;
  queueType: string;
  status: string;
  vendorName: string | null;
  pageUrl: string | null;
  rawText: string | null;
  confidence: number | string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface CompoundOption {
  id: string;
  name: string;
  slug: string;
}

interface ReviewTableProps {
  items: ReviewItem[];
  compounds: CompoundOption[];
}

export function ReviewTable({ items, compounds }: ReviewTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const defaultCompoundId = useMemo(() => compounds[0]?.id ?? "", [compounds]);

  const formatConfidence = (value: number | string | null): string => {
    if (value === null) {
      return "N/A";
    }

    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return "N/A";
    }

    return parsed.toFixed(2);
  };

  const submit = async (reviewId: string, body: Record<string, unknown>): Promise<void> => {
    setBusyId(reviewId);

    try {
      const response = await fetch(`/api/admin/review/${reviewId}/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error("Resolve request failed");
      }

      window.location.reload();
    } catch {
      setBusyId(null);
      alert("Could not update review item.");
    }
  };

  const onResolveExisting = (event: FormEvent<HTMLFormElement>, reviewId: string): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const compoundId = String(formData.get("compoundId") ?? defaultCompoundId);
    void submit(reviewId, { action: "resolve_existing", compoundId });
  };

  const onCreateNew = (event: FormEvent<HTMLFormElement>, reviewId: string): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const compoundName = String(formData.get("compoundName") ?? "").trim();
    if (!compoundName) {
      return;
    }

    void submit(reviewId, { action: "create_new", compoundName });
  };

  if (items.length === 0) {
    return <p className="empty-state">No open review items.</p>;
  }

  return (
    <div className="review-list">
      {items.map((item) => (
        <article key={item.id} className="review-item">
          <header>
            <h3>{item.rawText ?? "Unlabeled item"}</h3>
            <span className="badge">{item.queueType}</span>
          </header>

          <p>
            Vendor: <strong>{item.vendorName ?? "Unknown"}</strong>
          </p>
          {item.pageUrl ? (
            <p>
              URL:{" "}
              <a href={item.pageUrl} target="_blank" rel="noopener noreferrer nofollow">
                {item.pageUrl}
              </a>
            </p>
          ) : null}
          <p>Confidence: {formatConfidence(item.confidence)}</p>

          <div className="review-actions">
            <form onSubmit={(event) => onResolveExisting(event, item.id)}>
              <select name="compoundId" defaultValue={defaultCompoundId}>
                {compounds.map((compound) => (
                  <option key={compound.id} value={compound.id}>
                    {compound.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busyId === item.id || compounds.length === 0}>
                Resolve to existing
              </button>
            </form>

            <form onSubmit={(event) => onCreateNew(event, item.id)}>
              <input name="compoundName" placeholder="Create new compound" />
              <button type="submit" disabled={busyId === item.id}>
                Create + resolve
              </button>
            </form>

            <button type="button" onClick={() => void submit(item.id, { action: "ignore" })} disabled={busyId === item.id}>
              Ignore
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
