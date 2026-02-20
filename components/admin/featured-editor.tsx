"use client";

import { FormEvent, useState } from "react";

interface CompoundOption {
  id: string;
  name: string;
  slug: string;
}

interface FeaturedItem {
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  displayOrder: number;
  source: "auto" | "manual";
  isPinned: boolean;
}

interface FeaturedEditorProps {
  compounds: CompoundOption[];
  current: FeaturedItem[];
}

export function FeaturedEditor({ compounds, current }: FeaturedEditorProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const defaults = Array.from({ length: 5 }).map((_, index) => current[index]?.compoundId ?? compounds[index]?.id ?? "");

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    const formData = new FormData(event.currentTarget);
    const orderedCompoundIds = [1, 2, 3, 4, 5]
      .map((order) => String(formData.get(`slot_${order}`) ?? ""))
      .filter(Boolean);

    if (orderedCompoundIds.length !== 5 || new Set(orderedCompoundIds).size !== 5) {
      setStatus("Pick five unique compounds.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/featured", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        orderedCompoundIds,
        source: "manual",
        pinned: true
      })
    });

    if (!response.ok) {
      setStatus("Could not save featured list.");
      setLoading(false);
      return;
    }

    setStatus("Saved.");
    setLoading(false);
  };

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {[1, 2, 3, 4, 5].map((order, index) => (
        <label key={order}>
          Slot {order}
          <select name={`slot_${order}`} defaultValue={defaults[index]}>
            {compounds.map((compound) => (
              <option key={compound.id} value={compound.id}>
                {compound.name}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button type="submit" className="primary-button" disabled={loading}>
        {loading ? "Saving..." : "Save featured compounds"}
      </button>

      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}
