"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formApi } from "@/features/forms/client";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
import { reviewLabel } from "./submission-review";
import { CandidateAccess } from "./candidate-access";
import { CandidatePreparation } from "./candidate-preparation";
type Form = { id: string; name: string; versionId: string | null };
export function CandidateForms({
  item,
  onChanged,
}: {
  item: CandidateProgress;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<Form[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const all: Form[] = [];
        let page = 1;
        for (;;) {
          const data = await formApi<{ items: Form[]; hasNextPage: boolean }>(
            `/api/forms?page=${page}&pageSize=100`,
          );
          all.push(...data.items);
          if (!data.hasNextPage) break;
          page++;
        }
        if (alive) setTemplates(all.filter((f) => f.versionId));
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Could not load forms.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);
  async function assign() {
    if (!item.accountEmail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await formApi(`/api/forms/${selected}/assign`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ email: item.accountEmail }),
      });
      setNotice(
        "Form assignment is available in the candidate’s My forms. An existing assignment for this version is reused; no invitation was sent.",
      );
      setSelected("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(window.location.origin + url);
      setNotice("Account-protected form link copied.");
    } catch {
      setError(
        "Copy failed. Open the account portal assignment from Account access.",
      );
    }
  }
  const assignments = item.assignments ?? item.forms;
  return (
    <div className="space-y-5">
      <section
        id="assign-forms"
        className="scroll-mt-24 rounded-xl border bg-card p-5"
      >
        <h2 className="font-semibold">Assign forms</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          1. Choose a form → 2. Check the candidate → 3. Assign and share
          access. The candidate completes the entire form. Existing assignments
          keep their original published form.
        </p>
        {item.accountCreated && !item.accountDisabled ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="candidate-form-template">Published form</Label>
              <Select
                value={selected}
                disabled={loading || busy}
                onValueChange={(v) => setSelected(v ?? "")}
              >
                <SelectTrigger id="candidate-form-template" className="w-full">
                  <SelectValue
                    placeholder={
                      loading ? "Loading forms…" : "Choose a form template"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-4 text-sm">
                  <h3 className="font-medium">Check before assigning</h3>
                  <p className="mt-2 break-words">
                    {templates.find((f) => f.id === selected)?.name} →{" "}
                    {item.name}
                  </p>
                  <p className="mt-1 break-all">Account: {item.accountEmail}</p>
                  <p className="mt-1 break-words">
                    CV (
                    {item.selectedCv.verified ? "approved" : "review needed"}):{" "}
                    {item.selectedCv.fileName}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Assignment will make this form available in My forms. No
                    message is sent by this action.
                  </p>
                </div>
              )}
            </div>
            <Button
              disabled={
                busy || loading || !selected || !item.selectedCv.verified
              }
              onClick={() => void assign()}
            >
              {busy ? "Assigning…" : "Assign form"}
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            {item.accountDisabled ? (
              <Button asChild variant="outline">
                <Link href={`/accounts?account=${item.accountId}`}>
                  Review disabled account access
                </Link>
              </Button>
            ) : (
              <CandidatePreparation item={item} onChanged={onChanged} />
            )}
          </div>
        )}
        {!item.selectedCv.verified && (
          <p className="mt-3 text-sm text-muted-foreground">
            Review and approve this CV before preparing onboarding forms.
          </p>
        )}
        {!loading && !templates.length && (
          <p className="mt-3 text-sm">
            <Link className="text-primary underline" href="/forms">
              Create and publish a form template
            </Link>
          </p>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice}
        </p>
      )}
      <CandidateAccess item={item} />
      <section
        id="required-forms"
        className="scroll-mt-24 rounded-xl border bg-card p-5"
      >
        <h2 className="font-semibold">Assignments & responses</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Required forms belong to the selected preparation. Other account
          assignments remain visible for reference.
        </p>
        <div className="mt-4 space-y-3">
          {assignments.map((f) => (
            <div
              key={f.id}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{f.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {f.versionNumber ?? "—"} ·{" "}
                  {f.isRequired
                    ? "Required for current preparation"
                    : "Other assignment"}
                  {f.assignedAt
                    ? ` · Assigned ${new Date(f.assignedAt).toLocaleDateString()}`
                    : ""}
                </p>
                <Badge variant="outline" className="mt-2">
                  {f.status === "completed"
                    ? reviewLabel(f.reviewStatus ?? "pending")
                    : f.correctionReason
                      ? "Corrections requested"
                      : f.status === "in_progress"
                        ? "In progress"
                        : f.status === "assigned"
                          ? "Assigned"
                          : f.status}
                </Badge>
                {f.correctionReason && f.status !== "completed" && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {f.correctionReason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {f.status === "completed" && f.responseUrl ? (
                  <Button
                    asChild
                    variant={
                      f.reviewStatus === "accepted" ? "outline" : "default"
                    }
                    size="sm"
                  >
                    <Link href={f.responseUrl}>
                      {f.reviewStatus === "pending"
                        ? "Review submission"
                        : "View decision"}
                    </Link>
                  </Button>
                ) : (
                  f.fillUrl &&
                  ["assigned", "in_progress"].includes(f.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copy(f.fillUrl!)}
                    >
                      Copy link
                    </Button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        {!assignments.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            No forms assigned yet. Prepare account access, then assign published
            forms here or through automation.
          </p>
        )}
      </section>
    </div>
  );
}
