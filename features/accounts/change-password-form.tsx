"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm(props: { name: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError("New password confirmation does not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Password could not be changed.");
      router.replace("/portal");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-5 text-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><KeyRound className="size-5" /></span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Create your private password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Welcome, {props.name}. Replace the temporary password before opening assigned forms.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="current-password">Temporary password</Label><Input id="current-password" type="password" autoComplete="current-password" minLength={12} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><p className="text-xs leading-5 text-slate-400">Use at least 12 characters with uppercase, lowercase, number, and symbol.</p></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <Button type="submit" disabled={submitting} className="h-11 w-full bg-blue-600 hover:bg-blue-700">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{submitting ? "Changing password…" : "Save password and continue"}</Button>
        </form>
      </section>
    </main>
  );
}
