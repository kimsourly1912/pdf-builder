"use client";

import {
  Check,
  ClipboardCopy,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/patterns/app-shell";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  buildAccountCredentialMessage,
  buildTelegramShareUrl,
  generateTemporaryPassword,
} from "@/features/accounts/account-share";
import { AccountAssignmentControls } from "@/features/accounts/account-assignment-controls";
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
        items?: TemplateSummary[];
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
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setNotice("Account created. Copy or send the temporary credentials now.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The account could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function assignForm(
    userId: string,
    draft: AssignmentDraft,
  ): Promise<boolean> {
    if (!draft.templateId || !draft.roleId) {
      setError("Choose a template and recipient role.");
      return false;
    }
    setAssigningUserId(userId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/accounts/${userId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as {
        assignment?: RecipientAssignmentSummary;
        error?: string;
      };
      if (!response.ok || !payload.assignment) {
        throw new Error(payload.error || "The form could not be assigned.");
      }
      setAccounts((current) =>
        current.map((account) =>
          account.id === userId
            ? {
                ...account,
                assignments: [payload.assignment!, ...account.assignments],
              }
            : account,
        ),
      );
      setNotice(
        draft.candidateProfileVersionId
          ? "Form assigned with a frozen resume-data snapshot."
          : "Form assigned without resume autofill.",
      );
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The form could not be assigned.",
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
      setError("");
      setNotice("Credentials copied to the clipboard.");
    } catch {
      setNotice("");
      setError("Clipboard access was blocked. Copy the email and password manually.");
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
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadData()}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
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

        <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="gap-0 py-0 shadow-none xl:sticky xl:top-20">
            <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserPlus className="size-4" />
              </span>
              <div>
                <h1 className="text-base font-semibold">Create account</h1>
                <p className="text-xs text-muted-foreground">Temporary password required</p>
              </div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={createAccount}>
              <FormField label="Full name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Account type">
                <Select
                  value={accountType}
                  onValueChange={(value) =>
                    setAccountType(value as RecipientAccountType)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Temporary password">
                <div className="flex gap-2">
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Generate another password"
                    onClick={() => setPassword(generateTemporaryPassword())}
                  >
                    <RefreshCw />
                  </Button>
                </div>
                <span className="mt-1.5 block text-[11px] font-normal leading-4 text-muted-foreground">
                  At least 12 characters with uppercase, lowercase, number, and symbol.
                </span>
              </FormField>
              <Button
                type="submit"
                disabled={creating || Boolean(credentials)}
                className="h-10 w-full"
              >
                {creating ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {creating
                  ? "Creating…"
                  : credentials
                    ? "Save current credentials first"
                    : "Create account"}
              </Button>
            </form>

            {credentials && (
              <div className="mt-5 rounded-lg border border-warning/25 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      Save these credentials now
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      The temporary password will not be shown again after you
                      dismiss this card.
                    </p>
                  </div>
                </div>
                <dl className="mt-3 space-y-2 rounded-md border bg-background p-3 text-xs">
                  <CredentialRow label="Email" value={credentials.email} />
                  <CredentialRow
                    label="Password"
                    value={credentials.temporaryPassword}
                    mono
                  />
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyCredentials()}>
                    <ClipboardCopy className="size-3.5" /> Copy
                  </Button>
                  <Button type="button" size="sm" onClick={openTelegram}>
                    <Send className="size-3.5" /> Telegram
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setCredentials(null)}>
                  I saved the credentials
                </Button>
              </div>
            )}
            </CardContent>
          </Card>

          <section className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Recipient accounts</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assign published template roles to each person.
                </p>
              </div>
              <form
                className="flex w-full max-w-md gap-2 sm:w-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPageMeta((current) => ({ ...current, page: 1 }));
                  setSearch(searchDraft.trim());
                }}
              >
                <InputGroup>
                  <InputGroupAddon><Search /></InputGroupAddon>
                  <InputGroupInput
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Search name or email"
                    aria-label="Search accounts"
                  />
                </InputGroup>
                <Button type="submit" variant="outline">Search</Button>
              </form>
            </div>
            {loading ? (
              <div className="mt-5 space-y-3">
                {[0, 1].map((item) => <Skeleton key={item} className="h-48 w-full rounded-xl" />)}
              </div>
            ) : accounts.length === 0 ? (
              <Card className="mt-5 shadow-none">
                <Empty className="min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><UsersRound /></EmptyMedia>
                    <EmptyTitle>No accounts yet</EmptyTitle>
                    <EmptyDescription>Create the first candidate or employee account.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </Card>
            ) : (
              <div className="mt-5 space-y-4">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    templates={templates}
                    busy={assigningUserId === account.id}
                    timeZone={timeZone}
                    onAssign={(draft) => assignForm(account.id, draft)}
                  />
                ))}
                <ServerPagination
                  meta={pageMeta}
                  disabled={loading || assigningUserId !== null}
                  onPageChange={(page) => setPageMeta((current) => ({ ...current, page }))}
                  onPageSizeChange={(pageSize) => setPageMeta((current) => ({ ...current, page: 1, pageSize }))}
                />
              </div>
            )}
          </section>
        </div>
    </AppShell>
  );
}

function AccountCard(props: {
  account: RecipientAccountSummary;
  templates: AssignmentTemplateSummary[];
  busy: boolean;
  timeZone: string;
  onAssign: (draft: AssignmentDraft) => Promise<boolean>;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{props.account.name}</h3>
            <StatusBadge label={props.account.accountType} tone="info" />
            {props.account.mustChangePassword && (
              <StatusBadge label="Password change pending" tone="warning" />
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{props.account.email}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Created {formatLocalDateTime(props.account.createdAt, { timeZone: props.timeZone })}
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {props.account.assignments.length} assigned
        </span>
      </div>

      <AccountAssignmentControls
        accountId={props.account.id}
        accountName={props.account.name}
        templates={props.templates}
        busy={props.busy}
        onAssign={props.onAssign}
      />

      <div className="p-4">
        {props.account.assignments.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No forms assigned.</p>
        ) : (
          <div className="space-y-2">
            {props.account.assignments.map((assignment) => (
              <AccountAssignmentRow
                key={assignment.id}
                assignment={assignment}
                timeZone={props.timeZone}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function AccountAssignmentRow(props: {
  assignment: RecipientAssignmentSummary;
  timeZone: string;
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
        <p className="mt-0.5 text-[11px] text-muted-foreground">v{props.assignment.versionNumber} · {props.assignment.roleName} · {formatLocalDateTime(props.assignment.assignedAt, { timeZone: props.timeZone })}</p>
      </div>
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
