import Link from "next/link";

import { AdminLoginForm } from "@/components/admin/login-form";

export default function AdminLoginPage() {
  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Admin Sign In</h1>
        <p>Single-owner access via magic link.</p>
        <AdminLoginForm />
      </section>

      <section className="admin-card">
        <p>
          Return to <Link href="/">homepage</Link>
        </p>
      </section>
    </main>
  );
}
