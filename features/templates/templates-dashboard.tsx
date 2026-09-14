"use client";

import {
  ArrowLeft,
  Ban,
  Check,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Inbox,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/" aria-label="Back to editor"><ArrowLeft /></Link></Button>
            <div>
              <p className="text-sm font-bold text-foreground">PDF Studio</p>
              <p className="text-xs text-muted-foreground">Templates and submissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">{props.displayName}</span>
            <SignOutButton />
            <Button asChild size="sm"><Link href="/"><FileText className="size-4" /> New template</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Templates" value={templates.length} icon={<FolderOpen />} />
          <StatCard label="Recipient roles" value={totalRecipients} icon={<Link2 />} />
          <StatCard label="Submissions" value={submissions.length} icon={<Inbox />} />
        </section>

        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(value as "templates" | "submissions")}
          className="mt-8 gap-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="templates"><FolderOpen className="size-4" /> Templates</TabsTrigger>
              <TabsTrigger value="submissions"><Inbox className="size-4" /> Submissions</TabsTrigger>
            </TabsList>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>{loading ? <Spinner /> : <RefreshCw className="size-4" />} Refresh</Button>
          </div>

          {error && <Alert variant="destructive" className="mt-4"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-muted-foreground"><Spinner className="size-6" /></div>
          ) : (
            <>
              <TabsContent value="templates">
                <TemplateGrid templates={templates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} onRegenerate={regenerateLink} onRevoke={revokeLink} />
              </TabsContent>
              <TabsContent value="submissions">
                <SubmissionList submissions={submissions} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </main>
  );
}

function StatCard(props: { label: string; value: number; icon: React.ReactNode }) {
  return <Card className="gap-0 py-0"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{props.icon}</span><div><p className="text-2xl font-bold tabular-nums">{props.value}</p><p className="text-xs font-medium text-muted-foreground">{props.label}</p></div></CardContent></Card>;
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
    <article key={template.id}><Card className="h-full gap-0 py-0"><CardContent className="p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-bold text-foreground">{template.name}</h2><p className="mt-1 text-xs text-muted-foreground">{template.fileName} · {template.submissionCount} submission{template.submissionCount === 1 ? "" : "s"}</p></div><Button asChild variant="outline" size="sm"><a href={`/api/templates/${template.id}/pdf`}><Download className="size-3.5" /> PDF</a></Button></div>
      {template.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{template.description}</p>}
      <div className="mt-4 space-y-2 border-t border-border pt-4">
        {template.recipients.map((recipient) => {
          const key = `${template.id}:${recipient.roleId}`;
          const url = props.generatedLinks[key];
          const busy = props.linkActionKey === key;
          return <div key={recipient.id} className="rounded-xl bg-muted/50 p-3"><div className="flex flex-wrap items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: recipient.roleColor }} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{recipient.roleName}</span><span className="rounded-full bg-background px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{recipient.status}</span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void props.onRegenerate(template.id, recipient.roleId)}>{busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {url ? "Regenerate" : "Create link"}</Button>{recipient.status === "active" && <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-destructive hover:text-destructive" onClick={() => void props.onRevoke(template.id, recipient.roleId)}><Ban className="size-3.5" /> Revoke</Button>}</div><p className="mt-1 text-[11px] text-muted-foreground">{recipient.submissionCount}/{recipient.maxSubmissions} submissions · {recipient.expiresAt ? `expires ${formatDate(recipient.expiresAt)}` : "no expiry"}</p>{url && <div className="mt-2 flex gap-2"><Input readOnly value={url} className="h-8 min-w-0 flex-1 text-xs text-muted-foreground" /><Button type="button" variant="outline" size="icon-sm" aria-label={`Copy ${recipient.roleName} link`} onClick={() => void navigator.clipboard.writeText(url)}><Copy /></Button><Button asChild variant="outline" size="icon-sm"><a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${recipient.roleName} link`}><ExternalLink /></a></Button></div>}</div>;
        })}
      </div>
    </CardContent></Card></article>
  ))}</div>;
}

function SubmissionList(props: { submissions: SubmissionSummary[] }) {
  if (props.submissions.length === 0) return <EmptyState title="No submissions yet" description="Completed recipient forms will appear here." />;
  return <div className="mt-5 space-y-3">{props.submissions.map((submission) => (
    <article key={submission.id}><Card className="gap-0 py-0"><CardContent className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-bold text-foreground"><Check className="size-4 text-emerald-600" /> {submission.recipientName}</p><p className="mt-1 text-xs text-muted-foreground">{submission.templateName} v{submission.versionNumber} · {submission.roleName} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.submittedAt))}</p>{submission.recipientEmail && <p className="mt-1 text-xs text-muted-foreground">{submission.recipientEmail}</p>}</div>{submission.hasCompletedPdf && <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/pdf`}><Download className="size-3.5" /> Completed PDF</a></Button>}</div>
      <details className="mt-4 rounded-xl bg-muted/50 p-3"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">View submitted values</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{submission.answers.map((answer) => <div key={answer.fieldId} className="rounded-lg bg-background p-2"><dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{answer.label}</dt><dd className="mt-1 break-words text-sm text-foreground">{isPublicSubmissionImage(answer.value) ? <Image src={answer.value.url} alt={answer.label} width={Math.min(answer.value.width, 480)} height={Math.min(answer.value.height, 320)} unoptimized className="max-h-48 w-auto rounded-md object-contain" /> : formatValue(answer.value)}</dd><dd className="mt-1 font-mono text-[10px] text-muted-foreground">{answer.key}</dd></div>)}</dl></details>
    </CardContent></Card></article>
  ))}</div>;
}

function EmptyState(props: { title: string; description: string }) {
  return <Card className="mt-5 min-h-72 justify-center border-dashed shadow-none"><CardContent className="text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FolderOpen className="size-5" /></span><p className="mt-4 text-sm font-bold text-foreground">{props.title}</p><p className="mt-1 text-xs text-muted-foreground">{props.description}</p></CardContent></Card>;
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
