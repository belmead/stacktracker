import Link from "next/link";

import { ReviewTable } from "@/components/admin/review-table";
import { assertAdminSession } from "@/lib/admin-auth";
import { listCompoundCatalog, listOpenReviewItems } from "@/lib/db/queries";

export default async function AdminReviewPage() {
  await assertAdminSession();

  const [items, compounds] = await Promise.all([listOpenReviewItems(), listCompoundCatalog()]);

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Review Queue</h1>
        <p>Resolve ambiguous aliases and blocked scrape items.</p>
        <ReviewTable items={items} compounds={compounds} />
      </section>

      <section className="admin-card">
        <Link href="/admin">Back to admin home</Link>
      </section>
    </main>
  );
}
