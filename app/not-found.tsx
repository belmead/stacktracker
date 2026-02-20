import Link from "next/link";

export default function NotFound() {
  return (
    <main className="admin-shell">
      <section className="admin-card">
        <h1>Not Found</h1>
        <p>The requested page or peptide does not exist yet.</p>
        <Link href="/">Return home</Link>
      </section>
    </main>
  );
}
