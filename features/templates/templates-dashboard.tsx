"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Download,
  EllipsisVertical,
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
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type DashboardView = "templates" | "submissions" | "archived";

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
  const [activeView, setActiveView] = useState<DashboardView>("templates");
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
  const archivedTemplates = useMemo(
    () => templates.filter((template) => template.archivedAt),
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
          `“${template.name}” was archived. Pending assignments were cancelled and submission history was preserved.`,
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

  async function restoreTemplate(template: TemplateSummary) {
    setRemovingTemplateId(template.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        template?: {
          id: string;
          disposition: "restore";
          archivedAt: null;
        };
      };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "The template could not be restored.");
      }

      setTemplates((current) =>
        current.map((item) =>
          item.id === template.id ? { ...item, archivedAt: null } : item,
        ),
      );
      setNotice(
        `“${template.name}” was restored. Old links and cancelled assignments remain inactive.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The template could not be restored.",
      );
    } finally {
      setRemovingTemplateId(null);
    }
  }

  function viewTemplateSubmissions(template: TemplateSummary) {
    const filters = { ...EMPTY_FILTERS, templateId: template.id };
    setFilterDraft(filters);
    setAppliedFilters(filters);
    setActiveView("submissions");
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
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/" aria-label="Back to editor"><ArrowLeft /></Link></Button>
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><FileText className="size-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">PDF Studio</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Template workspace</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:block">{props.displayName}</span>
            <Button asChild variant="ghost" size="sm"><Link href="/resumes"><FileText className="size-4" /><span className="hidden sm:inline">Resumes</span></Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href="/accounts"><UsersRound className="size-4" /><span className="hidden sm:inline">Accounts</span></Link></Button>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3">HR forms</Badge>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Templates</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Create reusable PDF forms, manage recipient access, and review submissions from one workspace.</p>
          </div>
          <Button asChild size="lg"><Link href="/"><FileText className="size-4" /> New template</Link></Button>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active templates" value={activeTemplates.length} icon={<FolderOpen />} />
          <StatCard label="Archived templates" value={archivedTemplates.length} icon={<Archive />} />
          <StatCard label="Recipient roles" value={totalRecipients} icon={<Link2 />} />
          <StatCard label="Submissions" value={submissionTotal} icon={<Inbox />} />
        </section>

        {error && <Alert variant="destructive" className="mt-6"><TriangleAlert /><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <Alert role="status" className="mt-6 border-emerald-200 bg-emerald-50 text-emerald-800"><Check /><AlertTitle>Updated successfully</AlertTitle><AlertDescription className="text-emerald-700">{notice}</AlertDescription></Alert>}

        <Tabs value={activeView} onValueChange={(value) => { if (isDashboardView(value)) setActiveView(value); }} className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid h-auto w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="templates"><FolderOpen /> Templates <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{activeTemplates.length}</Badge></TabsTrigger>
              <TabsTrigger value="submissions"><Inbox /> Submissions <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{submissionTotal}</Badge></TabsTrigger>
              <TabsTrigger value="archived"><Archive /> Archived <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{archivedTemplates.length}</Badge></TabsTrigger>
            </TabsList>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
          </div>

          <TabsContent value="templates" className="mt-2">
            {loading ? <DashboardSkeleton /> : <TemplateGrid templates={activeTemplates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} copiedLinkKey={copiedLinkKey} removingTemplateId={removingTemplateId} localTimeZone={localTimeZone} onRegenerate={regenerateLink} onRevoke={revokeLink} onCopy={copyGeneratedLink} onRequestRemove={setTemplatePendingRemoval} />}
          </TabsContent>
          <TabsContent value="submissions" className="mt-2">
            {loading ? <DashboardSkeleton /> : <div>
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
            </div>}
          </TabsContent>
          <TabsContent value="archived" className="mt-2">
            {loading ? <DashboardSkeleton /> : <ArchivedTemplateGrid
            templates={archivedTemplates}
            busyTemplateId={removingTemplateId}
            localTimeZone={localTimeZone}
            onRestore={(template) => void restoreTemplate(template)}
            onViewSubmissions={viewTemplateSubmissions}
            />}
          </TabsContent>
        </Tabs>
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
  return <Card className="gap-0 py-0"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{props.icon}</span><div><p className="text-2xl font-bold tabular-nums">{props.value}</p><p className="text-xs font-medium text-muted-foreground">{props.label}</p></div></CardContent></Card>;
}

function DashboardSkeleton() {
  return <div className="mt-5 grid gap-4 lg:grid-cols-2">{[0, 1].map((item) => <Card key={item}><CardHeader><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-3/5" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>;
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
  return <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">{props.templates.map((template) => (
    <TemplateCard
      key={template.id}
      template={template}
      generatedLinks={props.generatedLinks}
      linkActionKey={props.linkActionKey}
      copiedLinkKey={props.copiedLinkKey}
      removingTemplateId={props.removingTemplateId}
      localTimeZone={props.localTimeZone}
      onRegenerate={props.onRegenerate}
      onRevoke={props.onRevoke}
      onCopy={props.onCopy}
      onRequestRemove={props.onRequestRemove}
    />
  ))}</div>;
}

function TemplateCard(props: {
  template: TemplateSummary;
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
  const willArchive =
    props.template.assignmentCount > 0 || props.template.submissionCount > 0;
  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <CardHeader className="p-5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{props.template.name}</CardTitle>
            <CardDescription className="mt-1 truncate text-xs">{props.template.fileName}</CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm"><Link href={`/?templateId=${encodeURIComponent(props.template.id)}`}><Pencil /> Edit</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={props.removingTemplateId !== null} aria-label={`More actions for ${props.template.name}`}>
                {props.removingTemplateId === props.template.id ? <LoaderCircle className="animate-spin" /> : <EllipsisVertical />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild><a href={`/api/templates/${props.template.id}/pdf`}><Download /> Download PDF</a></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={willArchive ? "default" : "destructive"}
                className={willArchive ? "text-amber-700 focus:text-amber-800" : undefined}
                onSelect={() => props.onRequestRemove(props.template)}
              >
                {willArchive ? <Archive /> : <Trash2 />}
                {willArchive ? "Archive template" : "Delete template"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {props.template.description && <p className="mb-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{props.template.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Version {props.template.versionNumber}</Badge>
          <Badge variant="outline">{props.template.currentRoles.length} role{props.template.currentRoles.length === 1 ? "" : "s"}</Badge>
          <Badge variant="outline">{props.template.assignmentCount} assigned</Badge>
          <Badge variant="outline">{props.template.submissionCount} submitted</Badge>
        </div>
        <Separator className="my-4" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Public fill links</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Create a link for each recipient role.</p>
          </div>
          <Badge variant="outline">{props.template.recipients.length}</Badge>
        </div>
        <div className="space-y-2">
          {props.template.recipients.map((recipient) => {
            const key = `${props.template.id}:${recipient.roleId}`;
            return (
              <RecipientLinkRow
                key={recipient.id}
                templateId={props.template.id}
                recipient={recipient}
                url={props.generatedLinks[key]}
                busy={props.linkActionKey === key}
                copied={props.copiedLinkKey === key}
                localTimeZone={props.localTimeZone}
                onRegenerate={props.onRegenerate}
                onRevoke={props.onRevoke}
                onCopy={(url) => props.onCopy(key, url)}
              />
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">Updated {formatLocalDateTime(props.template.updatedAt, { timeZone: props.localTimeZone })}</CardFooter>
    </Card>
  );
}

function RecipientLinkRow(props: {
  templateId: string;
  recipient: TemplateSummary["recipients"][number];
  url: string | undefined;
  busy: boolean;
  copied: boolean;
  localTimeZone: string;
  onRegenerate: (templateId: string, roleId: string) => Promise<void>;
  onRevoke: (templateId: string, roleId: string) => Promise<void>;
  onCopy: (url: string) => Promise<void>;
}) {
  const { recipient } = props;
  const url = props.url;
  return (
    <div className={`rounded-lg border p-3 transition-colors ${props.copied ? "border-emerald-300 bg-emerald-50" : "bg-muted/25"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: recipient.roleColor }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{recipient.roleName}</span>
        <Badge variant="outline" className={linkStatusClassName(recipient.status)}>{recipient.status}</Badge>
        <Button type="button" variant="ghost" size="xs" disabled={props.busy} onClick={() => void props.onRegenerate(props.templateId, recipient.roleId)}>{props.busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {url ? "Regenerate" : "Create link"}</Button>
        {recipient.status === "active" && <Button type="button" variant="ghost" size="xs" disabled={props.busy} className="text-destructive hover:text-destructive" onClick={() => void props.onRevoke(props.templateId, recipient.roleId)}><Ban /> Revoke</Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{recipient.submissionCount}/{recipient.maxSubmissions} submissions · {recipient.expiresAt ? `expires ${formatLocalDateTime(recipient.expiresAt, { timeZone: props.localTimeZone })}` : "no expiry"}</p>
      {url && (
        <InputGroup className={`mt-3 ${props.copied ? "border-emerald-300 bg-white" : "bg-background"}`}>
          <InputGroupInput readOnly value={url} aria-label={`${recipient.roleName} fill link`} className={props.copied ? "text-emerald-700" : "text-muted-foreground"} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label={props.copied ? `Copied ${recipient.roleName} link` : `Copy ${recipient.roleName} link`} title={props.copied ? "Copied!" : "Copy link"} onClick={() => void props.onCopy(url)}>{props.copied ? <Check /> : <Copy />}<span aria-live="polite" className="sr-only">{props.copied ? "Link copied" : ""}</span></InputGroupButton>
            <InputGroupButton asChild size="icon-xs"><a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${recipient.roleName} link`}><ExternalLink /></a></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  );
}

function ArchivedTemplateGrid(props: {
  templates: TemplateSummary[];
  busyTemplateId: string | null;
  localTimeZone: string;
  onRestore: (template: TemplateSummary) => void;
  onViewSubmissions: (template: TemplateSummary) => void;
}) {
  if (props.templates.length === 0) {
    return <EmptyState title="No archived templates" description="Templates you archive will appear here with their assignment and submission history." />;
  }
  return (
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
      {props.templates.map((template) => (
        <Card key={template.id} className="gap-0 border-amber-200 py-0">
          <CardHeader className="p-5 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Archive className="size-4" /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><CardTitle className="truncate text-base">{template.name}</CardTitle><Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Archived</Badge></div>
                <CardDescription className="mt-1 truncate text-xs">{template.fileName} · Version {template.versionNumber}</CardDescription>
              </div>
            </div>
            <CardAction><Button type="button" size="sm" disabled={props.busyTemplateId !== null} onClick={() => props.onRestore(template)}>{props.busyTemplateId === template.id ? <LoaderCircle className="animate-spin" /> : <ArchiveRestore />} Restore</Button></CardAction>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {template.description && <p className="mb-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{template.description}</p>}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{template.assignmentCount} assignment{template.assignmentCount === 1 ? "" : "s"}</Badge>
              <Badge variant="outline">{template.submissionCount} submission{template.submissionCount === 1 ? "" : "s"}</Badge>
            </div>
            <Alert role="note" className="mt-4 border-amber-200 bg-amber-50 text-amber-800"><ArchiveRestore /><AlertTitle>Safe to restore</AlertTitle><AlertDescription className="text-amber-700">Old links and cancelled assignments will remain inactive.</AlertDescription></Alert>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-t bg-muted/30 px-5 py-3">
            <span className="text-xs text-muted-foreground">Archived {formatLocalDateTime(template.archivedAt ?? template.updatedAt, { timeZone: props.localTimeZone })}</span>
            <div className="flex gap-2">{template.submissionCount > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => props.onViewSubmissions(template)}><Inbox /> Submissions</Button>}<Button asChild variant="ghost" size="sm"><a href={`/api/templates/${template.id}/pdf`}><Download /> PDF</a></Button></div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
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
            {willArchive ? <Archive /> : <TriangleAlert />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {willArchive ? "Archive this template?" : "Delete this template permanently?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            {willArchive && template
              ? `“${template.name}” has ${template.assignmentCount} assignment${template.assignmentCount === 1 ? "" : "s"} and ${template.submissionCount} submission${template.submissionCount === 1 ? "" : "s"}. Pending assignments will be cancelled, active links will be revoked, and completed submission history will remain available.`
              : `“${template?.name ?? "This template"}” has no assignments or submissions. Its template record and stored PDF versions will be permanently deleted. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.removing}>Keep template</AlertDialogCancel>
          <AlertDialogAction
            variant={willArchive ? "default" : "destructive"}
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
    <Card className="mt-5 min-w-0 gap-0 overflow-hidden py-0">
      <CardContent className="p-4">
      <form
        className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApply();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search submissions</span>
          <InputGroup className="h-10">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput value={props.draft.search} onChange={(event) => update({ search: event.target.value })} placeholder="Search recipient, email, or template…" />
          </InputGroup>
        </label>
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" className="h-10 min-w-20">Search</Button>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-10 min-w-24">
                <SlidersHorizontal className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="min-w-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
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
                <label className="text-xs font-semibold text-slate-600 [&_[data-slot=native-select-wrapper]]:w-full">
                  Template
                  <NativeSelect
                    value={props.draft.templateId}
                    onChange={(event) => update({ templateId: event.target.value, roleId: "" })}
                    className="mt-1.5 h-10 w-full"
                  >
                    <NativeSelectOption value="">All templates</NativeSelectOption>
                    {props.templates.map((template) => <NativeSelectOption key={template.id} value={template.id}>{template.name}{template.archivedAt ? " (Archived)" : ""}</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                <label className="text-xs font-semibold text-slate-600 [&_[data-slot=native-select-wrapper]]:w-full">
                  Recipient role
                  <NativeSelect
                    value={props.draft.roleId}
                    onChange={(event) => update({ roleId: event.target.value })}
                    className="mt-1.5 h-10 w-full"
                  >
                    <NativeSelectOption value="">All roles</NativeSelectOption>
                    {roles.map((role) => <NativeSelectOption key={role.roleId} value={role.roleId}>{role.roleName}</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                <fieldset>
                  <legend className="text-xs font-semibold text-slate-600">Submitted date</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-medium text-slate-500">
                      From
                      <Input type="date" value={props.draft.fromDate} onChange={(event) => update({ fromDate: event.target.value })} className="mt-1 h-10" />
                    </label>
                    <label className="text-[11px] font-medium text-slate-500">
                      To
                      <Input type="date" value={props.draft.toDate} onChange={(event) => update({ toDate: event.target.value })} className="mt-1 h-10" />
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
            <Badge key={label} variant="secondary" className="bg-blue-50 text-blue-700">{label}</Badge>
          ))}
          <Button type="button" variant="ghost" size="xs" className="h-7 text-xs text-slate-500" onClick={props.onClear}>Clear</Button>
        </div>
      )}
      <Separator className="my-4" />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
      </CardContent>
    </Card>
  );
}

function SubmissionList(props: {
  submissions: SubmissionSummary[];
  localTimeZone: string;
}) {
  if (props.submissions.length === 0) return <EmptyState title="No submissions yet" description="Completed recipient forms will appear here." />;
  return <div className="mt-5 space-y-3">{props.submissions.map((submission) => (
    <Card key={submission.id} className="gap-0 py-0">
      <CardHeader className="p-5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-4" /></span>
          <div className="min-w-0"><CardTitle className="truncate text-base">{submission.recipientName}</CardTitle><CardDescription className="mt-1 truncate">{submission.recipientEmail || "No email provided"}</CardDescription></div>
        </div>
        <CardAction className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/excel?timeZone=${encodeURIComponent(props.localTimeZone)}`}><FileSpreadsheet /> Excel</a></Button>{submission.hasCompletedPdf && <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${submission.id}/pdf`}><Download /> PDF</a></Button>}</CardAction>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">{submission.templateName} · v{submission.versionNumber}</Badge><Badge variant="outline"><span className="size-2 rounded-full" style={{ backgroundColor: submission.roleColor }} />{submission.roleName}</Badge><Badge variant="outline">{formatLocalDateTime(submission.submittedAt, { timeZone: props.localTimeZone })}</Badge></div>
        <details className="mt-4 rounded-lg border bg-muted/25 p-3"><summary className="cursor-pointer text-sm font-medium">View submitted values</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{submission.answers.map((answer) => <div key={answer.fieldId} className="rounded-md border bg-background p-3"><dt className="truncate text-xs font-medium text-muted-foreground">{answer.label}</dt><dd className="mt-1 break-words text-sm">{isPublicSubmissionImage(answer.value) ? <Image src={answer.value.url} alt={answer.label} width={Math.min(answer.value.width, 480)} height={Math.min(answer.value.height, 320)} unoptimized className="max-h-48 w-auto rounded-md object-contain" /> : formatValue(answer.value)}</dd><dd className="mt-1 font-mono text-[10px] text-muted-foreground">{answer.key}</dd></div>)}</dl></details>
      </CardContent>
    </Card>
  ))}</div>;
}

function EmptyState(props: { title: string; description: string }) {
  return <Card className="mt-5 min-h-72 items-center justify-center border-dashed text-center shadow-none"><CardContent className="flex flex-col items-center"><span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FolderOpen className="size-5" /></span><p className="mt-4 text-sm font-semibold">{props.title}</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">{props.description}</p></CardContent></Card>;
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

function isDashboardView(value: string): value is DashboardView {
  return value === "templates" || value === "submissions" || value === "archived";
}

function linkStatusClassName(status: string) {
  if (status === "active") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "revoked") return "border-amber-200 bg-amber-50 text-amber-700";
  return "bg-muted text-muted-foreground";
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
