import { headers } from "next/headers";
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
import { getRecipientAccount } from "@/features/accounts/account.server";

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
  const recipient = await getRecipientAccount(await headers());
  if (recipient) {
    redirect(
      recipient.profile.mustChangePassword ? "/change-password" : "/portal",
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-5 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-semibold text-primary">PDF Studio</p>
          <CardTitle>Sign in to PDF Studio</CardTitle>
          <CardDescription>
            Owners manage templates and submissions. Candidates and employees
            can open the forms assigned to their account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm returnTo={returnTo} />
        </CardContent>
      </Card>
    </main>
  );
}

