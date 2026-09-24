"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/patterns/app-shell";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildAccountCredentialMessage,
  buildTelegramShareUrl,
  generateTemporaryPassword,
} from "@/features/accounts/account-share";
import { AccountResumeReplacement } from "@/features/accounts/account-resume-replacement";
import { BatchAssignmentDialog } from "@/features/accounts/batch-assignment-dialog";
import { assignmentDisplay } from "@/features/accounts/assignment-status";
import { pageMetaFromPayload } from "@/features/pagination/pagination";
import type { PageMeta } from "@/features/pagination/pagination";
import type {
  AssignmentDraft,
  AssignmentTemplateSummary,
  RecipientAccountSummary,
  RecipientAccountType,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type CreatedCredentials = {
  name: string;
  email: string;
  accountType: RecipientAccountType;
  temporaryPassword: string;
};

const EMPTY_PAGE_META: PageMeta = {
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false,
};

export function AccountsDashboard(props: { displayName: string }) {
  const [accounts, setAccounts] = useState<RecipientAccountSummary[]>([]);
  const [templates, setTemplates] = useState<AssignmentTemplateSummary[]>([]);
  const [pageMeta, setPageMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] =
    useState<RecipientAccountType>("candidate");
  const [password, setPassword] = useState("");
  const [credentials, setCredentials] =
    useState<CreatedCredentials | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const selectedAccounts = accounts.filter((account) => selectedIds.includes(account.id));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const accountQuery = new URLSearchParams({
        page: String(pageMeta.page),
        pageSize: String(pageMeta.pageSize),
      });
      if (search) accountQuery.set("search", search);
      const [accountsResponse, templatesResponse] = await Promise.all([
        fetch(`/api/accounts?${accountQuery}`, { cache: "no-store" }),
        fetch("/api/templates?status=active&pageSize=100&sort=name&order=asc", { cache: "no-store" }),
      ]);
      const accountsPayload = (await accountsResponse.json()) as {
        items?: RecipientAccountSummary[];
        stats?: { accounts: number; assignments: number };
        page?: number;
        pageSize?: number;
        totalItems?: number;
        totalPages?: number;
        hasPreviousPage?: boolean;
        hasNextPage?: boolean;
        error?: string;
      };
      const templatesPayload = (await templatesResponse.json()) as {
        items?: AssignmentTemplateSummary[];
        error?: string;
      };
      if (!accountsResponse.ok || !templatesResponse.ok) {
        throw new Error(
          accountsPayload.error ||
            templatesPayload.error ||
            "Accounts could not be loaded.",
        );
      }
      setAccounts(accountsPayload.items ?? []);
      setAssignmentCount(accountsPayload.stats?.assignments ?? 0);
      setPageMeta((current) => pageMetaFromPayload(accountsPayload, current));
      setTemplates(templatesPayload.items ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Accounts could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [pageMeta.page, pageMeta.pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPassword(generateTemporaryPassword());
      setTimeZone(resolvedLocalTimeZone());
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateNotice("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ name, email, password, accountType }),
      });
      const payload = (await response.json()) as {
        account?: RecipientAccountSummary & { temporaryPassword: string };
        error?: string;
      };
      if (!response.ok || !payload.account) {
        throw new Error(payload.error || "The account could not be created.");
      }
      const created = payload.account;
      await loadData();
      setCredentials({
        name: created.name,
        email: created.email,
        accountType: created.accountType,
        temporaryPassword: created.temporaryPassword,
      });
      setName("");
      setEmail("");
      setPassword(generateTemporaryPassword());
      setCreateNotice("Account created. Copy or send the temporary credentials now.");
    } catch (cause) {
      setCreateError(
        cause instanceof Error
          ? cause.message
          : "The account could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function replaceAssignmentResume(
    userId: string,
    assignmentId: string,
    expectedUpdatedAt: string,
    draft: AssignmentDraft,
  ): Promise<boolean> {
    setAssigningUserId(userId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/accounts/${userId}/assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: draft.templateId,
          roleId: draft.roleId,
          candidateProfileVersionId: draft.candidateProfileVersionId,
          prefillMode: draft.prefillMode,
          profileMismatchConfirmed: draft.profileMismatchConfirmed,
          assignmentId,
          expectedUpdatedAt,
        }),
      });
      const payload = (await response.json()) as {
        assignment?: RecipientAssignmentSummary;
        error?: string;
      };
      if (!response.ok || !payload.assignment) {
        throw new Error(
          payload.error || "Resume data could not be replaced.",
        );
      }
      setAccounts((current) =>
        current.map((account) =>
          account.id === userId
            ? {
                ...account,
                assignments: account.assignments.map((assignment) =>
                  assignment.id === assignmentId
                    ? payload.assignment!
                    : assignment,
                ),
              }
            : account,
        ),
      );
      setNotice("The assignment now uses the new frozen resume snapshot.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Resume data could not be replaced.",
      );
      return false;
    } finally {
      setAssigningUserId(null);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        buildCredentialMessage(credentials, window.location.origin),
      );
      setCreateError("");
      setCreateNotice("Credentials copied to the clipboard.");
    } catch {
      setCreateNotice("");
      setCreateError("Clipboard access was blocked. Copy the email and password manually.");
    }
  }

  function openTelegram() {
    if (!credentials) return;
    const loginUrl = `${window.location.origin}/sign-in?return_to=%2Fportal`;
    const message = buildCredentialMessage(credentials, window.location.origin);
    window.open(
      buildTelegramShareUrl({ loginUrl, message }),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <AppShell displayName={props.displayName}>
      <PageHeader
        title="Accounts"
        description="Create candidate and employee access, then assign published forms from one workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadData()}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Button type="button" onClick={() => {
              setCreateError("");
              setCreateNotice("");
              setCreateOpen(true);
            }}>
              <Plus /> Create account
            </Button>
          </div>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          icon={<UsersRound />}
          value={pageMeta.totalItems}
          label="Recipient accounts"
          tone="primary"
        />
        <MetricCard
          icon={<ShieldCheck />}
          value={assignmentCount}
          label="Form assignments"
          tone="success"
        />
      </section>

      {error && <FeedbackAlert tone="error" title="Something went wrong" description={error} />}
      {notice && <FeedbackAlert tone="success" title="Updated successfully" description={notice} />}

      <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Recipient accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open an account to manage its form assignments.
            </p>
          </div>
          <form
            className="flex w-full flex-wrap gap-2 sm:w-auto"
            onSubmit={(event) => {
              event.preventDefault();
              setExpandedAccountId(null);
              setSelectedIds([]);
              setPageMeta((current) => ({ ...current, page: 1 }));
              setSearch(searchDraft.trim());
            }}
          >
            <InputGroup className="min-w-0 sm:w-64">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search name or email"
                aria-label="Search accounts"
              />
            </InputGroup>
            <Button type="submit" variant="outline">Search</Button>
            <Button
              type="button"
              disabled={selectedAccounts.length === 0 || loading}
              onClick={() => setBatchOpen(true)}
            >
              <Plus /> Assign{selectedAccounts.length > 0 ? ` (${selectedAccounts.length})` : ""}
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="space-y-2 border-t p-5" aria-label="Loading accounts">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full rounded-md" />)}
          </div>
        ) : accounts.length === 0 ? (
          <Empty className="min-h-64 border-t">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UsersRound /></EmptyMedia>
              <EmptyTitle>{search ? "No matching accounts" : "No accounts yet"}</EmptyTitle>
              <EmptyDescription>
                {search ? "Try another name or email." : "Create the first candidate or employee account."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all accounts on this page"
                      checked={selectedAccounts.length === accounts.length
                        ? true
                        : selectedAccounts.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(checked) =>
                        setSelectedIds(checked === true ? accounts.map((account) => account.id) : [])}
                    />
                  </TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Forms</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const expanded = expandedAccountId === account.id;
                  return (
                    <Fragment key={account.id}>
                      <TableRow>
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${account.name}`}
                            checked={selectedIds.includes(account.id)}
                            onCheckedChange={(checked) => setSelectedIds((current) =>
                              checked === true
                                ? [...new Set([...current, account.id])]
                                : current.filter((id) => id !== account.id))}
                          />
                        </TableCell>
                        <TableCell className="min-w-48 whitespace-normal">
                          <span className="block font-medium">{account.name}</span>
                          <span className="block break-all text-xs text-muted-foreground">{account.email}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={account.accountType} tone="info" />
                        </TableCell>
                        <TableCell>
                          {account.mustChangePassword
                            ? <StatusBadge label="Change pending" tone="warning" />
                            : <span className="text-muted-foreground">Updated</span>}
                        </TableCell>
                        <TableCell>{account.assignments.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatLocalDateTime(account.createdAt, { timeZone })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={expanded}
                            aria-controls={"account-details-" + account.id}
                            onClick={() => setExpandedAccountId(expanded ? null : account.id)}
                          >
                            {expanded ? <ChevronUp /> : <ChevronDown />}
                            {expanded ? "Hide details" : "View details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="p-0 whitespace-normal">
                            <div id={"account-details-" + account.id}>
                              <AccountDetails
                                account={account}
                                busy={assigningUserId === account.id}
                                timeZone={timeZone}
                                onReplace={(assignmentId, expectedUpdatedAt, draft) =>
                                  replaceAssignmentResume(account.id, assignmentId, expectedUpdatedAt, draft)}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && pageMeta.totalItems > 0 && (
          <div className="border-t p-4">
            <ServerPagination
              meta={pageMeta}
              disabled={loading || assigningUserId !== null}
              onPageChange={(page) => {
                setExpandedAccountId(null);
                setSelectedIds([]);
                setPageMeta((current) => ({ ...current, page }));
              }}
              onPageSizeChange={(pageSize) => {
                setExpandedAccountId(null);
                setSelectedIds([]);
                setPageMeta((current) => ({ ...current, page: 1, pageSize }));
              }}
            />
          </div>
        )}
      </Card>

      <BatchAssignmentDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        accounts={selectedAccounts}
        templates={templates}
        onRemove={(accountId) => setSelectedIds((current) =>
          current.filter((id) => id !== accountId))}
        onAssigned={(accountId, assignment) => {
          setAccounts((current) => current.map((account) => account.id === accountId
            ? { ...account, assignments: [assignment, ...account.assignments] }
            : account));
          setAssignmentCount((count) => count + 1);
          setSelectedIds((current) => current.filter((id) => id !== accountId));
          setNotice("Selected form assignments were saved.");
        }}
      />

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && (creating || credentials)) return;
          setCreateOpen(open);
          if (!open) {
            setCreateError("");
            setCreateNotice("");
          }
        }}
      >
        <DialogContent
          showCloseButton={!creating && !credentials}
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{credentials ? "Account created" : "Create account"}</DialogTitle>
            <DialogDescription>
              {credentials
                ? "Save or share the temporary credentials before closing."
                : "Create candidate or employee access with a temporary password."}
            </DialogDescription>
          </DialogHeader>

          {createError && <FeedbackAlert tone="error" title="Something went wrong" description={createError} />}
          {createNotice && <FeedbackAlert tone="success" title="Updated successfully" description={createNotice} />}

          {credentials ? (
            <div className="rounded-lg border border-warning/25 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-xs leading-5">
                  This temporary password will not be shown again after you close this dialog.
                </p>
              </div>
              <dl className="mt-3 space-y-2 rounded-md border bg-background p-3 text-xs">
                <CredentialRow label="Email" value={credentials.email} />
                <CredentialRow label="Password" value={credentials.temporaryPassword} mono />
              </dl>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyCredentials()}>
                  <ClipboardCopy className="size-3.5" /> Copy
                </Button>
                <Button type="button" size="sm" onClick={openTelegram}>
                  <Send className="size-3.5" /> Telegram
                </Button>
              </div>
            </div>
          ) : (
            <form id="create-account-form" className="space-y-4" onSubmit={createAccount}>
              <FormField label="Full name">
                <Input value={name} onChange={(event) => setName(event.target.value)}
                  maxLength={120} required autoComplete="off" />
              </FormField>
              <FormField label="Email">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                  maxLength={254} required autoComplete="off" />
              </FormField>
              <FormField label="Account type">
                <Select value={accountType} onValueChange={(value) =>
                  setAccountType(value as RecipientAccountType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Temporary password">
                <div className="flex gap-2">
                  <Input value={password} onChange={(event) => setPassword(event.target.value)}
                    minLength={12} maxLength={128} required autoComplete="new-password" />
                  <Button type="button" variant="outline" size="icon"
                    aria-label="Generate another password"
                    onClick={() => setPassword(generateTemporaryPassword())}>
                    <RefreshCw />
                  </Button>
                </div>
                <span className="mt-1.5 block text-[11px] font-normal leading-4 text-muted-foreground">
                  At least 12 characters with uppercase, lowercase, number, and symbol.
                </span>
              </FormField>
            </form>
          )}
          <DialogFooter>
            {credentials ? (
              <Button type="button" onClick={() => {
                setCredentials(null);
                setCreateNotice("");
                setCreateError("");
                setCreateOpen(false);
              }}>
                I saved the credentials
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={creating}
                  onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" form="create-account-form" disabled={creating}>
                  {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {creating ? "Creating…" : "Create account"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AccountDetails(props: {
  account: RecipientAccountSummary;
  busy: boolean;
  timeZone: string;
  onReplace: (
    assignmentId: string,
    expectedUpdatedAt: string,
    draft: AssignmentDraft,
  ) => Promise<boolean>;
}) {
  const [replacement, setReplacement] =
    useState<RecipientAssignmentSummary | null>(null);
  return (
    <div className="min-w-0">
      {replacement && (
        <AccountResumeReplacement
          accountId={props.account.id}
          accountName={props.account.name}
          assignment={replacement}
          busy={props.busy}
          onReplace={props.onReplace}
          onCancel={() => setReplacement(null)}
        />
      )}
      <div className="space-y-2 p-4">
        <h3 className="text-xs font-semibold">Assigned forms</h3>
        {props.account.assignments.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No forms assigned.</p>
        ) : props.account.assignments.map((assignment) => (
          <AccountAssignmentRow
            key={assignment.id}
            assignment={assignment}
            timeZone={props.timeZone}
            onReplace={() => setReplacement(assignment)}
          />
        ))}
      </div>
    </div>
  );
}

function AccountAssignmentRow(props: {
  assignment: RecipientAssignmentSummary;
  timeZone: string;
  onReplace: () => void;
}) {
  const display = assignmentDisplay(props.assignment.status);
  const statusTone =
    display.state === "completed"
      ? "success"
      : display.state === "cancelled"
        ? "warning"
        : display.state === "active"
          ? "info"
          : "neutral";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: props.assignment.roleColor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{props.assignment.templateName}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          v{props.assignment.versionNumber} · {props.assignment.roleName} · {formatLocalDateTime(props.assignment.assignedAt, { timeZone: props.timeZone })}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded border bg-muted px-1.5 py-0.5">
            {props.assignment.prefillMode === "suggested"
              ? "Recipient chooses"
              : props.assignment.prefillMode === "automatic"
                ? "Automatic"
                : "No resume data"}
          </span>
          {props.assignment.candidateProfileVersionId && (
            <span>
              {props.assignment.candidateFileName
                || props.assignment.candidateName
                || "Candidate profile"}
              {props.assignment.candidateProfileVersionNumber
                ? ` · profile v${props.assignment.candidateProfileVersionNumber}`
                : ""}
            </span>
          )}
          <span>
            {props.assignment.approvedFieldCount} mapped or available value{props.assignment.approvedFieldCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {display.state === "active" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={props.onReplace}
          className="h-7 text-[11px]"
        >
          <RefreshCw className="size-3.5" />
          Replace data
        </Button>
      )}
      <StatusBadge
        label={display.label}
        tone={statusTone}
        icon={display.state === "completed" ? <Check /> : undefined}
        className="text-[10px]"
        title={display.detail}
      />
    </div>
  );
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-semibold">{props.label}{props.children}</label>;
}

function CredentialRow(props: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-[10px] font-semibold uppercase text-muted-foreground">{props.label}</dt><dd className={`mt-0.5 break-all ${props.mono ? "font-mono" : ""}`}>{props.value}</dd></div>;
}

function buildCredentialMessage(
  credentials: CreatedCredentials,
  origin: string,
): string {
  return buildAccountCredentialMessage({
    ...credentials,
    loginUrl: `${origin}/sign-in?return_to=%2Fportal`,
  });
}
