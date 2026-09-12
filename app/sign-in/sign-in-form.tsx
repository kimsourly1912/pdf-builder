"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm(props: {
  returnTo: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      rememberMe: true,
    });
    setSubmitting(false);

    if (result.error) {
      setError("The email or password is incorrect.");
      return;
    }

    const sessionResponse = await fetch("/api/session", { cache: "no-store" });
    const session = (await sessionResponse.json().catch(() => ({}))) as {
      homePath?: string;
    };
    const destination =
      props.returnTo !== "/" ? props.returnTo : session.homePath ?? "/";
    router.replace(destination);
    router.refresh();
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && (
        <FeedbackAlert tone="error" title="Sign in failed" description={error} />
      )}
      <Button
        type="submit"
        className="h-11 w-full"
        disabled={submitting}
      >
        {submitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <LockKeyhole className="size-4" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

