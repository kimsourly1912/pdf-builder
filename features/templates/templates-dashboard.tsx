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
  Pencil,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { formatCambodiaAddress } from "@/features/gazetteer/gazetteer";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";
import type { SubmissionAnswer } from "@/features/templates/label-binding";
import { localDateRangeToUtc } from "@/features/templates/submission-filters";

type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  versionNumber: number;
  currentRoles: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  filterRoles: Array<{
    id: string;
    name: string;
    color: string;
  }>;
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
  roleId: string;
  roleName: string;
  roleColor: string;
  recipientName: string;
  recipientEmail: string;
  values: Record<string, unknown>;
  answers: SubmissionAnswer[];
  hasCompletedPdf: boolean;
  submittedAt: string;
};

type DashboardFilters = {
  templateId: string;
  roleId: string;
  search: string;
  fromDate: string;
  toDate: string;
};

const EMPTY_FILTERS: DashboardFilters = {
  templateId: "",
  roleId: "",
  search: "",
  fromDate: "",
  toDate: "",
};

export function TemplatesDashboard(props: { displayName: string }) {
  const copyLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [activeView, setActiveView] = useState<"templates" | "submissions">(
    "templates",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>(
    {},
  );
  const [linkActionKey, setLinkActionKey] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [localTimeZone, setLocalTimeZone] = useState("UTC");
  const [filterDraft, setFilterDraft] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const submissionParams = submissionFilterParams(appliedFilters);
      const [templateResponse, submissionResponse] = await Promise.all([
        fetch("/api/templates", { cache: "no-store" }),
        fetch(`/api/submissions?${submissionParams}`, { cache: "no-store" }),
      ]);
      const templatePayload = (await templateResponse.json()) as {
        templates?: TemplateSummary[];
        error?: string;
      };
      const submissionPayload = (await submissionResponse.json()) as {
        submissions?: SubmissionSummary[];
        total?: number;
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
      setSubmissionTotal(submissionPayload.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLocalTimeZone(resolvedLocalTimeZone()),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
    };
  }, []);

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

  async function copyGeneratedLink(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setError("");
      setCopiedLinkKey(key);
      if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
      copyLinkTimerRef.current = setTimeout(
        () => setCopiedLinkKey(null),
        1800,
      );
    } catch {
      setError("Clipboard access was blocked. Select and copy the link manually.");
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
            <Button asChild variant="outline" size="sm"><Link href="/accounts"><UsersRound className="size-4" /> Accounts</Link></Button>
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700"><Link href="/"><FileText className="size-4" /> New template</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Templates" value={templates.length} icon={<FolderOpen />} />
          <StatCard label="Recipient roles" value={totalRecipients} icon={<Link2 />} />
          <StatCard label="Submissions" value={submissionTotal} icon={<Inbox />} />
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
          <TemplateGrid templates={templates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} copiedLinkKey={copiedLinkKey} localTimeZone={localTimeZone} onRegenerate={regenerateLink} onRevoke={revokeLink} onCopy={copyGeneratedLink} />
        ) : (
          <div>
            <SubmissionFilterPanel
              templates={templates}
              draft={filterDraft}
              applied={appliedFilters}
              total={submissionTotal}
              localTimeZone={localTimeZone}
              onDraftChange={setFilterDraft}
              onApply={() => setAppliedFilters(filterDraft)}
              onClear={() => {
                setFilterDraft(EMPTY_FILTERS);
                setAppliedFilters(EMPTY_FILTERS);
              }}
            />
            <SubmissionList submissions={submissions} localTimeZone={localTimeZone} />
          </div>
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
  copiedLinkKey: string | null;
  localTimeZone: string;
  onRegenerate: (templateId: string, roleId: string) => Promise<void>;
  onRevoke: (templateId: string, roleId: string) => Promise<void>;
  onCopy: (key: string, url: string) => Promise<void>;
}) {
  if (props.templates.length === 0) return <EmptyState title="No templates yet" description="Open the editor, add fields, and choose Save template." />;
  return <div className="mt-5 grid gap-4 lg:grid-cols-2">{props.templates.map((template) => (
    <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-bold text-slate-900">{template.name}</h2><p className="mt-1 text-xs text-slate-400">{template.fileName} · v{template.versionNumber} · {template.submissionCount} submission{template.submissionCount === 1 ? "" : "s"}</p></div><div className="flex shrink-0 gap-2"><Button asChild variant="outline" size="sm"><Link href={`/?templateId=${encodeURIComponent(template.id)}`}><Pencil className="size-3.5" /> Edit</Link></Button><Button asChild variant="outline" size="sm"><a href={`/api/templates/${template.id}/pdf`}><Download className="size-3.5" /> PDF</a></Button></div></div>
      {template.description && <p className="mt-3 text-sm leading-6 text-slate-600">{template.description}</p>}
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        {template.recipients.map((recipient) => {
          const key = `${template.id}:${recipient.roleId}`;
          const url = props.generatedLinks[key];
          const busy = props.linkActionKey === key;
          const copied = props.copiedLinkKey === key;
          return <div key={recipient.id} className={`rounded-xl p-3 transition-[background-color,box-shadow] duration-300 ${copied ? "bg-emerald-50 shadow-sm shadow-emerald-100" : "bg-slate-50"}`}><div className="flex flex-wrap items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: recipient.roleColor }} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{recipient.roleName}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{recipient.status}</span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void props.onRegenerate(template.id, recipient.roleId)}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {url ? "Regenerate" : "Create link"}</Button>{recipient.status === "active" && <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-rose-600 hover:text-rose-700" onClick={() => void props.onRevoke(template.id, recipient.roleId)}><Ban className="size-3.5" /> Revoke</Button>}</div><p className="mt-1 text-[11px] text-slate-400">{recipient.submissionCount}/{recipient.maxSubmissions} submissions · {recipient.expiresAt ? `expires ${formatLocalDateTime(recipient.expiresAt, { timeZone: props.localTimeZone })}` : "no expiry"}</p>{url && <div className="mt-2 flex gap-2"><input readOnly value={url} className={`h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-xs transition-colors duration-300 ${copied ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}`} /><Button type="button" variant="outline" size="icon-sm" className={copied ? "copy-link-success border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700" : ""} aria-label={copied ? `Copied ${recipient.roleName} link` : `Copy ${recipient.roleName} link`} title={copied ? "Copied!" : "Copy link"} onClick={() => void props.onCopy(key, url)}>{copied ? <Check /> : <Copy />}<span aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</span></Button><Button asChild variant="outline" size="icon-sm"><a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${recipient.roleName} link`}><ExternalLink /></a></Button></div>}</div>;
        })}
      </div>
    </article>
  ))}</div>;
}

function SubmissionFilterPanel(props: {
  templates: TemplateSummary[];
  draft: DashboardFilters;
  applied: DashboardFilters;
  total: number;
  localTimeZone: string;
  onDraftChange: (filters: DashboardFilters) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const selectedTemplate = props.templates.find(
    (template) => template.id === props.draft.templateId,
  );
  const roles = selectedTemplate
    ? selectedTemplate.filterRoles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
      }))
    : uniqueRoles(props.templates);
  const exportParams = submissionFilterParams(props.applied);
  exportParams.set("timeZone", props.localTimeZone);
  const canExport = props.total > 0;

  function update(changes: Partial<DashboardFilters>) {
    props.onDraftChange({ ...props.draft, ...changes });
  }

  return (
    <section className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApply();
        }}
      >
        <label className="relative min-w-0 text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-2">
          Search
          <Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-slate-400" />
          <input
            value={props.draft.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Recipient, email, template…"
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-normal outline-none focus:border-blue-500"
          />
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          Template
          <select
            value={props.draft.templateId}
            onChange={(event) => update({ templateId: event.target.value, roleId: "" })}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500"
          >
            <option value="">All templates</option>
            {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          Recipient role
          <select
            value={props.draft.roleId}
            onChange={(event) => update({ roleId: event.target.value })}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500"
          >
            <option value="">All roles</option>
            {roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleName}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          From
          <input type="date" value={props.draft.fromDate} onChange={(event) => update({ fromDate: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500" />
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          To
          <input type="date" value={props.draft.toDate} onChange={(event) => update({ toDate: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500" />
        </label>
        <div className="flex min-w-0 justify-end gap-2 sm:col-span-2 xl:col-span-6">
          <Button type="submit" size="sm" className="h-10 min-w-24">Apply filters</Button>
          <Button type="button" variant="ghost" size="sm" className="h-10 min-w-20" onClick={props.onClear}>Clear</Button>
        </div>
      </form>
      <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">{props.total} matching submission{props.total === 1 ? "" : "s"}</p>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button asChild={canExport} disabled={!canExport} variant="outline" size="sm" className="min-w-0">
            {canExport ? <a href={`/api/submissions/export?${withFormat(exportParams, "xlsx")}`}><FileSpreadsheet className="size-3.5" /> Export Excel</a> : <span><FileSpreadsheet className="size-3.5" /> Export Excel</span>}
          </Button>
          <Button asChild={canExport} disabled={!canExport} variant="outline" size="sm" className="min-w-0">
            {canExport ? <a href={`/api/submissions/export?${withFormat(exportParams, "csv")}`}><Download className="size-3.5" /> Export CSV</a> : <span><Download className="size-3.5" /> Export CSV</span>}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SubmissionList(props: {
  submissions: SubmissionSummary[];
  localTimeZone: string;
}) {
  if (props.submissions.length === 0) return <EmptyState title="No submissions yet" description="Completed recipient forms will appear here." />;
  return <div className="mt-5 space-y-3">{props.submissions.map((submission) => (
    <article key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Check className="size-4 text-emerald-600" /> {submission.recipientName}</p><p className="mt-1 text-xs text-slate-400">{submission.templateName} v{submission.versionNumber} · {submission.roleName} · {formatLocalDateTime(submission.submittedAt, { timeZone: props.localTimeZone })}</p>{submission.recipientEmail && <p className="mt-1 text-xs text-slate-500">{submission.recipientEmail}</p>}</div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/excel?timeZone=${encodeURIComponent(props.localTimeZone)}`}><FileSpreadsheet className="size-3.5" /> Excel</a></Button>{submission.hasCompletedPdf && <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/pdf`}><Download className="size-3.5" /> Completed PDF</a></Button>}</div></div>
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

function submissionFilterParams(filters: DashboardFilters) {
  const params = new URLSearchParams();
  if (filters.templateId) params.set("templateId", filters.templateId);
  if (filters.roleId) params.set("roleId", filters.roleId);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  const range = localDateRangeToUtc(filters.fromDate, filters.toDate);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return params;
}

function uniqueRoles(templates: TemplateSummary[]) {
  const roles = new Map<string, { roleId: string; roleName: string }>();
  for (const template of templates) {
    for (const role of template.filterRoles) {
      if (!roles.has(role.id)) {
        roles.set(role.id, { roleId: role.id, roleName: role.name });
      }
    }
  }
  return [...roles.values()];
}

function withFormat(params: URLSearchParams, format: "xlsx" | "csv") {
  const next = new URLSearchParams(params);
  next.set("format", format);
  return next.toString();
}
