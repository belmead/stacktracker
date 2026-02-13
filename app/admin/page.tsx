import Link from "next/link";

import { assertAdminSession } from "@/lib/admin-auth";
import { LogoutButton } from "@/components/admin/logout-button";

export default async function AdminIndexPage() {
  const email = await assertAdminSession();

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Stack Tracker Admin</h1>
        <p>Signed in as {email}</p>
        <LogoutButton />
      </section>

      <section className="admin-card">
        <h2>Workflows</h2>
        <ul>
          <li>
            <Link href="/admin/review">Alias review queue</Link>
          </li>
          <li>
            <Link href="/admin/featured">Featured compounds</Link>
          </li>
          <li>
            <Link href="/admin/vendors">Vendors and re-scrapes</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
