import { attentionForCandidates } from "@/features/hr/attention-records.server";
import { attentionResponsibility } from "@/features/hr/attention";
import { getCvUpdate } from "./cv-updates.server";
import "server-only";
import { stageSince } from "./stage-since";
import { getDatabaseBinding } from "@/db";
import { fail } from "@/features/workflows/workflow.server";
import type { WorkflowGraph, RunContext } from "@/features/workflows/workflow";
import {
  STAGES,
  STAGE_LABELS,
  automaticStage,
  transitionRequirement,
  type CandidateStage,
  type CandidateProgress,
  type ProgressForm,
} from "./progress";
type CvRow = {
  id: string;
  name: string;
  email: string;
  userId: string | null;
  candidateRevision: string;
  resumeId: string;
  fileName: string;
  receivedAt: string;
  resumeRevision: string;
  approvalId: string | null;
  approvedAt: string | null;
  intakeId: string | null;
  telegram: string | null;
  confirmed: number;
  archived: number;
  updateStatus: string | null;
  reviewStartedAt: string | null;
  reviewStartedBy: string | null;
  approvedBy: string | null;
};
type Meta = {
  candidate_id: string;
  selected_resume_id: string | null;
  primary_run_id: string | null;
  manual_stage: CandidateStage | null;
  basis_json: string | null;
  version: number;
  updated_at: string;
};
type RunRow = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  resume_id: string;
  context_json: string;
  graph_json: string;
  status: string;
  created_at: string;
  updated_at: string;
  archived: number;
  error_message: string | null;
};
type FormRow = {
  id: string;
  userId: string;
  templateId: string;
  templateKind: string;
  versionId: string;
  roleId: string;
  name: string;
  status: string;
  completedAt: string | null;
  profileId: string | null;
  updatedAt: string;
  linkStatus: string;
  submissionCount: number;
  expiresAt: string | null;
  submissionId: string | null;
  submissionPdf: string | null;
  versionNumber: number;
  assignedAt: string;
  reviewStatus: string | null;
  reviewedAt: string | null;
  correctionReason: string | null;
  correctionAt: string | null;
};
type Delivery = {
  id: string;
  run_id: string;
  status: string;
  updated_at: string;
};
const activeCv =
  "NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id) AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='intake' AND a.entity_id=i.id)";
async function rows<T>(query: string, owner: string) {
  return (await getDatabaseBinding().prepare(query).bind(owner).all<T>())
    .results;
}
async function load(owner: string, resumeId?: string) {
  const [cvs, metadata, runs, forms, deliveries, accounts, moves, updates] =
    await Promise.all([
      rows<CvRow>(
        `SELECT c.id,c.full_name name,c.email,c.user_id userId,c.updated_at candidateRevision,r.id resumeId,r.file_name fileName,r.created_at receivedAt,r.updated_at resumeRevision,
 (SELECT p.id FROM candidate_profile_versions p WHERE p.resume_id=r.id AND p.candidate_id=c.id AND p.owner_email=c.owner_email AND p.created_by_email=c.owner_email AND p.verification_status='verified' AND r.verification_status='verified' AND c.verification_status='verified' AND r.duplicate_candidate_id IS NULL AND p.created_at>=r.updated_at AND p.created_at>=c.updated_at ORDER BY p.version_number DESC LIMIT 1) approvalId,
 (SELECT p.verified_at FROM candidate_profile_versions p WHERE p.resume_id=r.id AND p.candidate_id=c.id AND p.owner_email=c.owner_email AND p.verification_status='verified' ORDER BY p.version_number DESC LIMIT 1) approvedAt,
 u.status updateStatus,h.started_at reviewStartedAt,h.started_by reviewStartedBy,
 (SELECT p.created_by_email FROM candidate_profile_versions p WHERE p.resume_id=r.id AND p.verification_status='verified' ORDER BY p.version_number DESC LIMIT 1) approvedBy,
 i.id intakeId,t.username telegram,CASE WHEN t.confirmed_candidate_id=c.id AND t.confirmed_by=c.owner_email THEN 1 ELSE 0 END confirmed,CASE WHEN ${activeCv} THEN 0 ELSE 1 END archived
 FROM candidates c JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email LEFT JOIN telegram_intakes i ON i.resume_id=r.id AND i.owner_email=c.owner_email LEFT JOIN telegram_connections t ON t.id=i.connection_id AND t.owner_email=c.owner_email LEFT JOIN candidate_cv_updates u ON u.resume_id=r.id LEFT JOIN candidate_cv_reviews h ON h.resume_id=r.id WHERE c.owner_email=? ORDER BY r.created_at DESC,r.id DESC`,
        owner,
      ),
      rows<Meta>("SELECT * FROM candidate_progress WHERE owner_email=?", owner),
      rows<RunRow>(
        "SELECT w.id,w.workflow_id,w.workflow_name,w.resume_id,w.context_json,w.graph_json,w.status,w.created_at,w.updated_at,w.error_message,EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='workflow_run' AND a.entity_id=w.id) archived FROM workflow_runs w WHERE w.owner_email=? ORDER BY w.created_at DESC,w.id DESC",
        owner,
      ),
      rows<FormRow>(
        "SELECT f.id,f.user_id userId,f.template_id templateId,t.kind templateKind,f.template_version_id versionId,f.role_id roleId,t.name,f.status,v.version_number versionNumber,f.assigned_at assignedAt,(SELECT h.status FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE s.recipient_link_id=l.id ORDER BY s.submitted_at DESC LIMIT 1) reviewStatus,(SELECT h.reviewed_at FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE s.recipient_link_id=l.id ORDER BY s.submitted_at DESC LIMIT 1) reviewedAt,(SELECT h.reason FROM submission_reviews h WHERE h.correction_link_id=l.id) correctionReason,(SELECT h.reviewed_at FROM submission_reviews h WHERE h.correction_link_id=l.id) correctionAt,COALESCE(f.completed_at,l.completed_at) completedAt,f.candidate_profile_version_id profileId,f.updated_at updatedAt,l.status linkStatus,l.submission_count submissionCount,l.expires_at expiresAt,(SELECT s.id FROM submissions s WHERE s.recipient_link_id=l.id ORDER BY s.submitted_at DESC LIMIT 1) submissionId,(SELECT COALESCE(a.file_key,s.completed_file_key) FROM submissions s LEFT JOIN form_submission_artifacts a ON a.submission_id=s.id WHERE s.recipient_link_id=l.id ORDER BY s.submitted_at DESC LIMIT 1) submissionPdf FROM form_assignments f JOIN recipient_profiles p ON p.user_id=f.user_id JOIN templates t ON t.id=f.template_id AND t.owner_email=p.created_by_email JOIN template_versions v ON v.id=f.template_version_id JOIN recipient_links l ON l.id=f.recipient_link_id WHERE p.created_by_email=?",
        owner,
      ),
      rows<Delivery>(
        "SELECT id,run_id,status,updated_at FROM telegram_deliveries WHERE owner_email=?",
        owner,
      ),
      rows<{ id: string; banned: number; email: string }>(
        "SELECT u.id,u.banned,u.email FROM user u JOIN recipient_profiles p ON p.user_id=u.id WHERE p.created_by_email=?",
        owner,
      ),
      rows<{ candidateId: string; at: string; metadata: string }>(
        "SELECT target_id candidateId,created_at at,metadata_json metadata FROM audit_events WHERE owner_email=? AND action='candidate.progress_stage_changed' ORDER BY created_at DESC",
        owner,
      ),
      rows<{resumeId: string; candidateId: string; baseResumeId: string; fileName: string; status: string; createdAt: string; updatedAt: string; reason: string | null}>("SELECT u.resume_id resumeId,u.candidate_id candidateId,u.base_resume_id baseResumeId,r.file_name fileName,u.status,u.created_at createdAt,u.updated_at updatedAt,u.reason FROM candidate_cv_updates u JOIN resumes r ON r.id=u.resume_id WHERE u.owner_email=? AND u.status NOT IN ('awaiting_confirmation','cancelled','replaced') AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id) ORDER BY u.created_at DESC", owner),
    ]);
  const groups = new Map<string, CvRow[]>();
  for (const r of cvs) {
    const list = groups.get(r.id) ?? [];
    list.push(r);
    groups.set(r.id, list);
  }
  const entries = [];
  for (const [id, history] of groups) {
    const active = history.filter((c) => !c.archived && !["awaiting_confirmation", "pending", "reviewing", "declined", "cancelled"].includes(c.updateStatus ?? ""));
    if (!active.length) continue;
    const meta = metadata.find((m) => m.candidate_id === id),
      cv =
        active.find((c) => c.resumeId === resumeId) ??
        active.find((c) => c.resumeId === meta?.selected_resume_id) ??
        active.find((c) =>
          runs.some(
            (r) =>
              r.resume_id === c.resumeId &&
              !r.archived &&
              !!JSON.parse(r.context_json).reviewedAt,
          ),
        ) ??
        active[0];
    const cvRuns = runs.filter(
      (r) =>
        (history.some((c) => c.resumeId === r.resume_id) ||
          JSON.parse(r.context_json).candidateId === id) &&
        (!JSON.parse(r.context_json).candidateId ||
          JSON.parse(r.context_json).candidateId === id),
    );
    const matching = cvRuns.filter(
        (r) => r.resume_id === cv.resumeId && !r.archived,
      ),
      run =
        matching.find((r) => r.id === meta?.primary_run_id) ??
        matching.find((r) =>
          JSON.parse(r.graph_json).nodes.some(
            (n: { kind: string }) => n.kind === "assign_forms",
          ),
        ) ??
        matching[0] ??
        null;
    const context: RunContext = run
        ? JSON.parse(run.context_json)
        : { steps: {} },
      graph: WorkflowGraph | null = run ? JSON.parse(run.graph_json) : null;
    const targets =
      graph?.nodes
        .filter((n) => n.kind === "assign_forms")
        .flatMap((n) => n.config.forms ?? []) ?? [];
    const accountUserId = context.userId ?? cv.userId;
    const accountForms = forms.filter((f) => f.userId === accountUserId);
    const relevant = accountForms.filter((f) =>
      run
        ? targets.some(
            (t) =>
              t.templateId === f.templateId &&
              t.versionId === f.versionId &&
              t.roleId === f.roleId,
          )
        : !!cv.approvalId && f.profileId === cv.approvalId,
    );
    const manualPreparation = !run && relevant.length > 0;
    const runDeliveries = deliveries.filter((d) => d.run_id === run?.id),
      account = accounts.find((a) => a.id === (context.userId ?? cv.userId));
    const current =
      !!cv.approvalId &&
      (!run ||
        context.profileVersionId === cv.approvalId ||
        context.resumeEditorApproval?.profileVersionId === cv.approvalId);
    const facts = {
      verified: !!cv.approvalId,
      reviewStarted: !!cv.reviewStartedAt,
      runStatus: run?.status ?? (manualPreparation ? "completed" : null),
      preparationCurrent:
        current &&
        (manualPreparation ||
          !!graph?.nodes.some((n) => n.kind === "assign_forms")),
      assigned: relevant.length,
      required: manualPreparation ? relevant.length : targets.length,
      completed: relevant.filter(
        (f) => f.status === "completed" && !!f.completedAt,
      ).length,
      accepted: relevant.filter(
        (f) => f.status === "completed" && f.reviewStatus === "accepted",
      ).length,
      invitationRequired: !!graph?.nodes.some(
        (n) => n.kind === "send_telegram",
      ),
      invitationSent: runDeliveries.some((d) => d.status === "sent"),
    };
    const basis = JSON.stringify({
      resumeId: cv.resumeId,
      candidateRevision: cv.candidateRevision,
      resumeRevision: cv.resumeRevision,
      profile: cv.approvalId,
      runId: run?.id ?? null,
      facts: { ...facts, reviewStarted: undefined },
      deliveries: runDeliveries.map((d) => ({ id: d.id, status: d.status })),
      accountBanned: account?.banned ?? null,
      forms: relevant.map((f) => ({
        id: f.id,
        status: f.status,
        linkStatus: f.linkStatus,
        submissionCount: f.submissionCount,
        reviewStatus: f.reviewStatus,
      })),
    });
    const attention: string[] = [],
      issues: CandidateProgress["issues"] = [];
    const accountHref = account
      ? `/accounts?${new URLSearchParams({ search: account.email, account: account.id })}`
      : "/accounts";
    const runHref = run
      ? `/workflows/${run.workflow_id}?tab=runs&run=${run.id}`
      : "/workflows";
    const issue = (
      key: string,
      action: string,
      href: string,
      message: string,
    ) => {
      attention.push(message);
      issues.push({ key, action, href, message });
    };
    if (active[0].resumeId !== cv.resumeId && !active[0].updateStatus)
      issue(
        "new_cv",
        "Choose latest CV",
        `/candidates/${id}?tab=documents#selected-cv`,
        "A newer CV is available. Select it to review; current preparation stays linked to this CV.",
      );
    if (updates.some(u => u.candidateId === id && ["pending", "reviewing"].includes(u.status)))
      issue("cv_update", "Review CV update", `/candidates/${id}?tab=documents#cv-updates`, "A CV update needs HR review. Your active application and forms are unchanged.");
    if (cv.approvalId && cv.intakeId && !cv.confirmed && !facts.invitationSent)
      issue(
        "contact",
        "Confirm contact",
        `/candidates/${id}?tab=communication`,
        "Confirm this Telegram contact before preparing its invitation.",
      );
    if (account?.banned)
      issue(
        "account",
        "Review account access",
        accountHref,
        "Account access is disabled. Review Accounts or Archive.",
      );
    if (run?.status === "failed")
      issue(
        "run_failed",
        "Open failed step",
        runHref,
        run.error_message ?? "Preparation failed. Open the run to resolve it.",
      );
    if (run?.status === "rejected")
      issue(
        "rejected",
        "Review CV",
        `/candidates/${id}?tab=documents`,
        "CV review was rejected in this preparation.",
      );
    if (context.waitingFor === "telegram")
      issue(
        "telegram",
        "Connect Telegram contact",
        runHref,
        "Telegram contact or delivery needs attention.",
      );
    if (context.waitingFor === "telegram_retry")
      issue(
        "telegram_retry",
        "Review Telegram retry",
        runHref,
        "Telegram delivery is waiting for a retry.",
      );
    if (runDeliveries.some((d) => d.status === "uncertain"))
      issue(
        "uncertain",
        "Check delivery before resending",
        runHref,
        "Telegram delivery is uncertain. Check before resending.",
      );
    if (run && context.reviewedAt && !current)
      issue(
        "changed_cv",
        "Review changed CV",
        `/candidates/${id}?tab=documents`,
        "CV details changed after this preparation. Previous forms remain preserved.",
      );
    if (
      matching.filter((r) =>
        ["queued", "running", "waiting_review"].includes(r.status),
      ).length > 1
    )
      issue(
        "multiple_runs",
        "Compare preparations",
        `/candidates/${id}?tab=overview#selected-run`,
        "Multiple preparations are active. Check the selected run.",
      );
    if (
      relevant.some(
        (f) =>
          f.status !== "completed" &&
          (f.linkStatus === "revoked" ||
            f.status === "cancelled" ||
            (f.expiresAt && f.expiresAt <= new Date().toISOString())),
      )
    )
      issue(
        "forms",
        "Review form assignments",
        accountHref,
        "An assigned form is cancelled or expired. Review the assignment.",
      );
    const auto = automaticStage(facts),
      manual =
        !!meta?.manual_stage &&
        meta.basis_json === basis &&
        !transitionRequirement(facts, meta.manual_stage);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({
          basis,
          updates: updates.filter(u => u.candidateId === id),
          version: meta?.version ?? 0,
          runRevision: run?.updated_at,
          forms: relevant.map((f) => f.updatedAt),
          deliveries: runDeliveries.map((d) => d.updated_at),
        }),
      ),
    );
    const revision = Array.from(new Uint8Array(hash), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    const dtoRun = (r: RunRow) => ({
      id: r.id,
      workflowId: r.workflow_id,
      resumeId: r.resume_id,
      name: r.workflow_name,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      archived: !!r.archived,
      waitingFor: JSON.parse(r.context_json).waitingFor,
    });
    const dtoCv = (c: CvRow) => ({
      id: c.resumeId,
      fileName: c.fileName,
      receivedAt: c.receivedAt,
      verified: !!c.approvalId,
      archived: !!c.archived,
      intakeId: c.intakeId,
    });
    const activity: CandidateProgress["activity"] = [
      {
        id: `cv:${cv.resumeId}`,
        action: "CV received",
        actor: "Submission",
        at: cv.receivedAt,
        metadata: { fileName: cv.fileName },
      },
    ];
    if (cv.approvalId && cv.approvedAt)
      activity.push({
        id: `approval:${cv.approvalId}`,
        action: "CV approved",
        actor: "HR",
        at: cv.approvedAt,
        metadata: {},
      });
    if (run)
      activity.push({
        id: `run:${run.id}`,
        action: "Preparation started",
        actor: run.workflow_name,
        at: run.created_at,
        metadata: {},
      });
    for (const d of runDeliveries.filter((d) => d.status === "sent"))
      activity.push({
        id: d.id,
        action: "Invitation accepted by Telegram",
        actor: "Workflow",
        at: d.updated_at,
        metadata: {},
      });
    for (const f of relevant.filter(
      (f) => f.status === "completed" && f.completedAt,
    ))
      activity.push({
        id: f.id,
        action: `Form submitted: ${f.name}`,
        actor: "Candidate",
        at: f.completedAt!,
        metadata: {},
      });
    const formDto = (f: FormRow): ProgressForm => ({
      id: f.id,
      name: f.name,
      status: f.status === "completed" ? "completed" : f.status === "cancelled" || f.linkStatus === "revoked" ? "cancelled" : f.expiresAt && f.expiresAt <= new Date().toISOString() ? "expired" : f.status,
      completedAt: f.completedAt,
      reused: f.profileId !== context.profileVersionId,
      templateId: f.templateId,
      versionNumber: f.versionNumber,
      assignedAt: f.assignedAt,
      reviewStatus: f.reviewStatus ?? "pending",
      isRequired: relevant.some((r) => r.id === f.id),
      fillUrl: `/fill/assigned_${f.id}`,
      correctionReason: f.correctionReason,
      responseUrl: f.submissionId
        ? `/submissions/${f.submissionId}/review`
        : null,
      url:
        f.submissionId && f.submissionPdf
          ? `/api/submissions/${f.submissionId}/pdf`
          : null,
    });
    const publicForms = relevant.map(formDto);
    for (const f of relevant.filter((f) => f.reviewedAt))
      activity.push({
        id: `review:${f.id}`,
        action: `Form accepted: ${f.name}`,
        actor: "HR",
        at: f.reviewedAt!,
        metadata: {},
      });
    const item: CandidateProgress = {
      id,
      name: cv.name || "Unnamed candidate",
      email: cv.email,
      telegram: cv.telegram ?? "",
      contactConfirmed: !!cv.confirmed,
      stage: manual ? meta!.manual_stage! : auto,
      approvalBy: cv.approvedBy,
      reviewStartedAt: cv.reviewStartedAt,
      reviewStartedBy: cv.reviewStartedBy,
      cvUpdates: updates.filter(u => u.candidateId === id),
      currentCv: (() => {
        const current = history.find(c => !c.archived && c.updateStatus === "accepted") ?? cv;
        return {id: current.resumeId, fileName: current.fileName, receivedAt: current.receivedAt, verified: !!current.approvalId, archived: !!current.archived, intakeId: current.intakeId};
      })(),
      automaticStage: auto,
      manual,
      revision,
      selectedCv: dtoCv(cv),
      cvs: history.filter(c => c.updateStatus !== "awaiting_confirmation").map(dtoCv),
      run: run ? dtoRun(run) : null,
      runs: cvRuns.map(dtoRun),
      facts,
      forms: publicForms,
      attention,
      issues,
      stageSince: stageSince(manual ? meta!.manual_stage! : auto, {
        receivedAt: cv.receivedAt,
        approvedAt: cv.approvedAt,
        approvalCurrent: !!cv.approvalId,
        cvChangedAt: cv.resumeRevision,
        candidateChangedAt: cv.candidateRevision,
        manualAt: manual
          ? moves.find(
              (m) =>
                m.candidateId === id &&
                JSON.parse(m.metadata).resumeId === cv.resumeId &&
                JSON.parse(m.metadata).to === STAGE_LABELS[meta!.manual_stage!],
            )?.at
          : undefined,
        reviewStartedAt: cv.reviewStartedAt ?? context.reviewStartedAt,
        preparationCompletedAt:
          context.preparationCompletedAt ??
          graph?.nodes
            .filter((n) => n.kind === "complete")
            .map((n) => context.steps?.[n.id]?.completedAt)
            .filter((s): s is string => !!s)
            .sort()
            .at(-1) ??
          (manualPreparation
            ? relevant
                .map((f) => f.assignedAt)
                .sort()
                .at(-1)
            : undefined),
        formCorrectionAt: relevant
          .map((f) => f.correctionAt)
          .filter((s): s is string => !!s),
        formReviewedAt: relevant
          .map((f) => f.reviewedAt)
          .filter((s): s is string => !!s),
        formCompletedAt: relevant
          .map((f) => f.completedAt)
          .filter((s): s is string => !!s),
      }),
      accountCreated: !!account,
      accountId: account?.id ?? null,
      accountEmail: account?.email ?? null,
      accountDisabled: !!account?.banned,
      assignments: accountForms.map(formDto),
      invitations: runDeliveries.map((d) => ({
        id: d.id,
        status: d.status,
        at: d.updated_at,
        runId: d.run_id,
      })),
      lastActivity: [
        cv.receivedAt,
        cv.resumeRevision,
        cv.candidateRevision,
        run?.updated_at,
        meta?.updated_at,
        cv.reviewStartedAt,
        ...updates.filter(u => u.candidateId === id).map(u => u.updatedAt),
        ...relevant.map((f) => f.updatedAt),
        ...relevant.map((f) => f.reviewedAt),
        ...relevant.map((f) => f.correctionAt),
        ...runDeliveries.map((d) => d.updated_at),
      ]
        .filter((s): s is string => !!s)
        .sort()
        .at(-1)!,
      activity,
    };
    entries.push({ item, cv, meta, run, basis, relevant });
  }
  return entries;
}
export async function listProgress(owner: string, query: URLSearchParams) {
  const sort = query.get("sort") ?? "recent";
  const all = (await load(owner))
    .map((e) => e.item)
    .sort(
      (a, b) =>
        (sort === "oldest"
          ? (a.stageSince ?? "9999").localeCompare(b.stageSince ?? "9999")
          : sort === "newest"
            ? b.selectedCv.receivedAt.localeCompare(a.selectedCv.receivedAt)
            : b.lastActivity.localeCompare(a.lastActivity)) ||
        a.id.localeCompare(b.id),
    );
  const visibleCandidateIds = new Set(all.map((item) => item.id));
  const hrAttention = new Set(
    (await attentionForCandidates(owner, all))
      .filter((task) => attentionResponsibility(task) === "hr")
      .map((task) => task.candidateId)
      .filter((id): id is string => !!id && visibleCandidateIds.has(id)),
  );
  const search = query.get("search")?.trim().toLowerCase() ?? "",
    stage = query.get("stage"),
    attention = query.get("attention") === "true";
  const items = all.filter(
    (i) =>
      (!search ||
        `${i.name} ${i.email} ${i.telegram} ${i.selectedCv.fileName}`
          .toLowerCase()
          .includes(search)) &&
      (!stage || stage === "all" || i.stage === stage) &&
      (!attention || hrAttention.has(i.id)),
  );
  const page = Math.min(
      Math.max(1, Math.ceil(items.length / 50)),
      Math.max(1, Math.floor(Number(query.get("page")) || 1)),
    ),
    size = 50;
  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    pageSize: size,
    stats: Object.fromEntries(
      STAGES.map((s) => [s, items.filter((i) => i.stage === s).length]),
    ),
    needsAttention: hrAttention.size,
  };
}
export async function detailProgress(owner: string, id: string) {
  const e = (await load(owner)).find((e) => e.item.id === id);
  if (!e) fail("Candidate with an active CV not found.", 404);
  const events = (
    await getDatabaseBinding()
      .prepare(
        "SELECT id,action,actor_id actor,created_at at,metadata_json FROM audit_events WHERE owner_email=? AND target_type='candidate' AND target_id=? AND (action LIKE 'candidate.progress_%' OR action LIKE 'candidate.cv_update_%' OR action='candidate.changes_saved') ORDER BY created_at DESC LIMIT 100",
      )
      .bind(owner, id)
      .all<{
        id: string;
        action: string;
        actor: string;
        at: string;
        metadata_json: string;
      }>()
  ).results;
  e.item.activity.push(
    ...events.map((a) => ({
      id: a.id,
      action:
        a.action === "candidate.changes_saved" ? "CV review draft saved" : a.action === "candidate.progress_stage_changed"
          ? "HR stage changed"
          : a.action === "candidate.progress_cv_selected"
            ? "Selected CV changed"
            : a.action.startsWith("candidate.cv_update_") ? `CV update ${a.action.slice("candidate.cv_update_".length)}` : "Selected preparation changed",
      actor: a.actor,
      at: a.at,
      metadata: JSON.parse(a.metadata_json),
    })),
  );
  if (e.item.accountId) {
    const reviews = (
      await getDatabaseBinding()
        .prepare(
          "SELECT a.id,a.action,a.actor_id actor,a.created_at at,a.metadata_json FROM audit_events a JOIN submissions s ON s.id=a.target_id JOIN recipient_links l ON l.id=s.recipient_link_id WHERE a.owner_email=? AND a.target_type='submission' AND a.action IN ('submission.accepted','submission.corrections_requested') AND l.assigned_user_id=? ORDER BY a.created_at DESC LIMIT 100",
        )
        .bind(owner, e.item.accountId)
        .all<{
          id: string;
          action: string;
          actor: string;
          at: string;
          metadata_json: string;
        }>()
    ).results;
    e.item.activity = e.item.activity.filter(
      (a) => !a.id.startsWith("review:"),
    );
    e.item.activity.push(
      ...reviews.map((a) => ({
        id: a.id,
        action:
          a.action === "submission.accepted"
            ? "Form accepted by HR"
            : "Form corrections requested",
        actor: a.actor,
        at: a.at,
        metadata: JSON.parse(a.metadata_json),
      })),
    );
  }
  e.item.activity.sort((a, b) => b.at.localeCompare(a.at));
  return e.item;
}
export async function updateProgress(
  owner: string,
  id: string,
  body: Record<string, unknown>,
) {
  const e = (await load(owner)).find((e) => e.item.id === id);
  if (!e) fail("Candidate with an active CV not found.", 404);
  if (body.expectedRevision !== e.item.revision)
    fail("This candidate changed. Refresh before moving or selecting it.", 409);
  const { item, cv, meta, run, basis, relevant } = e;
  let selectedResumeId = cv.resumeId,
    primaryRunId: string | null = run?.id ?? null,
    manualStage: CandidateStage | null = null,
    action = "",
    event: Record<string, unknown> = {};
  if (body.action === "move" || body.action === "start_review") {
    if (body.action === "start_review") {
      if (item.facts.verified) fail("This CV is already approved.", 409);
      body.stage = "reviewing";
    }
    if (
      typeof body.stage !== "string" ||
      !STAGES.includes(body.stage as CandidateStage)
    )
      fail("Choose a valid candidate stage.", 422);
    const target = body.stage as CandidateStage,
      required = transitionRequirement(item.facts, target);
    if (required) fail(required.message, 422);
    if (target === "reviewing" && !item.facts.verified && !item.reviewStartedAt) {
      // Added to the guarded mutation batch below.
      body.startReview = true;
    }
    if (target === item.stage)
      return { candidate: await detailProgress(owner, id) };
    const backward = STAGES.indexOf(target) < STAGES.indexOf(item.stage);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length > 500 || (backward && reason.length < 3))
      fail(
        "Provide a short reason for moving this candidate backward (up to 500 characters).",
        422,
      );
    manualStage = target === "accepted" || body.action === "start_review" || body.startReview ? null : target;
    action = "candidate.progress_stage_changed";
    event = {
      from: STAGE_LABELS[item.stage],
      to: STAGE_LABELS[target],
      reason,
      resumeId: cv.resumeId,
      runId: primaryRunId,
    };
  } else if (body.action === "select_cv") {
    const selected = item.cvs.find((c) => c.id === body.resumeId);
    if (!selected || selected.archived)
      fail("Choose an active CV belonging to this candidate.", 422);
    const update = await getCvUpdate(owner, selected.id);
    if (update && !["accepted", "replaced"].includes(update.status)) fail("Review and approve this update before using it for a new preparation.", 422);
    selectedResumeId = selected.id;
    primaryRunId = null;
    action = "candidate.progress_cv_selected";
    event = { from: cv.fileName, to: selected.fileName, resumeId: selected.id };
  } else if (body.action === "select_run") {
    const selected = item.runs.find((r) => r.id === body.runId && !r.archived); // Only a preparation for the selected CV can become its current run.
    const owned = await getDatabaseBinding()
      .prepare(
        "SELECT resume_id FROM workflow_runs WHERE id=? AND owner_email=?",
      )
      .bind(String(body.runId ?? ""), owner)
      .first<{ resume_id: string }>();
    if (!selected || owned?.resume_id !== cv.resumeId)
      fail("Choose an active preparation for the selected CV.", 422);
    primaryRunId = selected.id;
    action = "candidate.progress_preparation_selected";
    event = { runId: selected.id };
  } else fail("Choose move, select_cv or select_run.", 422);
  const db = getDatabaseBinding(),
    now = new Date().toISOString();
  const statements = [
    db
      .prepare(
        "INSERT INTO candidate_progress_guards(owner_email,candidate_id,resume_id,candidate_revision,resume_revision,progress_version,target_resume_id,target_run_id,run_id,run_revision,forms_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        owner,
        id,
        cv.resumeId,
        cv.candidateRevision,
        cv.resumeRevision,
        meta?.version ?? 0,
        selectedResumeId,
        primaryRunId,
        run?.id ?? null,
        run?.updated_at ?? null,
        JSON.stringify(
          relevant.map((f) => ({
            id: f.id,
            status: f.status,
            updatedAt: f.updatedAt,
            linkStatus: f.linkStatus,
            submissionCount: f.submissionCount,
          })),
        ),
      ),
    ...(body.startReview ? [db.prepare("INSERT INTO candidate_cv_reviews(resume_id,owner_email,started_by,started_at) VALUES(?,?,?,?) ON CONFLICT(resume_id) DO NOTHING").bind(cv.resumeId, owner, owner, now)] : []),
    db
      .prepare(
        "INSERT INTO candidate_progress(candidate_id,owner_email,selected_resume_id,primary_run_id,manual_stage,basis_json,version,updated_at) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(candidate_id) DO UPDATE SET selected_resume_id=excluded.selected_resume_id,primary_run_id=excluded.primary_run_id,manual_stage=excluded.manual_stage,basis_json=excluded.basis_json,version=candidate_progress.version+1,updated_at=excluded.updated_at WHERE candidate_progress.owner_email=excluded.owner_email",
      )
      .bind(
        id,
        owner,
        selectedResumeId,
        primaryRunId,
        manualStage,
        manualStage ? basis : null,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at)VALUES(?,?,'owner',?,?,'candidate',?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        owner,
        owner,
        action,
        id,
        JSON.stringify(event),
        now,
      ),
  ];
  try {
    await db.batch(statements);
  } catch {
    fail(
      "This candidate changed while you were updating it. Refresh and try again.",
      409,
    );
  }
  return { candidate: await detailProgress(owner, id) };
}

export async function progressOverview(owner: string, resumeId?: string) {
  return (await load(owner, resumeId)).map((e) => e.item);
}
