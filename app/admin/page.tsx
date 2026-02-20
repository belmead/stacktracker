import Link from "next/link";

import { assertAdminSession } from "@/lib/admin-auth";
import { LogoutButton } from "@/components/admin/logout-button";
import { listCompoundsMissingPrimaryCategory } from "@/lib/db/queries";

export default async function AdminIndexPage() {
  const [email, unassignedCompounds] = await Promise.all([assertAdminSession(), listCompoundsMissingPrimaryCategory()]);

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
          <li>
            <Link href="/admin/categories">Category editor</Link>
          </li>
        </ul>
      </section>

      <section className="admin-card">
        <h2>Unassigned Categories</h2>
        <p>Active compounds that do not have a primary category mapping.</p>

        {unassignedCompounds.length === 0 ? (
          <p className="empty-state">All active compounds currently have primary categories assigned.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Compound</th>
                  <th>Variants</th>
                  <th>Active offers</th>
                </tr>
              </thead>
              <tbody>
                {unassignedCompounds.map((compound) => (
                  <tr key={compound.id}>
                    <td>
                      <Link href={`/peptides/${compound.slug}`}>{compound.name}</Link>
                    </td>
                    <td>{compound.variantCount}</td>
                    <td>{compound.activeOfferCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
