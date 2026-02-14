import Link from "next/link";

import { CategoryEditor } from "@/components/admin/category-editor";
import { assertAdminSession } from "@/lib/admin-auth";
import { listCategoriesForAdmin, listCompoundCategoryAssignmentsForAdmin } from "@/lib/db/queries";

export default async function AdminCategoriesPage() {
  await assertAdminSession();

  const [categories, compounds] = await Promise.all([listCategoriesForAdmin(), listCompoundCategoryAssignmentsForAdmin()]);

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Category Editor</h1>
        <p>Assign one or more categories per compound and select which one is primary.</p>
        <p>
          Loaded {compounds.length} compounds and {categories.length} categories.
        </p>
        <CategoryEditor categories={categories} compounds={compounds} />
      </section>

      <section className="admin-card">
        <Link href="/admin">Back to admin home</Link>
      </section>
    </main>
  );
}
