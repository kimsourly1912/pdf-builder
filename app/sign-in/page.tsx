import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";

import { getChatGPTUser, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { SignInForm } from "@/app/sign-in/sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage(props: {
  searchParams: Promise<{ return_to?: string | string[] }>;
}) {
  const query = await props.searchParams;
  const requested = Array.isArray(query.return_to)
    ? query.return_to[0]
    : query.return_to;
  const returnTo = safeRelativeReturnPath(requested ?? "/");
  const user = await getChatGPTUser();
  if (user) redirect(returnTo);

  const ownerEmail = (
    (env as unknown as { MANAGEMENT_EMAIL?: string }).MANAGEMENT_EMAIL ?? ""
  ).trim();

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-5 text-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <p className="text-sm font-semibold text-blue-600">PDF Builder</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Sign in to manage PDFs
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Recipient links remain public. This sign-in protects the editor,
          templates, and submissions.
        </p>
        <SignInForm ownerEmail={ownerEmail} returnTo={returnTo} />
      </section>
    </main>
  );
}

