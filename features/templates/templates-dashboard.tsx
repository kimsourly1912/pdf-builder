"use client";

import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Inbox,
  Link2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { formatCambodiaAddress } from "@/features/gazetteer/gazetteer";
import type { SubmissionAnswer } from "@/features/templates/label-binding";

type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  submissionCount: number;
  recipients: Array<{
    id: string;
    roleId: string;
    roleName: string;
    roleColor: string;
    status: string;
    expiresAt: string | null;
    maxSubmissions: number;
    submissionCount: number;
  }>;
};

type SubmissionSummary = {
  id: string;
  templateId: string;
  templateName: string;
  versionNumber: number;
  roleName: string;
  roleColor: string;
  recipientName: string;
  recipientEmail: string;
  values: Record<string, unknown>;
  answers: SubmissionAnswer[];
  hasCompletedPdf: boolean;
  submittedAt: string;
};

export function TemplatesDashboard(props: { displayName: string }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [activeView, setActiveView] = useState<"templates" | "submissions">(
    "templates",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>(
    {},
  );
  const [linkActionKey, setLinkActionKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [templateResponse, submissionResponse] = await Promise.all([
        fetch("/api/templates", { cache: "no-store" }),
        fetch("/api/submissions", { cache: "no-store" }),
      ]);
      const templatePayload = (await templateResponse.json()) as {
        templates?: TemplateSummary[];
        error?: string;
      };
      const submissionPayload = (await submissionResponse.json()) as {
        submissions?: SubmissionSummary[];
        error?: string;
      };
      if (!templateResponse.ok || !submissionResponse.ok) {
        throw new Error(
          templatePayload.error ||
            submissionPayload.error ||
            "Dashboard could not be loaded.",
        );
      }
      setTemplates(templatePayload.templates ?? []);
      setSubmissions(submissionPayload.submissions ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const totalRecipients = useMemo(
    () => templates.reduce((total, template) => total + template.recipients.length, 0),
    [templates],
  );

  async function regenerateLink(templateId: string, roleId: string) {
    const key = `${templateId}:${roleId}`;
    setLinkActionKey(key);
    setError("");
    try {
      const response = await fetch(`/api/templates/${templateId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        link?: {
          url: string;
          status: string;
          expiresAt: string | null;
          maxSubmissions: number;
          submissionCount: number;
        };
      };
      if (!response.ok || !payload.link) {
        throw new Error(payload.error || "A new link could not be created.");
      }
      setGeneratedLinks((current) => ({ ...current, [key]: payload.link!.url }));
      updateRecipientLink(templateId, roleId, payload.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A new link could not be created.");
    } finally {
      setLinkActionKey(null);
    }
  }

  async function revokeLink(templateId: string, roleId: string) {
    const key = `${templateId}:${roleId}`;
    setLinkActionKey(key);
    setError("");
    try {
      const response = await fetch(`/api/templates/${templateId}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, action: "revoke" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        link?: {
          status: string;
          expiresAt: string | null;
          maxSubmissions: number;
          submissionCount: number;
        };
      };
      if (!response.ok || !payload.link) {
        throw new Error(payload.error || "The link could not be revoked.");
      }
      setGeneratedLinks((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      updateRecipientLink(templateId, roleId, payload.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The link could not be revoked.");
    } finally {
      setLinkActionKey(null);
    }
  }

  function updateRecipientLink(
    templateId: string,
    roleId: string,
    link: {
      status: string;
      expiresAt: string | null;
      maxSubmissions: number;
      submissionCount: number;
    },
  ) {
    setTemplates((current) =>
      current.map((template) =>
        template.id !== templateId
          ? template
          : {
              ...template,
              recipients: template.recipients.map((recipient) =>
                recipient.roleId === roleId
                  ? { ...recipient, ...link }
                  : recipient,
              ),
            },
      ),
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/" aria-label="Back to editor"><ArrowLeft /></Link></Button>
            <div>
              <p className="text-sm font-bold text-slate-900">PDF Studio</p>
              <p className="text-xs text-slate-400">Templates and submissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-xs text-slate-500 sm:block">{props.displayName}</span>
            <SignOutButton />
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700"><Link href="/"><FileText className="size-4" /> New template</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Templates" value={templates.length} icon={<FolderOpen />} />
          <StatCard label="Recipient roles" value={totalRecipients} icon={<Link2 />} />
          <StatCard label="Submissions" value={submissions.length} icon={<Inbox />} />
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <Button type="button" size="sm" variant={activeView === "templates" ? "default" : "ghost"} onClick={() => setActiveView("templates")}><FolderOpen className="size-4" /> Templates</Button>
            <Button type="button" size="sm" variant={activeView === "submissions" ? "default" : "ghost"} onClick={() => setActiveView("submissions")}><Inbox className="size-4" /> Submissions</Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-slate-400"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : activeView === "templates" ? (
          <TemplateGrid templates={templates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} onRegenerate={regenerateLink} onRevoke={revokeLink} />
        ) : (
          <SubmissionList submissions={submissions} />
        )}
      </div>
    </main>
  );
}

function StatCard(props: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 [&_svg]:size-5">{props.icon}</span><div><p className="text-2xl font-bold tabular-nums">{props.value}</p><p className="text-xs font-medium text-slate-400">{props.label}</p></div></div>;
}

function TemplateGrid(props: {
  templates: TemplateSummary[];
  generatedLinks: Record<string, string>;
  linkActionKey: string | null;
  onRegenerate: (templateId: string, roleId: string) => Promise<void>;
  onRevoke: (templateId: string, roleId: string) => Promise<void>;
}) {
  if (props.templates.length === 0) return <EmptyState title="No templates yet" description="Open the editor, add fields, and choose Save template." />;
  return <div className="mt-5 grid gap-4 lg:grid-cols-2">{props.templates.map((template) => (
    <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-bold text-slate-900">{template.name}</h2><p className="mt-1 text-xs text-slate-400">{template.fileName} · {template.submissionCount} submission{template.submissionCount === 1 ? "" : "s"}</p></div><Button asChild variant="outline" size="sm"><a href={`/api/templates/${template.id}/pdf`}><Download className="size-3.5" /> PDF</a></Button></div>
      {template.description && <p className="mt-3 text-sm leading-6 text-slate-600">{template.description}</p>}
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        {template.recipients.map((recipient) => {
          const key = `${template.id}:${recipient.roleId}`;
          const url = props.generatedLinks[key];
          const busy = props.linkActionKey === key;
          return <div key={recipient.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: recipient.roleColor }} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{recipient.roleName}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{recipient.status}</span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void props.onRegenerate(template.id, recipient.roleId)}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {url ? "Regenerate" : "Create link"}</Button>{recipient.status === "active" && <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-rose-600 hover:text-rose-700" onClick={() => void props.onRevoke(template.id, recipient.roleId)}><Ban className="size-3.5" /> Revoke</Button>}</div><p className="mt-1 text-[11px] text-slate-400">{recipient.submissionCount}/{recipient.maxSubmissions} submissions · {recipient.expiresAt ? `expires ${formatDate(recipient.expiresAt)}` : "no expiry"}</p>{url && <div className="mt-2 flex gap-2"><input readOnly value={url} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500" /><Button type="button" variant="outline" size="icon-sm" aria-label={`Copy ${recipient.roleName} link`} onClick={() => void navigator.clipboard.writeText(url)}><Copy /></Button><Button asChild variant="outline" size="icon-sm"><a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${recipient.roleName} link`}><ExternalLink /></a></Button></div>}</div>;
        })}
      </div>
    </article>
  ))}</div>;
}

function SubmissionList(props: { submissions: SubmissionSummary[] }) {
  if (props.submissions.length === 0) return <EmptyState title="No submissions yet" description="Completed recipient forms will appear here." />;
  return <div className="mt-5 space-y-3">{props.submissions.map((submission) => (
    <article key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Check className="size-4 text-emerald-600" /> {submission.recipientName}</p><p className="mt-1 text-xs text-slate-400">{submission.templateName} v{submission.versionNumber} · {submission.roleName} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.submittedAt))}</p>{submission.recipientEmail && <p className="mt-1 text-xs text-slate-500">{submission.recipientEmail}</p>}</div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/excel`}><FileSpreadsheet className="size-3.5" /> Excel</a></Button>{submission.hasCompletedPdf && <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/pdf`}><Download className="size-3.5" /> Completed PDF</a></Button>}</div></div>
      <details className="mt-4 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">View submitted values</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{submission.answers.map((answer) => <div key={answer.fieldId} className="rounded-lg bg-white p-2"><dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{answer.label}</dt><dd className="mt-1 break-words text-sm text-slate-700">{isPublicSubmissionImage(answer.value) ? <Image src={answer.value.url} alt={answer.label} width={Math.min(answer.value.width, 480)} height={Math.min(answer.value.height, 320)} unoptimized className="max-h-48 w-auto rounded-md object-contain" /> : formatValue(answer.value)}</dd><dd className="mt-1 font-mono text-[10px] text-slate-400">{answer.key}</dd></div>)}</dl></details>
    </article>
  ))}</div>;
}

function EmptyState(props: { title: string; description: string }) {
  return <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FolderOpen className="size-5" /></span><p className="mt-4 text-sm font-bold text-slate-700">{props.title}</p><p className="mt-1 text-xs text-slate-400">{props.description}</p></div>;
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object" && "province" in value) {
    return formatCambodiaAddress(value, "bilingual") || "—";
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "—");
}

function isPublicSubmissionImage(value: unknown): value is {
  kind: "submission-image";
  url: string;
  width: number;
  height: number;
  size: number;
} {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return (
    image.kind === "submission-image" &&
    typeof image.url === "string" &&
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    typeof image.size === "number"
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
