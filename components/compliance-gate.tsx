"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "st_age_confirmed_v1";

export function ComplianceGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accepted = window.localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      setOpen(true);
    }
  }, []);

  const accept = (): void => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="age-gate-backdrop" role="dialog" aria-modal="true" aria-label="Age and medical disclaimer">
      <div className="age-gate-card">
        <h2>For informational use only</h2>
        <p>
          Stack Tracker provides pricing data only. It is not medical advice, treatment guidance, or product endorsement.
          You must be 18+ to continue.
        </p>
        <button type="button" className="primary-button" onClick={accept}>
          I am 18+ and understand
        </button>
      </div>
    </div>
  );
}
