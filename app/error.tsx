"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Something went wrong</h1>
        <p>Please retry. If this continues, check logs.</p>
        <button type="button" onClick={() => reset()}>
          Retry
        </button>
      </section>
    </main>
  );
}
