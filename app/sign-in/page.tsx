import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";

import { getChatGPTUser, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-5 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-semibold text-primary">PDF Builder</p>
          <CardTitle className="text-2xl tracking-tight">
            Sign in to manage PDFs
          </CardTitle>
          <CardDescription className="leading-6">
            Recipient links remain public. This sign-in protects the editor,
            templates, and submissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm ownerEmail={ownerEmail} returnTo={returnTo} />
        </CardContent>
      </Card>
    </main>
  );
}

