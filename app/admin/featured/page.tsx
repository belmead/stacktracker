import Link from "next/link";

import { FeaturedEditor } from "@/components/admin/featured-editor";
import { assertAdminSession } from "@/lib/admin-auth";
import { listCompoundCatalog, listFeaturedCompounds } from "@/lib/db/queries";

export default async function AdminFeaturedPage() {
  await assertAdminSession();

  const [compounds, current] = await Promise.all([listCompoundCatalog(), listFeaturedCompounds()]);

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Featured Compounds</h1>
        <p>Manual top five list for homepage cards.</p>
        <FeaturedEditor compounds={compounds} current={current} />
      </section>

      <section className="admin-card">
        <Link href="/admin">Back to admin home</Link>
      </section>
    </main>
  );
}
