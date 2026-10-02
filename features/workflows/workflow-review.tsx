"use client";
import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import { isStrongAccountPassword } from "@/features/accounts/account-share";
import type { ResumeCandidateSummary } from "@/features/resumes/resume.types";
import { workflowApi, errorText } from "./client";
import { RunBadge } from "./workflow-runs";
import type { WorkflowRun } from "./workflow";

type ReviewData = {
  telegramConnections: {
    id: string;
    fullName: string;
    email: string;
    username: string;
  }[];
  suggestedConnectionId: string | null;
  run: WorkflowRun;
  candidate: ResumeCandidateSummary | null;
  resumeRevision: string;
  candidateRevision: string | null;
  possibleDuplicate: boolean;
  existingAccount: { id: string; name: string; email: string } | null;
};
type ReviewValues = {
  telegramConnectionId: string;
  confirmTelegram: boolean;
  candidate: ResumeCandidateSummary;
  checks: boolean[];
  note: string;
  temporaryPassword: string;
  existingAccountId: string;
  credentialsSaved: boolean;
};
export function WorkflowReview(props: { displayName: string; runId: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void workflowApi<ReviewData>(`/api/workflow-runs/${props.runId}/review`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [props.runId, revision]);
  return (
    <AppShell displayName={props.displayName} fullWidth>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {data ? (
        <ReviewBody
          key={`${data.run.id}-${revision}`}
          data={data}
          reload={() => {
            setData(null);
            setRevision((v) => v + 1);
          }}
        />
      ) : (
        <p className="py-20 text-center text-muted-foreground">
          {error ? "Review unavailable." : "Loading CV review…"}
        </p>
      )}
    </AppShell>
  );
}

const TEXT_FIELDS = [
  ["fullName", "Full name"],
  ["email", "Contact email"],
  ["phone", "Phone number"],
  ["address", "Location / address"],
  ["gender", "Gender"],
  ["nationality", "Nationality"],
  ["currentTitle", "Current job title"],
] as const;
const LIST_FIELDS = [
  ["workExperience", "Work experience"],
  ["education", "Education"],
  ["skills", "Skills"],
  ["certifications", "Certifications"],
  ["languages", "Languages"],
  ["links", "Links"],
] as const;
const CHECKS = [
  "CV is readable and complete enough",
  "Candidate details match the CV",
  "Candidate contact details reviewed",
];

function ReviewBody({
  data,
  reload,
}: {
  data: ReviewData;
  reload: () => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const [existing, setExisting] = useState(data.existingAccount);
  const [showPassword, setShowPassword] = useState(false);
  const initialCandidate = data.candidate ?? {
    id: "",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    dateOfBirth: null,
    gender: "",
    nationality: "",
    currentTitle: "",
    professionalSummary: "",
    skills: [],
    workExperience: [],
    education: [],
    certifications: [],
    languages: [],
    links: [],
    verificationStatus: "extracted" as const,
  };
  const sendsTelegram = data.run.graph.nodes.some(
    (n) => n.kind === "send_telegram",
  );
  const form = useForm({
    defaultValues: {
      telegramConnectionId: data.suggestedConnectionId ?? "",
      confirmTelegram: false,
      candidate: initialCandidate,
      checks: [false, false, false],
      note: "",
      temporaryPassword: "",
      existingAccountId: "",
      credentialsSaved: false,
    },
    validators: {
      onSubmit: ({ value }) => {
        if (
          !value.candidate.fullName.trim() ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.candidate.email)
        )
          return "Enter a full name and valid contact email.";
        if (!value.checks.every(Boolean))
          return "Complete all three review checks.";
        if (existing?.email === value.candidate.email.trim().toLowerCase()) {
          if (value.existingAccountId !== existing.id)
            return "Confirm the existing candidate account.";
        } else if (
          !sendsTelegram &&
          (!isStrongAccountPassword(value.temporaryPassword) ||
            !value.credentialsSaved)
        )
          return "Set a strong temporary password and save it to share with the candidate.";
        if (
          sendsTelegram &&
          value.telegramConnectionId &&
          !value.confirmTelegram
        )
          return "Confirm that the Telegram contact belongs to this candidate.";
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await decide("approve", value);
    },
  });
  const email = form.state.values.candidate.email;
  // This subscription drives the account lookup when staff correct an email.
  const [lookupEmail, setLookupEmail] = useState(email);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void workflowApi<{
        items: {
          id: string;
          name: string;
          email: string;
          accountType: string;
        }[];
      }>(
        `/api/accounts?search=${encodeURIComponent(lookupEmail)}&accountType=candidate&pageSize=20`,
        { signal: controller.signal },
      )
        .then((d) =>
          setExisting(
            d.items.find(
              (a) => a.email.toLowerCase() === lookupEmail.trim().toLowerCase(),
            ) ?? null,
          ),
        )
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lookupEmail]);
  async function decide(
    action: "save" | "approve" | "reject",
    value: ReviewValues,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workflowApi(`/api/workflow-runs/${data.run.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          telegramConnectionId: value.telegramConnectionId,
          confirmTelegram: value.confirmTelegram,
          candidate: value.candidate,
          checks: value.checks,
          note: value.note,
          existingAccountId: value.existingAccountId,
          temporaryPassword: value.temporaryPassword,
          resumeRevision: data.resumeRevision,
          candidateRevision: data.candidateRevision,
        }),
      });
      if (action === "save") {
        setNotice("Changes saved. The workflow is still waiting for review.");
        reload();
      } else {
        form.setFieldValue("temporaryPassword", "");
        window.location.assign(`/workflows/${data.run.workflowId}?tab=runs`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function generatePassword() {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    form.setFieldValue(
      "temporaryPassword",
      "Aa9!" + Array.from(bytes, (n) => chars[n % chars.length]).join(""),
    );
    form.setFieldValue("credentialsSaved", false);
  }
  const reviewable = data.run.status === "waiting_review";
  const assignNode = data.run.graph.nodes.find(
    (n) => n.kind === "assign_forms",
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            href={`/workflows/${data.run.workflowId}`}
          >
            <ArrowLeft className="size-4" /> {data.run.workflowName}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Review CV</h1>
            <RunBadge status={data.run.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {data.candidate?.fullName ?? "Unlinked candidate"} ·{" "}
            {data.run.fileName}
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={reload}>
          <RefreshCw /> Reload review
        </Button>
      </div>
      <Alert>
        <AlertDescription>
          {reviewable
            ? "The workflow pauses here until you review this resume."
            : "This review has already finished or the run is at another step. Open Runs for its current progress."}
        </AlertDescription>
      </Alert>
      {(data.possibleDuplicate || !data.candidate) && (
        <Alert variant="destructive">
          <AlertDescription>
            Resolve the possible duplicate or candidate link in the Resume
            Library, then reload this review.{" "}
            <Link
              className="font-medium underline"
              href={`/resumes/${data.run.resumeId}`}
            >
              Open resume
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <form
        id="cv-review-form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="grid min-w-0 gap-5 lg:grid-cols-2"
      >
        <Card className="overflow-hidden p-0">
          <div className="border-b px-5 py-3 font-semibold">Original CV</div>
          <div className="h-[650px] lg:h-[calc(100svh-18rem)] lg:min-h-[560px]">
            <ResumePdfPreview
              resumeId={data.run.resumeId}
              fileName={data.run.fileName}
              contained
            />
          </div>
        </Card>
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <div className="flex items-center justify-between">
              <CardTitle>Extracted data</CardTitle>
              <Badge variant="secondary">Review required</Badge>
            </div>
            <CardDescription>Review and edit before approval.</CardDescription>
          </CardHeader>
          <CardContent className="h-[650px] space-y-5 overflow-y-auto py-5 lg:h-[calc(100svh-18rem)] lg:min-h-[560px]">
            <fieldset disabled={busy || !reviewable} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {TEXT_FIELDS.filter(
                  ([key]) =>
                    allFields ||
                    [
                      "fullName",
                      "email",
                      "phone",
                      "address",
                      "currentTitle",
                    ].includes(key),
                ).map(([key, label]) => (
                  <form.Field key={key} name={`candidate.${key}`}>
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={`review-${key}`}>{label}</Label>
                        <Input
                          id={`review-${key}`}
                          type={key === "email" ? "email" : "text"}
                          value={field.state.value}
                          maxLength={
                            key === "address"
                              ? 500
                              : key === "email"
                                ? 254
                                : key === "phone"
                                  ? 40
                                  : key === "currentTitle"
                                    ? 160
                                    : 120
                          }
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            if (key === "email") {
                              setLookupEmail(e.target.value);
                              form.setFieldValue("existingAccountId", "");
                            }
                          }}
                        />
                      </div>
                    )}
                  </form.Field>
                ))}
              </div>
              {allFields && (
                <>
                  <form.Field name="candidate.dateOfBirth">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Date of birth</Label>
                        <DatePicker
                          value={field.state.value ?? ""}
                          onValueChange={(v) => field.handleChange(v || null)}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="candidate.professionalSummary">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="review-summary">
                          Professional summary
                        </Label>
                        <Textarea
                          id="review-summary"
                          maxLength={2000}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      </div>
                    )}
                  </form.Field>
                </>
              )}
              {LIST_FIELDS.filter(
                ([key]) =>
                  allFields || key === "workExperience" || key === "education",
              ).map(([key, label]) => (
                <form.Field key={key} name={`candidate.${key}`}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={`review-${key}`}>{label}</Label>
                      <Textarea
                        id={`review-${key}`}
                        className="min-h-20"
                        value={field.state.value.join("\n")}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value.split("\n").filter(Boolean),
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        One entry per line.
                      </p>
                    </div>
                  )}
                </form.Field>
              ))}
              <Button
                variant="ghost"
                type="button"
                size="sm"
                onClick={() => setAllFields((v) => !v)}
              >
                {allFields ? "Show fewer fields" : "Show all extracted fields"}
              </Button>
              <div className="space-y-3 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Review checklist</h2>
                <form.Field name="checks">
                  {(field) => (
                    <div className="space-y-3">
                      {CHECKS.map((label, i) => (
                        <label
                          key={label}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Checkbox
                            checked={field.state.value[i]}
                            onCheckedChange={(v) =>
                              field.handleChange(
                                field.state.value.map((c, index) =>
                                  index === i ? v === true : c,
                                ),
                              )
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </form.Field>
              </div>
              {sendsTelegram && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h2 className="text-sm font-semibold">Telegram connection</h2>
                  <form.Field name="telegramConnectionId">
                    {(field) => (
                      <Select
                        value={field.state.value || "none"}
                        onValueChange={(v) => {
                          field.handleChange(v === "none" ? "" : v);
                          form.setFieldValue("confirmTelegram", false);
                        }}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label="Candidate Telegram connection"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Not connected yet — wait for connection
                          </SelectItem>
                          {data.telegramConnections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.fullName || "New contact"} ·{" "}
                              {c.username
                                ? `@${c.username}`
                                : c.email || "Telegram user"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </form.Field>
                  <form.Field name="confirmTelegram">
                    {(field) => (
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={field.state.value}
                          onCheckedChange={(v) =>
                            field.handleChange(v === true)
                          }
                        />
                        <span>
                          I confirmed this Telegram contact belongs to this
                          candidate.
                        </span>
                      </label>
                    )}
                  </form.Field>
                  <p className="text-xs text-muted-foreground">
                    A name or email match alone does not confirm the contact.
                    Without a connection, the invitation waits after form
                    assignment.
                  </p>
                </div>
              )}
              <div className="space-y-3 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Candidate account</h2>
                {existing &&
                existing.email.toLowerCase() ===
                  lookupEmail.trim().toLowerCase() ? (
                  <form.Field name="existingAccountId">
                    {(field) => (
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={field.state.value === existing.id}
                          onCheckedChange={(v) =>
                            field.handleChange(v === true ? existing.id : "")
                          }
                        />
                        <span>
                          Use the existing account for{" "}
                          <strong>{existing.name}</strong>
                          <span className="block text-xs text-muted-foreground">
                            {existing.email}
                          </span>
                        </span>
                      </label>
                    )}
                  </form.Field>
                ) : sendsTelegram ? (
                  <p className="text-sm text-muted-foreground">
                    The candidate will receive a one-time activation link and
                    choose their own password. No temporary password needs to be
                    copied or shared.
                  </p>
                ) : (
                  <>
                    <form.Field name="temporaryPassword">
                      {(field) => (
                        <div className="space-y-2">
                          <Label htmlFor="temporary-password">
                            Temporary password
                          </Label>
                          <Input
                            id="temporary-password"
                            autoComplete="new-password"
                            type={showPassword ? "text" : "password"}
                            value={field.state.value}
                            maxLength={128}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                              form.setFieldValue("credentialsSaved", false);
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={generatePassword}
                            >
                              Generate
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowPassword((v) => !v)}
                            >
                              {showPassword ? "Hide" : "Show"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!field.state.value}
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(field.state.value)
                                  .then(() =>
                                    setNotice(
                                      "Temporary password copied. Share it through your existing process.",
                                    ),
                                  )
                                  .catch(() =>
                                    setError(
                                      "Copy failed. Show and save the password manually.",
                                    ),
                                  );
                              }}
                            >
                              <Copy /> Copy
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            12–128 characters with uppercase, lowercase, number,
                            and symbol. It will not be shown again after
                            approval.
                          </p>
                        </div>
                      )}
                    </form.Field>
                    <form.Field name="credentialsSaved">
                      {(field) => (
                        <label className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={field.state.value}
                            onCheckedChange={(v) =>
                              field.handleChange(v === true)
                            }
                          />
                          <span>
                            I saved the temporary password to share with this
                            candidate.
                          </span>
                        </label>
                      )}
                    </form.Field>
                  </>
                )}
              </div>
              <form.Field name="note">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="review-note">Reviewer note</Label>
                    <Textarea
                      id="review-note"
                      maxLength={2000}
                      placeholder="Optional for approval; required for rejection."
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            </fieldset>
            <form.Subscribe selector={(state) => state.errors}>
              {(errors) =>
                errors.length ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.map(String).join(" ")}
                  </p>
                ) : null
              }
            </form.Subscribe>
          </CardContent>
        </Card>
      </form>
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 shadow-sm">
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          After approval: create candidate account → link resume → assign{" "}
          {assignNode?.config.forms?.length ?? 0} forms
          {sendsTelegram ? " → send Telegram invitation" : ""}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !reviewable || !data.candidate}
            onClick={() => void decide("save", form.state.values)}
          >
            Save changes
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={busy || !reviewable}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </Button>
          <Button
            type="submit"
            form="cv-review-form"
            disabled={
              busy || !reviewable || !data.candidate || data.possibleDuplicate
            }
          >
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CheckCircle2 />
            )}{" "}
            Approve and continue
          </Button>
        </div>
      </div>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this CV?</DialogTitle>
            <DialogDescription>
              The workflow will stop. Add a reason so your team can understand
              this decision.
            </DialogDescription>
          </DialogHeader>
          <form.Field name="note">
            {(field) => (
              <Textarea
                aria-label="Rejection reason"
                value={field.state.value}
                maxLength={2000}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void decide("reject", form.state.values).then(() =>
                  setRejectOpen(false),
                );
              }}
            >
              Reject CV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
