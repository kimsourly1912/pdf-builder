import Link from "next/link";

export default function AccessRequiredPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-5 text-slate-950">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <p className="text-sm font-semibold text-blue-600">PDF Builder</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Management access is required
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Protect the template and submission routes with Cloudflare Access, then sign in with an allowed email address.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Return to editor
        </Link>
      </section>
    </main>
  );
}
