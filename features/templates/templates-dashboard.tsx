"use client";

import {
  Archive,
  ArchiveRestore,
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
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ColumnDef } from "@tanstack/react-table";

import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { AppShell } from "@/components/patterns/app-shell";
import {
  DataView,
  DataViewContent,
  DataViewHeader,
} from "@/components/patterns/data-view";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import type { StatusTone } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  DataTableColumnHeader,
} from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
    <AppShell displayName={props.displayName}>
        <PageHeader
          title="Templates"
          description="Create reusable PDF forms, manage recipient access, and review submissions from one workspace."
          actions={
            <Button asChild>
              <Link href="/">
                <FileText className="size-4" /> New template
              </Link>
            </Button>
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Active templates" value={activeTemplates.length} icon={<FolderOpen />} tone="primary" />
          <MetricCard label="Archived templates" value={archivedTemplates.length} icon={<Archive />} tone="warning" />
          <MetricCard label="Recipient roles" value={totalRecipients} icon={<Link2 />} />
          <MetricCard label="Submissions" value={submissionTotal} icon={<Inbox />} tone="success" />
        </section>

        {error && (
          <FeedbackAlert
            tone="error"
            title="Something went wrong"
            description={error}
          />
        )}
        {notice && (
          <FeedbackAlert
            tone="success"
            title="Updated successfully"
            description={notice}
          />
        )}

        <Tabs value={activeView} onValueChange={(value) => { if (isDashboardView(value)) setActiveView(value); }}>
          <DataView>
            <DataViewHeader>
            <TabsList variant="line" className="grid h-auto w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="templates"><FolderOpen /> Templates <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{activeTemplates.length}</Badge></TabsTrigger>
              <TabsTrigger value="submissions"><Inbox /> Submissions <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{submissionTotal}</Badge></TabsTrigger>
              <TabsTrigger value="archived"><Archive /> Archived <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">{archivedTemplates.length}</Badge></TabsTrigger>
            </TabsList>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
            </DataViewHeader>
            <DataViewContent>

          <TabsContent value="templates">
            {loading ? <DashboardSkeleton /> : <TemplateTable templates={activeTemplates} generatedLinks={generatedLinks} linkActionKey={linkActionKey} copiedLinkKey={copiedLinkKey} removingTemplateId={removingTemplateId} localTimeZone={localTimeZone} onRegenerate={regenerateLink} onRevoke={revokeLink} onCopy={copyGeneratedLink} onRequestRemove={setTemplatePendingRemoval} />}
          </TabsContent>
          <TabsContent value="submissions">
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
            <SubmissionTable submissions={submissions} localTimeZone={localTimeZone} />
            </div>}
          </TabsContent>
          <TabsContent value="archived">
            {loading ? <DashboardSkeleton /> : <ArchivedTemplateTable
            templates={archivedTemplates}
            busyTemplateId={removingTemplateId}
            localTimeZone={localTimeZone}
            onRestore={(template) => void restoreTemplate(template)}
            onViewSubmissions={viewTemplateSubmissions}
            />}
          </TabsContent>
            </DataViewContent>
          </DataView>
        </Tabs>
      <TemplateRemovalDialog
        template={templatePendingRemoval}
        removing={removingTemplateId !== null}
        onOpenChange={(open) => {
          if (!open && !removingTemplateId) setTemplatePendingRemoval(null);
        }}
        onConfirm={(template) => void removeTemplate(template)}
      />
    </AppShell>
  );
}

function DashboardSkeleton() {
  return <div className="grid gap-4 p-4 lg:grid-cols-2">{[0, 1].map((item) => <Card key={item} className="shadow-none"><CardHeader><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-3/5" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>;
}

function TemplateTable(props: {
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
  const [linksTemplateId, setLinksTemplateId] = useState<string | null>(null);
  const linksTemplate = props.templates.find(
    (template) => template.id === linksTemplateId,
  );
  const columns: ColumnDef<DataTableFeatures, TemplateSummary>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Template" />
      ),
      meta: { className: "min-w-72 whitespace-normal" },
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{template.name}</p>
              <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
                {template.description || template.fileName}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "versionNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Version" />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary">v{row.original.versionNumber}</Badge>
      ),
    },
    {
      id: "roles",
      accessorFn: (template) =>
        template.currentRoles.map((role) => role.name).join(", "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Roles" />
      ),
      meta: { className: "min-w-40 whitespace-normal" },
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="flex flex-wrap gap-1.5">
            {template.currentRoles.slice(0, 2).map((role) => (
              <Badge key={role.id} variant="outline">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: role.color }}
                />
                {role.name}
              </Badge>
            ))}
            {template.currentRoles.length > 2 && (
              <Badge variant="outline">+{template.currentRoles.length - 2}</Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "activity",
      accessorFn: (template) => template.assignmentCount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Activity" />
      ),
      meta: { className: "min-w-32" },
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="space-y-1 text-xs">
            <p>{template.assignmentCount} assigned</p>
            <p className="text-muted-foreground">
              {template.submissionCount} submitted
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Updated" />
      ),
      meta: { className: "min-w-40 text-xs text-muted-foreground" },
      cell: ({ row }) =>
        formatLocalDateTime(row.original.updatedAt, {
          timeZone: props.localTimeZone,
        }),
    },
    {
      id: "links",
      accessorFn: (template) => template.recipients.length,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Fill links" />
      ),
      cell: ({ row }) => {
        const template = row.original;
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinksTemplateId(template.id)}
          >
            <Link2 /> Manage
            <Badge variant="secondary">{template.recipients.length}</Badge>
          </Button>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { headerClassName: "text-right", className: "text-right" },
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <TemplateRowActions
          template={row.original}
          removingTemplateId={props.removingTemplateId}
          onRequestRemove={props.onRequestRemove}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={props.templates}
        getRowId={(template) => template.id}
        caption="Active PDF templates"
        emptyTitle="No templates yet"
        emptyDescription="Open the editor, add fields, and choose Save template."
        emptyIcon={<FolderOpen />}
        filterColumn="name"
        filterPlaceholder="Filter templates..."
        enableRowSelection
        surface="embedded"
      />
      <TemplateLinksDialog
        template={linksTemplate ?? null}
        generatedLinks={props.generatedLinks}
        linkActionKey={props.linkActionKey}
        copiedLinkKey={props.copiedLinkKey}
        localTimeZone={props.localTimeZone}
        onOpenChange={(open) => {
          if (!open) setLinksTemplateId(null);
        }}
        onRegenerate={props.onRegenerate}
        onRevoke={props.onRevoke}
        onCopy={props.onCopy}
      />
    </>
  );
}

function TemplateRowActions(props: {
  template: TemplateSummary;
  removingTemplateId: string | null;
  onRequestRemove: (template: TemplateSummary) => void;
}) {
  const willArchive =
    props.template.assignmentCount > 0 || props.template.submissionCount > 0;
  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="outline" size="sm">
        <Link href={`/?templateId=${encodeURIComponent(props.template.id)}`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={props.removingTemplateId !== null}
            aria-label={`More actions for ${props.template.name}`}
          >
            {props.removingTemplateId === props.template.id ? (
              <Spinner />
            ) : (
              <EllipsisVertical />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <a href={`/api/templates/${props.template.id}/pdf`}>
              <Download /> Download PDF
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={willArchive ? "default" : "destructive"}
            className={
              willArchive ? "text-warning focus:text-warning" : undefined
            }
            onSelect={() => props.onRequestRemove(props.template)}
          >
            {willArchive ? <Archive /> : <Trash2 />}
            {willArchive ? "Archive template" : "Delete template"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TemplateLinksDialog(props: {
  template: TemplateSummary | null;
  generatedLinks: Record<string, string>;
  linkActionKey: string | null;
  copiedLinkKey: string | null;
  localTimeZone: string;
  onOpenChange: (open: boolean) => void;
  onRegenerate: (templateId: string, roleId: string) => Promise<void>;
  onRevoke: (templateId: string, roleId: string) => Promise<void>;
  onCopy: (key: string, url: string) => Promise<void>;
}) {
  const template = props.template;
  const columns: ColumnDef<
    DataTableFeatures,
    TemplateSummary["recipients"][number]
  >[] = [
    {
      accessorKey: "roleName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Recipient role" />
      ),
      meta: { className: "min-w-36" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-medium">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: row.original.roleColor }}
          />
          {row.original.roleName}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.status}
          tone={linkStatusTone(row.original.status)}
        />
      ),
    },
    {
      accessorKey: "submissionCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Usage" />
      ),
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.submissionCount}/{row.original.maxSubmissions} submissions
        </span>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Expiry" />
      ),
      meta: { className: "min-w-40 text-xs text-muted-foreground" },
      cell: ({ row }) =>
        row.original.expiresAt
          ? formatLocalDateTime(row.original.expiresAt, {
              timeZone: props.localTimeZone,
            })
          : "No expiry",
    },
    {
      id: "link",
      header: "Generated link",
      meta: { className: "min-w-80" },
      enableSorting: false,
      cell: ({ row }) => {
        const recipient = row.original;
        const key = `${template?.id ?? ""}:${recipient.roleId}`;
        const url = props.generatedLinks[key];
        if (!url) {
          return (
            <span className="text-xs text-muted-foreground">
              Generate a new link to copy or open it.
            </span>
          );
        }
        const copied = props.copiedLinkKey === key;
        return (
          <InputGroup
            className={
              copied ? "border-success/30 bg-success/10" : "bg-background"
            }
          >
            <InputGroupInput
              readOnly
              value={url}
              aria-label={`${recipient.roleName} fill link`}
              className={copied ? "text-success-foreground" : "text-muted-foreground"}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={
                  copied
                    ? `Copied ${recipient.roleName} link`
                    : `Copy ${recipient.roleName} link`
                }
                title={copied ? "Copied!" : "Copy link"}
                onClick={() => void props.onCopy(key, url)}
              >
                {copied ? <Check /> : <Copy />}
                <span aria-live="polite" className="sr-only">
                  {copied ? "Link copied" : ""}
                </span>
              </InputGroupButton>
              <InputGroupButton asChild size="icon-xs">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${recipient.roleName} link`}
                >
                  <ExternalLink />
                </a>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { headerClassName: "text-right", className: "text-right" },
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const recipient = row.original;
        const key = `${template?.id ?? ""}:${recipient.roleId}`;
        const busy = props.linkActionKey === key;
        const hasGeneratedUrl = Boolean(props.generatedLinks[key]);
        return (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !template}
              onClick={() => {
                if (template) {
                  void props.onRegenerate(template.id, recipient.roleId);
                }
              }}
            >
              {busy ? (
                <Spinner />
              ) : (
                <RefreshCw />
              )}
              {hasGeneratedUrl ? "Regenerate" : "Create link"}
            </Button>
            {recipient.status === "active" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy || !template}
                className="text-destructive hover:text-destructive"
                aria-label={`Revoke ${recipient.roleName} link`}
                onClick={() => {
                  if (template) void props.onRevoke(template.id, recipient.roleId);
                }}
              >
                <Ban />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Dialog open={Boolean(template)} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Public fill links</DialogTitle>
          <DialogDescription>
            Manage recipient-role links for {template?.name ?? "this template"}.
            Regenerating a link makes the previous link inactive.
          </DialogDescription>
        </DialogHeader>
        <DataTable
          columns={columns}
          data={template?.recipients ?? []}
          getRowId={(recipient) => recipient.id}
          caption={`Public fill links for ${template?.name ?? "template"}`}
          emptyTitle="No recipient roles"
          emptyDescription="Add a recipient role in the template editor before creating a fill link."
          emptyIcon={<Link2 />}
          filterColumn="roleName"
          filterPlaceholder="Filter recipient roles..."
          initialPageSize={5}
          className="shadow-none"
        />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function ArchivedTemplateTable(props: {
  templates: TemplateSummary[];
  busyTemplateId: string | null;
  localTimeZone: string;
  onRestore: (template: TemplateSummary) => void;
  onViewSubmissions: (template: TemplateSummary) => void;
}) {
  const columns: ColumnDef<DataTableFeatures, TemplateSummary>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Template" />
      ),
      meta: { className: "min-w-72 whitespace-normal" },
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Archive className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{template.name}</p>
                <StatusBadge label="Archived" tone="warning" />
              </div>
              <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
                {template.description || template.fileName}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "versionNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Version" />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary">v{row.original.versionNumber}</Badge>
      ),
    },
    {
      id: "history",
      accessorFn: (template) => template.assignmentCount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Saved history" />
      ),
      meta: { className: "min-w-36" },
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="space-y-1 text-xs">
            <p>{template.assignmentCount} assignments</p>
            <p className="text-muted-foreground">
              {template.submissionCount} submissions
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "archivedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Archived" />
      ),
      meta: { className: "min-w-40 text-xs text-muted-foreground" },
      cell: ({ row }) =>
        formatLocalDateTime(row.original.archivedAt ?? row.original.updatedAt, {
          timeZone: props.localTimeZone,
        }),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { headerClassName: "text-right", className: "text-right" },
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const template = row.original;
        return (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.busyTemplateId !== null}
            onClick={() => props.onRestore(template)}
          >
            {props.busyTemplateId === template.id ? (
              <Spinner />
            ) : (
              <ArchiveRestore />
            )}
            Restore
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${template.name}`}
              >
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {template.submissionCount > 0 && (
                <DropdownMenuItem
                  onSelect={() => props.onViewSubmissions(template)}
                >
                  <Inbox /> View submissions
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`/api/templates/${template.id}/pdf`}>
                  <Download /> Download PDF
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={props.templates}
      getRowId={(template) => template.id}
      caption="Archived PDF templates"
      emptyTitle="No archived templates"
      emptyDescription="Templates you archive will appear here with their assignment and submission history."
      emptyIcon={<Archive />}
      filterColumn="name"
      filterPlaceholder="Filter archived templates..."
      enableRowSelection
      surface="embedded"
    />
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
                ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive"
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
            {props.removing && <Spinner />}
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
    <div className="min-w-0 border-b bg-muted/15 p-4">
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
              <PopoverHeader className="border-b p-4">
                <PopoverTitle>Filter submissions</PopoverTitle>
                <PopoverDescription>
                  Narrow the results before reviewing or exporting them.
                </PopoverDescription>
              </PopoverHeader>
              <div className="grid gap-4 p-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Template</span>
                  <Select
                    value={props.draft.templateId || "all-templates"}
                    onValueChange={(value) =>
                      update({
                        templateId: value === "all-templates" ? "" : value,
                        roleId: "",
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="all-templates">All templates</SelectItem>
                      {props.templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.archivedAt ? " (Archived)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Recipient role</span>
                  <Select
                    value={props.draft.roleId || "all-roles"}
                    onValueChange={(value) =>
                      update({ roleId: value === "all-roles" ? "" : value })
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="all-roles">All roles</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role.roleId} value={role.roleId}>
                          {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <fieldset>
                  <legend className="text-xs font-semibold text-foreground">Submitted date</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">From</span>
                      <DatePicker
                        value={props.draft.fromDate}
                        max={props.draft.toDate || undefined}
                        onValueChange={(fromDate) => update({ fromDate })}
                        placeholder="From date"
                        aria-label="Submitted from date"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">To</span>
                      <DatePicker
                        value={props.draft.toDate}
                        min={props.draft.fromDate || undefined}
                        onValueChange={(toDate) => update({ toDate })}
                        placeholder="To date"
                        aria-label="Submitted to date"
                        className="h-10"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="flex items-center justify-between gap-2 border-t p-4">
                <Button type="button" variant="ghost" size="sm" onClick={() => { props.onClear(); setFiltersOpen(false); }}>Clear all</Button>
                <Button type="button" size="sm" onClick={() => { props.onApply(); setFiltersOpen(false); }}>Apply filters</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </form>
      {appliedFilterLabels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Applied filters">
          <span className="text-[11px] font-semibold text-muted-foreground">Applied:</span>
          {appliedFilterLabels.map((label) => (
            <Badge key={label} variant="secondary">{label}</Badge>
          ))}
          <Button type="button" variant="ghost" size="xs" className="h-7 text-xs text-muted-foreground" onClick={props.onClear}>Clear</Button>
        </div>
      )}
      <Separator className="my-4" />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-muted-foreground">{props.total} matching submission{props.total === 1 ? "" : "s"}</p>
        <div className="min-w-0 sm:max-w-xl sm:text-right">
          <p className="text-xs font-bold text-foreground">Bulk export</p>
          <p id="bulk-export-description" aria-live="polite" className="mt-1 text-xs leading-5 text-muted-foreground">{exportDescription}</p>
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
    </div>
  );
}

function SubmissionTable(props: {
  submissions: SubmissionSummary[];
  localTimeZone: string;
}) {
  const [detailSubmissionId, setDetailSubmissionId] = useState<string | null>(
    null,
  );
  const detailSubmission = props.submissions.find(
    (submission) => submission.id === detailSubmissionId,
  );
  const columns: ColumnDef<DataTableFeatures, SubmissionSummary>[] = [
    {
      accessorKey: "recipientName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Recipient" />
      ),
      meta: { className: "min-w-56 whitespace-normal" },
      cell: ({ row }) => {
        const submission = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Check className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{submission.recipientName}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {submission.recipientEmail || "No email provided"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "templateName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Template" />
      ),
      meta: { className: "min-w-48 whitespace-normal" },
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.templateName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Version {row.original.versionNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "roleName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Recipient role" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: row.original.roleColor }}
          />
          {row.original.roleName}
        </Badge>
      ),
    },
    {
      accessorKey: "submittedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Submitted" />
      ),
      meta: { className: "min-w-40 text-xs text-muted-foreground" },
      cell: ({ row }) =>
        formatLocalDateTime(row.original.submittedAt, {
          timeZone: props.localTimeZone,
        }),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { headerClassName: "text-right", className: "text-right" },
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const submission = row.original;
        return (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailSubmissionId(submission.id)}
          >
            <FileText /> Details
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Export submission from ${submission.recipientName}`}
              >
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/submissions/${submission.id}/excel?timeZone=${encodeURIComponent(props.localTimeZone)}`}
                >
                  <FileSpreadsheet /> Download Excel
                </a>
              </DropdownMenuItem>
              {submission.hasCompletedPdf && (
                <DropdownMenuItem asChild>
                  <a href={`/api/submissions/${submission.id}/pdf`}>
                    <Download /> Download PDF
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={props.submissions}
        getRowId={(submission) => submission.id}
        caption="Completed form submissions"
        emptyTitle="No submissions yet"
        emptyDescription="Completed recipient forms will appear here."
        emptyIcon={<Inbox />}
        filterColumn="recipientName"
        filterPlaceholder="Filter recipients..."
        enableRowSelection
        surface="embedded"
      />
      <SubmissionDetailsDialog
        submission={detailSubmission ?? null}
        onOpenChange={(open) => {
          if (!open) setDetailSubmissionId(null);
        }}
      />
    </>
  );
}

function SubmissionDetailsDialog(props: {
  submission: SubmissionSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const submission = props.submission;
  const columns: ColumnDef<DataTableFeatures, SubmissionAnswer>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Field" />
      ),
      meta: { className: "min-w-48 whitespace-normal" },
      cell: ({ row }) => (
        <span className="font-medium">{row.original.label}</span>
      ),
    },
    {
      id: "value",
      header: "Submitted value",
      meta: { className: "min-w-64 max-w-xl whitespace-normal" },
      enableSorting: false,
      cell: ({ row }) =>
        isPublicSubmissionImage(row.original.value) ? (
          <Image
            src={row.original.value.url}
            alt={row.original.label}
            width={Math.min(row.original.value.width, 480)}
            height={Math.min(row.original.value.height, 320)}
            unoptimized
            className="max-h-48 w-auto rounded-md object-contain"
          />
        ) : (
          <span className="break-words">{formatValue(row.original.value)}</span>
        ),
    },
    {
      accessorKey: "key",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Data key" />
      ),
      meta: { className: "font-mono text-xs text-muted-foreground" },
    },
  ];

  return (
    <Dialog open={Boolean(submission)} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{submission?.recipientName ?? "Submission"}</DialogTitle>
          <DialogDescription>
            {submission
              ? `${submission.templateName} · Version ${submission.versionNumber} · ${submission.roleName}`
              : "Submitted form values"}
          </DialogDescription>
        </DialogHeader>
        <DataTable
          columns={columns}
          data={submission?.answers ?? []}
          getRowId={(answer) => answer.fieldId}
          caption={`Submitted values from ${submission?.recipientName ?? "recipient"}`}
          emptyTitle="No submitted values"
          emptyDescription="This submission does not contain any displayable answers."
          emptyIcon={<FileText />}
          filterColumn="label"
          filterPlaceholder="Filter submitted fields..."
          initialPageSize={5}
          className="shadow-none"
        />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
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

function linkStatusTone(status: string): StatusTone {
  if (status === "active") return "info";
  if (status === "completed") return "success";
  if (status === "revoked") return "warning";
  return "neutral";
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
