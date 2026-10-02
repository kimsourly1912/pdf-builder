"use client";
import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isStrongAccountPassword } from "@/features/accounts/account-share";
export function ActivationForm() {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [activated, setActivated] = useState(false);
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    const timer = setTimeout(() => setToken(token), 0);
    return () => clearTimeout(timer);
  }, []);
  const form = useForm({
    defaultValues: { password: "", confirmation: "" },
    validators: {
      onSubmit: ({ value }) =>
        !isStrongAccountPassword(value.password)
          ? "Use 12–128 characters with uppercase, lowercase, number, and symbol."
          : value.password !== value.confirmation
            ? "Passwords do not match."
            : undefined,
    },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: value.password }),
        });
        const data = (await response.json()) as {
          email?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Activation failed.");
        setActivated(true);
        setToken("");
        const login = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: data.email, password: value.password }),
        });
        form.reset();
        if (login.ok) window.location.assign("/portal");
        else setError("Your password is set. Sign in to open your forms.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Activation failed.");
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Create a password to activate your candidate account and open your
            assigned forms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {activated ? (
            <Button asChild className="w-full">
              <Link href="/sign-in?return_to=%2Fportal">
                Sign in to your forms
              </Link>
            </Button>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
            >
              {!token && (
                <p className="text-sm text-muted-foreground">
                  Open the activation link sent by your recruitment bot. If it
                  has expired, ask HR for a new invitation.
                </p>
              )}
              {(["password", "confirmation"] as const).map((name) => (
                <form.Field key={name} name={name}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={name}>
                        {name === "password" ? "Password" : "Confirm password"}
                      </Label>
                      <Input
                        id={name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        maxLength={128}
                        disabled={busy}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
              ))}
              <p className="text-xs text-muted-foreground">
                12–128 characters with uppercase, lowercase, number, and symbol.
              </p>
              <form.Subscribe selector={(state) => state.errors}>
                {(errors) =>
                  errors.length ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.map(String).join(" ")}
                    </p>
                  ) : null
                }
              </form.Subscribe>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !token}
              >
                {busy ? "Activating…" : "Continue to your forms"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
