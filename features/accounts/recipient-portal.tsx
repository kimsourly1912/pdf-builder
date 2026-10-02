"use client";

import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  History,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { assignmentDisplay } from "@/features/accounts/assignment-status";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type PortalAssignment = {
  id: string;
  templateName: string;
  description: string;
  versionNumber: number;
  roleName: string;
  roleColor: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  url: string | null;
};

export function RecipientPortal(props: {
  displayName: string;
  email: string;
  accountType: string;
}) {
  const [assignments, setAssignments] = useState<PortalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/portal/assignments", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        assignments?: PortalAssignment[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Assigned forms could not be loaded.");
      }
      setAssignments(payload.assignments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assigned forms could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimeZone(resolvedLocalTimeZone());
      void loadAssignments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssignments]);

  const activeAssignments = assignments.filter(
    (assignment) => assignmentDisplay(assignment.status).state === "active",
  );
  const historyAssignments = assignments.filter(
    (assignment) => assignmentDisplay(assignment.status).state !== "active",
  );
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><ClipboardList className="size-4" /></span>
            <div className="min-w-0"><p className="text-sm font-semibold">PDF Studio</p><p className="truncate text-xs text-muted-foreground">{props.displayName} · {props.accountType}</p></div>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          title="My assigned forms"
          description={`Signed in as ${props.email}`}
          actions={<Button type="button" variant="outline" disabled={loading} onClick={() => void loadAssignments()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>}
        />
        <MetricCard className="mt-6" label="Forms waiting for submission" value={activeAssignments.length} icon={<Clock3 />} tone="primary" />
        {error && <FeedbackAlert className="mt-5" tone="error" title="Forms could not be loaded" description={error} />}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-muted-foreground"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : assignments.length === 0 ? (
          <Card className="mt-5 shadow-none"><Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon"><ClipboardList /></EmptyMedia><EmptyTitle>No forms assigned yet</EmptyTitle><EmptyDescription>New assignments will appear here.</EmptyDescription></EmptyHeader></Empty></Card>
        ) : (
          <div className="mt-6 space-y-8">
            <AssignmentSection
              title="Waiting for submission"
              emptyMessage="You have no forms waiting for submission."
              assignments={activeAssignments}
              timeZone={timeZone}
            />
            {historyAssignments.length > 0 && (
              <AssignmentSection
                title="History"
                emptyMessage=""
                assignments={historyAssignments}
                timeZone={timeZone}
                history
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function AssignmentSection(props: {
  title: string;
  emptyMessage: string;
  assignments: PortalAssignment[];
  timeZone: string;
  history?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        {props.history ? <History className="size-4 text-muted-foreground" /> : <Clock3 className="size-4 text-primary" />}
        <h2 className="text-sm font-semibold">{props.title}</h2>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{props.assignments.length}</span>
      </div>
      {props.assignments.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed bg-card p-5 text-center text-xs text-muted-foreground">{props.emptyMessage}</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {props.assignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} timeZone={props.timeZone} />
          ))}
        </div>
      )}
    </section>
  );
}

function AssignmentCard(props: {
  assignment: PortalAssignment;
  timeZone: string;
}) {
  const { assignment } = props;
  const display = assignmentDisplay(assignment.status);
  const tone = assignmentTone(display.state);
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-5">
      <div className="flex items-start gap-3">
        <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: assignment.roleColor }} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{assignment.templateName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Version {assignment.versionNumber} · {assignment.roleName}</p>
        </div>
        <StatusBadge label={display.label} tone={tone} className="text-[10px]" />
      </div>
      {assignment.description && <p className="mt-4 text-sm leading-6 text-muted-foreground">{assignment.description}</p>}
      <p className="mt-4 text-xs text-muted-foreground">Assigned {formatLocalDateTime(assignment.assignedAt, { timeZone: props.timeZone })}</p>
      {assignment.url ? (
        <Button asChild className="mt-4 w-full"><a href={assignment.url}><ExternalLink className="size-4" /> Open form</a></Button>
      ) : (
        <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${assignmentPanelClassName(display.state)}`}>
          {display.state === "completed" ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
          {display.state === "completed" && assignment.completedAt
            ? `Submitted ${formatLocalDateTime(assignment.completedAt, { timeZone: props.timeZone })}`
            : display.detail}
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function assignmentTone(state: ReturnType<typeof assignmentDisplay>["state"]) {
  if (state === "active") {
    return "info" as const;
  }
  if (state === "completed") {
    return "success" as const;
  }
  if (state === "cancelled") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function assignmentPanelClassName(
  state: ReturnType<typeof assignmentDisplay>["state"],
) {
  if (state === "completed") return "bg-success/10 text-success-foreground";
  if (state === "cancelled") return "bg-warning/10 text-warning-foreground";
  if (state === "active") return "bg-info/10 text-info-foreground";
  return "bg-muted text-muted-foreground";
}
