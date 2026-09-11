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
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  archivedAt: string | null;
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
  assignmentCount: number;
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
  const [notice, setNotice] = useState("");
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>(
    {},
  );
  const [linkActionKey, setLinkActionKey] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [localTimeZone, setLocalTimeZone] = useState("UTC");
  const [templatePendingRemoval, setTemplatePendingRemoval] =
    useState<TemplateSummary | null>(null);
  const [removingTemplateId, setRemovingTemplateId] = useState<string | null>(
    null,
  );
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

  const activeTemplates = useMemo(
    () => templates.filter((template) => !template.archivedAt),
    [templates],
  );
  const totalRecipients = useMemo(
    () => activeTemplates.reduce((total, template) => total + template.recipients.length, 0),
    [activeTemplates],
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

  async function removeTemplate(template: TemplateSummary) {
    setRemovingTemplateId(template.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        error?: string;
        template?: {
          id: string;
          disposition: "archive" | "delete";
          archivedAt: string | null;
        };
      };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "The template could not be removed.");
      }

      if (payload.template.disposition === "delete") {
        setTemplates((current) =>
          current.filter((item) => item.id !== template.id),
        );
        if (appliedFilters.templateId === template.id) {
          setFilterDraft(EMPTY_FILTERS);
          setAppliedFilters(EMPTY_FILTERS);
        }
        setNotice(`“${template.name}” was permanently deleted.`);
      } else {
        setTemplates((current) =>
          current.map((item) =>
            item.id === template.id
              ? { ...item, archivedAt: payload.template!.archivedAt }
              : item,
          ),
        );
        setNotice(
          `“${template.name}” was archived. Existing assignments and submissions were preserved.`,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The template could not be removed.",
      );
    } finally {
      setRemovingTemplateId(null);
      setTemplatePendingRemoval(null);
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
            <Button asChild variant="outline" size="sm"><Link href="/resumes"><FileText className="size-4" /> Resumes</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/accounts"><UsersRound className="size-4" /> Accounts</Link></Button>
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700"><Link href="/"><FileText className="size-4" /> New template</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Active templates" value={activeTemplates.length} icon={<FolderOpen />} />
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
        {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-slate-400"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : activeView === "templates" ? (
          <TemplateGrid templates={activeTemplates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} copiedLinkKey={copiedLinkKey} removingTemplateId={removingTemplateId} localTimeZone={localTimeZone} onRegenerate={regenerateLink} onRevoke={revokeLink} onCopy={copyGeneratedLink} onRequestRemove={setTemplatePendingRemoval} />
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
      <TemplateRemovalDialog
        template={templatePendingRemoval}
        removing={removingTemplateId !== null}
        onOpenChange={(open) => {
          if (!open && !removingTemplateId) setTemplatePendingRemoval(null);
        }}
        onConfirm={(template) => void removeTemplate(template)}
      />
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
  removingTemplateId: string | null;
  localTimeZone: string;
  onRegenerate: (templateId: string, roleId: string) => Promise<void>;
  onRevoke: (templateId: string, roleId: string) => Promise<void>;
  onCopy: (key: string, url: string) => Promise<void>;
  onRequestRemove: (template: TemplateSummary) => void;
}) {
  if (props.templates.length === 0) return <EmptyState title="No templates yet" description="Open the editor, add fields, and choose Save template." />;
  return <div className="mt-5 grid gap-4 lg:grid-cols-2">{props.templates.map((template) => (
    <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-bold text-slate-900">{template.name}</h2><p className="mt-1 text-xs text-slate-400">{template.fileName} · v{template.versionNumber} · {template.submissionCount} submission{template.submissionCount === 1 ? "" : "s"}</p></div><div className="flex shrink-0 flex-wrap justify-end gap-2"><Button asChild variant="outline" size="sm"><Link href={`/?templateId=${encodeURIComponent(template.id)}`}><Pencil className="size-3.5" /> Edit</Link></Button><Button asChild variant="outline" size="sm"><a href={`/api/templates/${template.id}/pdf`}><Download className="size-3.5" /> PDF</a></Button><Button type="button" variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" disabled={props.removingTemplateId !== null} onClick={() => props.onRequestRemove(template)}>{props.removingTemplateId === template.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove</Button></div></div>
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

function TemplateRemovalDialog(props: {
  template: TemplateSummary | null;
  removing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (template: TemplateSummary) => void;
}) {
  const template = props.template;
  const willArchive = Boolean(
    template && (template.submissionCount > 0 || template.assignmentCount > 0),
  );
  return (
    <AlertDialog open={Boolean(template)} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              willArchive
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700"
            }
          >
            <TriangleAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {willArchive ? "Archive this template?" : "Delete this template permanently?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            {willArchive && template
              ? `“${template.name}” has ${template.assignmentCount} assignment${template.assignmentCount === 1 ? "" : "s"} and ${template.submissionCount} submission${template.submissionCount === 1 ? "" : "s"}. It will be hidden, active links will be revoked, and historical records will remain available.`
              : `“${template?.name ?? "This template"}” has no assignments or submissions. Its template record and stored PDF versions will be permanently deleted. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.removing}>Keep template</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={props.removing || !template}
            onClick={() => {
              if (template) props.onConfirm(template);
            }}
          >
            {props.removing && <LoaderCircle className="size-4 animate-spin" />}
            {willArchive ? "Archive template" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedTemplate = props.templates.find(
    (template) => template.id === props.draft.templateId,
  );
  const roles = selectedTemplate
    ? selectedTemplate.filterRoles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
      }))
    : uniqueRoles(props.templates);
  const appliedTemplate = props.templates.find(
    (template) => template.id === props.applied.templateId,
  );
  const filtersChanged = !dashboardFiltersEqual(props.draft, props.applied);
  const exportParams = submissionFilterParams(props.applied);
  exportParams.set("timeZone", props.localTimeZone);
  const canExport = Boolean(appliedTemplate) && props.total > 0 && !filtersChanged;
  const exportDescription = bulkExportDescription({
    filtersChanged,
    templateName: appliedTemplate?.name,
    total: props.total,
  });
  const appliedRole = uniqueRoles(props.templates).find(
    (role) => role.roleId === props.applied.roleId,
  );
  const activeFilterCount = countAdvancedFilters(props.applied);
  const appliedFilterLabels = [
    appliedTemplate ? `Template: ${appliedTemplate.name}` : "",
    appliedRole ? `Role: ${appliedRole.roleName}` : "",
    props.applied.fromDate ? `From: ${props.applied.fromDate}` : "",
    props.applied.toDate ? `To: ${props.applied.toDate}` : "",
  ].filter(Boolean);

  function update(changes: Partial<DashboardFilters>) {
    props.onDraftChange({ ...props.draft, ...changes });
  }

  return (
    <section className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form
        className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApply();
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search submissions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={props.draft.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Search recipient, email, or template…"
            className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-normal outline-none focus:border-blue-500"
          />
        </label>
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" className="h-10 min-w-20">Search</Button>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-10 min-w-24">
                <SlidersHorizontal className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
              <PopoverHeader className="border-b border-slate-100 p-4">
                <PopoverTitle>Filter submissions</PopoverTitle>
                <PopoverDescription>
                  Narrow the results before reviewing or exporting them.
                </PopoverDescription>
              </PopoverHeader>
              <div className="grid gap-4 p-4">
                <label className="text-xs font-semibold text-slate-600">
                  Template
                  <select
                    value={props.draft.templateId}
                    onChange={(event) => update({ templateId: event.target.value, roleId: "" })}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500"
                  >
                    <option value="">All templates</option>
                    {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.archivedAt ? " (Archived)" : ""}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
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
                <fieldset>
                  <legend className="text-xs font-semibold text-slate-600">Submitted date</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-medium text-slate-500">
                      From
                      <input type="date" value={props.draft.fromDate} onChange={(event) => update({ fromDate: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal outline-none focus:border-blue-500" />
                    </label>
                    <label className="text-[11px] font-medium text-slate-500">
                      To
                      <input type="date" value={props.draft.toDate} onChange={(event) => update({ toDate: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal outline-none focus:border-blue-500" />
                    </label>
                  </div>
                </fieldset>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
                <Button type="button" variant="ghost" size="sm" onClick={() => { props.onClear(); setFiltersOpen(false); }}>Clear all</Button>
                <Button type="button" size="sm" onClick={() => { props.onApply(); setFiltersOpen(false); }}>Apply filters</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </form>
      {appliedFilterLabels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Applied filters">
          <span className="text-[11px] font-semibold text-slate-400">Applied:</span>
          {appliedFilterLabels.map((label) => (
            <span key={label} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
              {label}
            </span>
          ))}
          <Button type="button" variant="ghost" size="xs" className="h-7 text-xs text-slate-500" onClick={props.onClear}>Clear</Button>
        </div>
      )}
      <div className="mt-4 flex min-w-0 flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-slate-500">{props.total} matching submission{props.total === 1 ? "" : "s"}</p>
        <div className="min-w-0 sm:max-w-xl sm:text-right">
          <p className="text-xs font-bold text-slate-700">Bulk export</p>
          <p id="bulk-export-description" aria-live="polite" className="mt-1 text-xs leading-5 text-slate-500">{exportDescription}</p>
          <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button asChild={canExport} disabled={!canExport} variant="outline" size="sm" className="min-w-0" aria-describedby="bulk-export-description">
              {canExport ? <a href={`/api/submissions/export?${withFormat(exportParams, "xlsx")}`}><FileSpreadsheet className="size-3.5" /> Bulk Excel</a> : <span><FileSpreadsheet className="size-3.5" /> Bulk Excel</span>}
            </Button>
            <Button asChild={canExport} disabled={!canExport} variant="outline" size="sm" className="min-w-0" aria-describedby="bulk-export-description">
              {canExport ? <a href={`/api/submissions/export?${withFormat(exportParams, "csv")}`}><Download className="size-3.5" /> Bulk CSV</a> : <span><Download className="size-3.5" /> Bulk CSV</span>}
            </Button>
          </div>
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

function dashboardFiltersEqual(
  left: DashboardFilters,
  right: DashboardFilters,
) {
  return (
    left.templateId === right.templateId &&
    left.roleId === right.roleId &&
    left.search === right.search &&
    left.fromDate === right.fromDate &&
    left.toDate === right.toDate
  );
}

function countAdvancedFilters(filters: DashboardFilters) {
  return [
    filters.templateId,
    filters.roleId,
    filters.fromDate,
    filters.toDate,
  ].filter(Boolean).length;
}

function bulkExportDescription(options: {
  filtersChanged: boolean;
  templateName?: string;
  total: number;
}) {
  const { filtersChanged, templateName, total } = options;
  if (filtersChanged) return "Apply the changed filters before exporting.";
  if (!templateName) {
    return "Select one template and apply filters. Different templates are never mixed in one export.";
  }
  if (total === 0) return `No matching submissions from “${templateName}” to export.`;
  return `${total} matching submission${total === 1 ? "" : "s"} from “${templateName}” will be exported.`;
}
