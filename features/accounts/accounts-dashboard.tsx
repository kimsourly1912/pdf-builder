"use client";

import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  FileText,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  buildAccountCredentialMessage,
  buildTelegramShareUrl,
  generateTemporaryPassword,
} from "@/features/accounts/account-share";
import { assignmentDisplay } from "@/features/accounts/assignment-status";
import type {
  RecipientAccountSummary,
  RecipientAccountType,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type TemplateSummary = {
  id: string;
  name: string;
  archivedAt: string | null;
  versionNumber: number;
  currentRoles: Array<{ id: string; name: string; color: string }>;
  filterRoles: Array<{ id: string; name: string; color: string }>;
};

type CreatedCredentials = {
  name: string;
  email: string;
  accountType: RecipientAccountType;
  temporaryPassword: string;
};

type AssignmentDraft = { templateId: string; roleId: string };

export function AccountsDashboard(props: { displayName: string }) {
  const [accounts, setAccounts] = useState<RecipientAccountSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
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
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<string, AssignmentDraft>
  >({});
  const [timeZone, setTimeZone] = useState("UTC");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsResponse, templatesResponse] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/templates", { cache: "no-store" }),
      ]);
      const accountsPayload = (await accountsResponse.json()) as {
        accounts?: RecipientAccountSummary[];
        error?: string;
      };
      const templatesPayload = (await templatesResponse.json()) as {
        templates?: TemplateSummary[];
        error?: string;
      };
      if (!accountsResponse.ok || !templatesResponse.ok) {
        throw new Error(
          accountsPayload.error ||
            templatesPayload.error ||
            "Accounts could not be loaded.",
        );
      }
      setAccounts(accountsPayload.accounts ?? []);
      setTemplates(
        (templatesPayload.templates ?? []).filter(
          (template) => !template.archivedAt,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Accounts could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPassword(generateTemporaryPassword());
      setTimeZone(resolvedLocalTimeZone());
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const assignmentCount = useMemo(
    () => accounts.reduce((total, account) => total + account.assignments.length, 0),
    [accounts],
  );

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
      setAccounts((current) => [created, ...current]);
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

  async function assignForm(userId: string) {
    const draft = assignmentDrafts[userId];
    if (!draft?.templateId || !draft.roleId) {
      setError("Choose a template and recipient role.");
      return;
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
      setAssignmentDrafts((current) => ({
        ...current,
        [userId]: { templateId: "", roleId: "" },
      }));
      setNotice("Form assigned. It is now available in the recipient portal.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The form could not be assigned.",
      );
    } finally {
      setAssigningUserId(null);
    }
  }

  function updateAssignmentDraft(
    userId: string,
    changes: Partial<AssignmentDraft>,
  ) {
    setAssignmentDrafts((current) => ({
      ...current,
      [userId]: {
        templateId: current[userId]?.templateId ?? "",
        roleId: current[userId]?.roleId ?? "",
        ...changes,
      },
    }));
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
    <main className="min-h-[100dvh] bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/templates" aria-label="Back to templates">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">PDF Studio</p>
              <p className="truncate text-xs text-slate-400">
                Candidate and employee accounts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-xs text-slate-500 sm:block">
              {props.displayName}
            </span>
            <SignOutButton />
            <Button asChild variant="outline" size="sm"><Link href="/resumes"><FileText className="size-4" /> Resumes</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <SummaryCard
            icon={<UsersRound />}
            value={accounts.length}
            label="Recipient accounts"
          />
          <SummaryCard
            icon={<ShieldCheck />}
            value={assignmentCount}
            label="Form assignments"
          />
        </section>

        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || notice}
          </p>
        )}

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-20">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <UserPlus className="size-5" />
              </span>
              <div>
                <h1 className="text-base font-bold">Create account</h1>
                <p className="text-xs text-slate-400">Temporary password required</p>
              </div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={createAccount}>
              <Field label="Full name">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                  autoComplete="off"
                  className={inputClassName}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                  autoComplete="off"
                  className={inputClassName}
                />
              </Field>
              <Field label="Account type">
                <select
                  value={accountType}
                  onChange={(event) =>
                    setAccountType(event.target.value as RecipientAccountType)
                  }
                  className={inputClassName}
                >
                  <option value="candidate">Candidate</option>
                  <option value="employee">Employee</option>
                </select>
              </Field>
              <Field label="Temporary password">
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                    className={inputClassName}
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
                <span className="mt-1.5 block text-[11px] font-normal leading-4 text-slate-400">
                  At least 12 characters with uppercase, lowercase, number, and symbol.
                </span>
              </Field>
              <Button
                type="submit"
                disabled={creating || Boolean(credentials)}
                className="h-10 w-full bg-blue-600 hover:bg-blue-700"
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
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-900">
                      Save these credentials now
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-amber-700">
                      The temporary password will not be shown again after you
                      dismiss this card.
                    </p>
                  </div>
                </div>
                <dl className="mt-3 space-y-2 rounded-lg bg-white/80 p-3 text-xs">
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
                  <Button type="button" size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={openTelegram}>
                    <Send className="size-3.5" /> Telegram
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setCredentials(null)}>
                  I saved the credentials
                </Button>
              </div>
            )}
          </section>

          <section className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Accounts</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Assign published template roles to each person.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadData()}>
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            {loading ? (
              <div className="flex min-h-72 items-center justify-center text-slate-400">
                <LoaderCircle className="size-6 animate-spin" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center">
                <UsersRound className="size-7 text-slate-400" />
                <p className="mt-4 text-sm font-bold text-slate-700">No accounts yet</p>
                <p className="mt-1 text-xs text-slate-400">Create the first candidate or employee account.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    templates={templates}
                    draft={assignmentDrafts[account.id] ?? { templateId: "", roleId: "" }}
                    busy={assigningUserId === account.id}
                    timeZone={timeZone}
                    onDraftChange={(changes) => updateAssignmentDraft(account.id, changes)}
                    onAssign={() => void assignForm(account.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function AccountCard(props: {
  account: RecipientAccountSummary;
  templates: TemplateSummary[];
  draft: AssignmentDraft;
  busy: boolean;
  timeZone: string;
  onDraftChange: (changes: Partial<AssignmentDraft>) => void;
  onAssign: () => void;
}) {
  const selectedTemplate = props.templates.find(
    (template) => template.id === props.draft.templateId,
  );
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold">{props.account.name}</h3>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">
              {props.account.accountType}
            </span>
            {props.account.mustChangePassword && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">
                Password change pending
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{props.account.email}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Created {formatLocalDateTime(props.account.createdAt, { timeZone: props.timeZone })}
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {props.account.assignments.length} assigned
        </span>
      </div>

      <div className="border-y border-slate-100 bg-slate-50/70 p-4">
        <p className="text-xs font-bold text-slate-600">Assign a form</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={props.draft.templateId}
            onChange={(event) =>
              props.onDraftChange({ templateId: event.target.value, roleId: "" })
            }
            className={inputClassName}
          >
            <option value="">Choose template</option>
            {props.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · v{template.versionNumber}
              </option>
            ))}
          </select>
          <select
            value={props.draft.roleId}
            disabled={!selectedTemplate}
            onChange={(event) => props.onDraftChange({ roleId: event.target.value })}
            className={inputClassName}
          >
            <option value="">Choose role</option>
            {(selectedTemplate?.currentRoles ?? selectedTemplate?.filterRoles)?.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <Button
            type="button"
            disabled={props.busy || !props.draft.templateId || !props.draft.roleId}
            onClick={props.onAssign}
            className="h-10 bg-blue-600 hover:bg-blue-700"
          >
            {props.busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Assign
          </Button>
        </div>
        {props.templates.length === 0 && (
          <p className="mt-2 text-[11px] text-amber-700">Create and save a template before assigning forms.</p>
        )}
      </div>

      <div className="p-4">
        {props.account.assignments.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">No forms assigned.</p>
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
    </article>
  );
}

function AccountAssignmentRow(props: {
  assignment: RecipientAssignmentSummary;
  timeZone: string;
}) {
  const display = assignmentDisplay(props.assignment.status);
  const statusClassName =
    display.state === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : display.state === "cancelled"
        ? "bg-amber-50 text-amber-700"
        : display.state === "active"
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-600";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: props.assignment.roleColor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-700">{props.assignment.templateName}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">v{props.assignment.versionNumber} · {props.assignment.roleName} · {formatLocalDateTime(props.assignment.assignedAt, { timeZone: props.timeZone })}</p>
      </div>
      <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusClassName}`} title={display.detail}>
        {display.state === "completed" && <Check className="size-3" />}
        {display.label}
      </span>
    </div>
  );
}

function SummaryCard(props: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 [&_svg]:size-5">{props.icon}</span>
      <div><p className="text-2xl font-bold tabular-nums">{props.value}</p><p className="text-xs font-medium text-slate-400">{props.label}</p></div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600">{props.label}{props.children}</label>;
}

function CredentialRow(props: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-[10px] font-bold uppercase text-slate-400">{props.label}</dt><dd className={`mt-0.5 break-all text-slate-800 ${props.mono ? "font-mono" : ""}`}>{props.value}</dd></div>;
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

const inputClassName =
  "mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400";
