"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm(props: {
  ownerEmail: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(props.ownerEmail);
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

    router.replace(props.returnTo);
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
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="h-11 w-full bg-blue-600 hover:bg-blue-700"
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

