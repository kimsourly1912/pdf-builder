"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Save,
  Archive,
  UserCheck,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import type {
  ResumeCandidateSummary,
  ResumeDetail,
  ResumeExtractionFields,
} from "@/features/resumes/resume.types";

type CandidateDraft = Omit<ResumeCandidateSummary, "id" | "verificationStatus">;

export function ResumeDetailView(props: { resumeId: string }) {
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [draft, setDraft] = useState<CandidateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setArchiveOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false),
    [confirmTelegram, setConfirmTelegram] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadResume = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        resume?: ResumeDetail;
        error?: string;
      };

      if (!response.ok || !payload.resume) {
        throw new Error(payload.error || "The resume could not be loaded.");
      }

      setResume(payload.resume);
      setConfirmTelegram(payload.resume.telegramContact?.confirmed ?? false);
      setDraft(
        payload.resume.candidate
          ? candidateDraft(payload.resume.candidate)
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The resume could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [props.resumeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadResume(), 0);
    return () => window.clearTimeout(timer);
  }, [loadResume]);

  async function saveCandidate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_candidate",
          candidate: draft,
          confirmTelegram,
          resumeRevision: resume?.updatedAt,
          candidateRevision: resume?.candidateRevision,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          payload.error || "Candidate information could not be saved.",
        );
      }

      setNotice("Candidate information verified and saved.");
      await loadResume();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Candidate information could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function linkDuplicate() {
    if (!resume?.duplicateCandidate) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_candidate",
          candidateId: resume.duplicateCandidate.id,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Candidate could not be linked.");
      }

      setNotice(
        "Resume linked to the existing candidate. Existing verified data was preserved.",
      );
      await loadResume();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Candidate could not be linked.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryExtraction() {
    if (!resume) return;
    setAiOpen(false);

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        resume.intakeId
          ? `/api/intake/${resume.intakeId}/extract`
          : `/api/resumes/${resume.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, reextract: true }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Extraction could not be retried.");
      }

      setNotice("AI resume analysis completed.");
      await loadResume();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Extraction could not be retried.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteResume() {
    if (!resume) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/resumes/${resume.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Resume could not be archived.");
      }

      window.location.assign("/resumes");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Resume could not be archived.",
      );
      setBusy(false);
      setArchiveOpen(false);
    }
  }

  if (loading) {
    return (
      <CenteredState
        title="Opening resume…"
        icon={<LoaderCircle className="animate-spin" />}
      />
    );
  }

  if (!resume) {
    return (
      <CenteredState
        title={error || "Resume not found"}
        icon={<AlertTriangle />}
      />
    );
  }

  const fields = resume.extraction?.fields;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/resumes" aria-label="Back to resumes">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {resume.candidate?.fullName || resume.fileName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {resume.fileName} · Extraction v
                {resume.extractionVersion ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/resumes/${resume.id}/download`} download>
                <Download /> Download
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setAiOpen(true)}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} />
              Optional AI extraction
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="text-destructive hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive /> Archive
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle />
            <AlertTitle>Resume action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {notice && !error && (
          <Alert
            className="mb-4 border-success/30 bg-success/10 text-success-foreground"
            role="status"
          >
            <CheckCircle2 />
            <AlertTitle>Completed</AlertTitle>
            <AlertDescription className="text-success-foreground/80">
              {notice}
            </AlertDescription>
          </Alert>
        )}

        {resume.duplicateCandidate && (
          <Alert
            variant="destructive"
            className="mb-4 grid-cols-[auto_1fr] gap-4 bg-destructive/5"
          >
            <AlertTriangle />
            <div className="min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <AlertTitle>Possible existing candidate</AlertTitle>
                  <AlertDescription className="mt-1">
                    Matched{" "}
                    {resume.duplicateCandidate.fullName ||
                      "an existing candidate"}{" "}
                    using email or phone. Review before linking; existing data
                    will not be overwritten.
                  </AlertDescription>
                </div>
                <Button
                  disabled={busy}
                  variant="destructive"
                  onClick={() => void linkDuplicate()}
                >
                  <UserCheck /> Link candidate
                </Button>
              </div>
              <DuplicateComparison
                existing={resume.duplicateCandidate}
                fields={fields}
              />
            </div>
          </Alert>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(500px,1fr)_minmax(430px,560px)]">
          <Card className="gap-0 overflow-hidden py-0 xl:sticky xl:top-20">
            <ResumePdfPreview resumeId={resume.id} fileName={resume.fileName} />
          </Card>

          <section className="space-y-4">
            <ResumeMeta resume={resume} />

            {draft ? (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle>Candidate information</CardTitle>
                    <CardDescription>
                      Correct extracted values, then save to mark them verified.
                    </CardDescription>
                  </div>
                  {resume.verificationStatus === "verified" ? (
                    <Badge className="bg-success/10 text-success">
                      <CheckCircle2 /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      {resume.verificationStatus.replaceAll("_", " ")}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <form onSubmit={saveCandidate}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="Full name"
                        value={draft.fullName}
                        onChange={(value) =>
                          setDraft({ ...draft, fullName: value })
                        }
                        meta={fields?.fullName}
                      />
                      <TextField
                        label="Current title"
                        value={draft.currentTitle}
                        onChange={(value) =>
                          setDraft({ ...draft, currentTitle: value })
                        }
                        meta={fields?.currentTitle}
                      />
                      <TextField
                        label="Email"
                        type="email"
                        value={draft.email}
                        onChange={(value) =>
                          setDraft({ ...draft, email: value })
                        }
                        meta={fields?.emails}
                      />
                      <TextField
                        label="Phone"
                        value={draft.phone}
                        onChange={(value) =>
                          setDraft({ ...draft, phone: value })
                        }
                        meta={fields?.phones}
                      />
                      <TextField
                        label="Date of birth"
                        date
                        value={draft.dateOfBirth ?? ""}
                        onChange={(value) =>
                          setDraft({ ...draft, dateOfBirth: value || null })
                        }
                        meta={fields?.dateOfBirth}
                      />
                      <TextField
                        label="Gender"
                        value={draft.gender}
                        onChange={(value) =>
                          setDraft({ ...draft, gender: value })
                        }
                        meta={fields?.gender}
                      />
                      <TextField
                        label="Nationality"
                        value={draft.nationality}
                        onChange={(value) =>
                          setDraft({ ...draft, nationality: value })
                        }
                        meta={fields?.nationality}
                      />
                      <div className="sm:col-span-2">
                        <TextField
                          label="Address"
                          value={draft.address}
                          onChange={(value) =>
                            setDraft({ ...draft, address: value })
                          }
                          meta={fields?.address}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <TextAreaField
                          label="Professional summary"
                          value={draft.professionalSummary}
                          onChange={(value) =>
                            setDraft({
                              ...draft,
                              professionalSummary: value,
                            })
                          }
                          meta={fields?.professionalSummary}
                        />
                      </div>
                      {(
                        [
                          "skills",
                          "workExperience",
                          "education",
                          "certifications",
                          "languages",
                          "links",
                        ] as const
                      ).map((key) => (
                        <TextAreaField
                          key={key}
                          label={fieldLabel(key)}
                          value={draft[key].join("\n")}
                          onChange={(value) =>
                            setDraft({ ...draft, [key]: lines(value) })
                          }
                          meta={fields?.[key]}
                        />
                      ))}
                    </div>
                    {resume.telegramContact && (
                      <label className="mt-5 flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={confirmTelegram}
                          onCheckedChange={(v) =>
                            setConfirmTelegram(v === true)
                          }
                        />
                        <span>
                          I confirmed this Telegram contact belongs to this
                          candidate (
                          {resume.telegramContact.username
                            ? `@${resume.telegramContact.username}`
                            : "connected user"}
                          ).
                        </span>
                      </label>
                    )}
                    <Button
                      type="submit"
                      disabled={busy || resume.archived}
                      className="mt-5 w-full"
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Save />
                      )}
                      Save and verify CV
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Alert className="border-warning/30 bg-warning/10 text-warning-foreground">
                <AlertTriangle />
                <AlertTitle>Candidate profile needs attention</AlertTitle>
                <AlertDescription className="text-warning-foreground/80">
                  No new profile was created because extraction failed or this
                  resume may belong to an existing candidate. Retry extraction
                  or link the suggested candidate.
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </div>

      {resume.intakeId && (
        <Button asChild variant="outline">
          <Link href={`/intake/${resume.intakeId}`}>
            Back to intake overview
          </Link>
        </Button>
      )}
      <AlertDialog open={aiOpen} onOpenChange={setAiOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extract this CV with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              This uses paid AI processing. You can enter and verify candidate
              details manually instead. Extracting an already reviewed CV
              replaces its data and requires a new review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || resume.archived}
              onClick={() => void retryExtraction()}
            >
              Confirm paid extraction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Archive />
            </AlertDialogMedia>
            <AlertDialogTitle>Archive this resume?</AlertDialogTitle>
            <AlertDialogDescription>
              The CV and linked intake will be hidden from active lists. The PDF
              and history remain stored and can be restored from Archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void deleteResume()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Archive />}
              Archive resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DuplicateComparison(props: {
  existing: ResumeCandidateSummary;
  fields: ResumeExtractionFields | undefined;
}) {
  const rows = [
    [
      "Name",
      props.fields?.fullName.value ?? "—",
      props.existing.fullName || "—",
    ],
    [
      "Email",
      props.fields?.emails.value?.[0] ?? "—",
      props.existing.email || "—",
    ],
    [
      "Phone",
      props.fields?.phones.value?.[0] ?? "—",
      props.existing.phone || "—",
    ],
    [
      "Position",
      props.fields?.currentTitle.value ?? "—",
      props.existing.currentTitle || "—",
    ],
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-destructive/20 bg-card text-card-foreground">
      <Table>
        <TableHeader className="bg-destructive/5">
          <TableRow className="border-destructive/10 hover:bg-transparent">
            <TableHead>Field</TableHead>
            <TableHead>Extracted PDF</TableHead>
            <TableHead>Existing candidate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, extracted, existing]) => (
            <TableRow key={label} className="border-destructive/10">
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="whitespace-normal">{extracted}</TableCell>
              <TableCell className="whitespace-normal">{existing}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResumeMeta(props: { resume: ResumeDetail }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-5" />
        </span>
        <div>
          <CardTitle>Resume intake</CardTitle>
          <CardDescription>Original PDF and processing state</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Meta label="Extraction" value={props.resume.extractionStatus} />
          <Meta
            label="Resume verification"
            value={props.resume.verificationStatus.replaceAll("_", " ")}
          />
          <Meta label="Pages" value={String(props.resume.pageCount)} />
          <Meta
            label="Source"
            value={props.resume.source.replaceAll("_", " ")}
          />
          <Meta label="Received" value={props.resume.receivedDate} />
          <Meta
            label="Applied position"
            value={props.resume.appliedPosition || "—"}
          />
          <Meta
            label="File size"
            value={`${(props.resume.fileSize / 1024 / 1024).toFixed(1)} MB`}
          />
        </dl>

        {props.resume.note && (
          <p className="mt-4 rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">
            {props.resume.note}
          </p>
        )}
        {props.resume.errorMessage && (
          <p className="mt-3 text-xs font-medium text-destructive">
            {props.resume.errorMessage}
          </p>
        )}
        {props.resume.extraction &&
          props.resume.extraction.scannedPageCount > 0 && (
            <p className="mt-3 text-xs text-warning-foreground">
              {props.resume.extraction.scannedPageCount} page(s) had little or
              no selectable text. Review those pages manually.
            </p>
          )}
      </CardContent>
    </Card>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </dt>
      <dd className="mt-1 capitalize">{props.value}</dd>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  type?: "email";
  date?: boolean;
  onChange: (value: string) => void;
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      {props.date ? (
        <DatePicker
          value={props.value}
          onValueChange={props.onChange}
          placeholder="Pick a date"
          aria-label={props.label}
        />
      ) : (
        <Input
          aria-label={props.label}
          type={props.type ?? "text"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      <Confidence meta={props.meta} />
    </div>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <Textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        rows={4}
        className="resize-y"
      />
      <Confidence meta={props.meta} />
    </div>
  );
}

function Confidence(props: {
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  if (!props.meta) return null;

  return (
    <span className="block text-[10px] text-muted-foreground">
      {props.meta.verification === "verified"
        ? "Verified by HR"
        : `Extracted · ${Math.round(props.meta.confidence * 100)}% confidence${
            props.meta.sourcePage ? ` · page ${props.meta.sourcePage}` : ""
          }`}
    </span>
  );
}

function candidateDraft(candidate: ResumeCandidateSummary): CandidateDraft {
  return {
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    address: candidate.address,
    dateOfBirth: candidate.dateOfBirth,
    gender: candidate.gender,
    nationality: candidate.nationality,
    currentTitle: candidate.currentTitle,
    professionalSummary: candidate.professionalSummary,
    skills: candidate.skills,
    workExperience: candidate.workExperience,
    education: candidate.education,
    certifications: candidate.certifications,
    languages: candidate.languages,
    links: candidate.links,
  };
}

function lines(value: string) {
  return value
    .split(/\r?\n/gu)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldLabel(value: string) {
  return value
    .replace(/([A-Z])/gu, " $1")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function CenteredState(props: { title: string; icon: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardContent className="pt-1">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6">
            {props.icon}
          </span>
          <p className="mt-4 font-semibold">{props.title}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/resumes">Back to Resume Library</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
