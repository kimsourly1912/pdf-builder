"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
    <form className="space-y-5" onSubmit={submit}>
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
          minLength={8}
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
          <Spinner />
        ) : (
          <LockKeyhole className="size-4" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

