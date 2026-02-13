"use client";

import { FormEvent, useState } from "react";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/auth/request-link", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const payload = (await response.json().catch(() => ({}))) as { devMagicLink?: string; error?: string };

      if (!response.ok) {
        setStatus(payload.error ?? "Unable to send link.");
        return;
      }

      if (payload.devMagicLink) {
        setStatus(`Link generated (dev): ${payload.devMagicLink}`);
      } else {
        setStatus("If your email is authorized, a magic link has been sent.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label htmlFor="admin-email">Admin email</label>
      <input
        id="admin-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="stacktracker@proton.me"
      />
      <button type="submit" className="primary-button" disabled={loading}>
        {loading ? "Sending..." : "Send magic link"}
      </button>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}
