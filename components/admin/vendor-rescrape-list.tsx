"use client";

import { useState } from "react";

interface VendorRow {
  id: string;
  name: string;
  websiteUrl: string;
  isActive: boolean;
  updatedAt: string;
}

interface VendorRescrapeListProps {
  vendors: VendorRow[];
}

export function VendorRescrapeList({ vendors }: VendorRescrapeListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const queue = async (vendorId: string): Promise<void> => {
    setBusyId(vendorId);

    try {
      const response = await fetch(`/api/admin/vendors/${vendorId}/rescrape`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("request failed");
      }

      alert("Aggressive re-scrape queued.");
    } catch {
      alert("Failed to queue re-scrape.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="review-list">
      {vendors.map((vendor) => (
        <article key={vendor.id} className="review-item">
          <header>
            <h3>{vendor.name}</h3>
            <span className="badge">{vendor.isActive ? "Active" : "Inactive"}</span>
          </header>
          <p>
            <a href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer nofollow">
              {vendor.websiteUrl}
            </a>
          </p>
          <button type="button" onClick={() => void queue(vendor.id)} disabled={busyId === vendor.id || !vendor.isActive}>
            {busyId === vendor.id ? "Queueing..." : "Queue aggressive re-scrape"}
          </button>
        </article>
      ))}
    </div>
  );
}
