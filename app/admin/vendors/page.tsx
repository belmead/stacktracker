import Link from "next/link";

import { VendorRescrapeList } from "@/components/admin/vendor-rescrape-list";
import { assertAdminSession } from "@/lib/admin-auth";
import { listVendorsForAdmin } from "@/lib/db/queries";

export default async function AdminVendorsPage() {
  await assertAdminSession();

  const vendors = await listVendorsForAdmin();

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Vendor Controls</h1>
        <p>Queue aggressive re-scrapes for blocked or JS-heavy pages.</p>
        <VendorRescrapeList vendors={vendors} />
      </section>

      <section className="admin-card">
        <Link href="/admin">Back to admin home</Link>
      </section>
    </main>
  );
}
