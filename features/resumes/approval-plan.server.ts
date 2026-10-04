import "server-only";
import { getDatabaseBinding } from "@/db";
import { fail } from "@/features/workflows/workflow.server";
import {
  workflowTrigger,
  type WorkflowGraph,
} from "@/features/workflows/workflow";
import type { ApprovalPlan } from "./approval-plan";

// The same snapshot is checked again inside the approval transaction. Never expose it:
// it includes private run context, and only its digest belongs in the browser.
export const approvalSnapshotSql = `SELECT json_object(
 'workflows',json((SELECT COALESCE(json_group_array(json_object('id',id,'name',name,'version',version,'graph',published_json)), '[]') FROM (SELECT * FROM workflows w WHERE owner_email=?1 AND active=1 AND published_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='workflow' AND a.entity_id=w.id) ORDER BY id LIMIT 50))),
 'runs',json((SELECT COALESCE(json_group_array(json_object('id',id,'workflowId',workflow_id,'name',workflow_name,'version',version,'graph',graph_json,'context',context_json,'updatedAt',updated_at,'status',status)), '[]') FROM (SELECT * FROM workflow_runs WHERE owner_email=?1 AND resume_id=?2 ORDER BY id))),
 'contact',json((SELECT json_object('id',t.id,'username',t.username,'confirmedCandidateId',t.confirmed_candidate_id,'confirmedBy',t.confirmed_by,'updatedAt',t.updated_at,'chatId',t.chat_id) FROM telegram_intakes i JOIN telegram_connections t ON t.id=i.connection_id AND t.owner_email=i.owner_email WHERE i.owner_email=?1 AND i.resume_id=?2 LIMIT 1)),
 'linkedAccount',json((SELECT json_object('id',u.id,'email',u.email) FROM candidates c JOIN user u ON u.id=c.user_id JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email WHERE c.owner_email=?1 AND r.id=?2 LIMIT 1)),
 'account',json((SELECT json_object('id',u.id,'email',u.email,'banned',u.banned,'owner',p.created_by_email,'type',p.account_type,'linkedCandidateId',(SELECT c.id FROM candidates c WHERE c.user_id=u.id LIMIT 1)) FROM user u LEFT JOIN recipient_profiles p ON p.user_id=u.id WHERE u.email=?3 LIMIT 1))
) snapshot`;
type Snapshot = {
  workflows: { id: string; name: string; version: number; graph: string }[];
  runs: {
    id: string;
    workflowId: string;
    name: string;
    version: number;
    graph: string;
    context: string;
    updatedAt: string;
    status: string;
  }[];
  linkedAccount: { id: string; email: string } | null;
  contact: {
    id: string;
    username: string;
    confirmedCandidateId: string | null;
    confirmedBy: string | null;
  } | null;
  account: {
    id: string;
    email: string;
    banned: number | null;
    owner: string | null;
    type: string | null;
    linkedCandidateId: string | null;
  } | null;
};
export async function approvalPlan(
  owner: string,
  resumeId: string,
  candidateId: string,
  email: string,
) {
  const result = await getDatabaseBinding()
    .prepare(approvalSnapshotSql)
    .bind(owner, resumeId, email.trim().toLowerCase())
    .first<{ snapshot: string }>();
  if (!result) fail("Could not check preparation setup.", 409);
  const snapshot = result.snapshot;
  const data: Snapshot = JSON.parse(snapshot);
  const targets: ApprovalPlan["workflows"] = [];
  const seen = new Set<string>();
  const add = (
    id: string,
    name: string,
    version: number,
    graph: WorkflowGraph,
    continuation: boolean,
  ) => {
    if (seen.has(id)) return;
    seen.add(id);
    targets.push({
      id,
      name,
      version,
      continuation,
      sendsTelegram: graph.nodes.some((n) => n.kind === "send_telegram"),
      forms: graph.nodes.flatMap((n) =>
        n.kind === "assign_forms"
          ? (n.config.forms ?? []).map((f) => ({
              name: f.name ?? "Published form",
              versionId: f.versionId ?? null,
            }))
          : [],
      ),
    });
  };
  for (const run of data.runs) {
    if (
      ["queued", "waiting_review", "failed"].includes(run.status) &&
      !JSON.parse(run.context).reviewedAt
    )
      add(run.workflowId, run.name, run.version, JSON.parse(run.graph), true);
    else seen.add(run.workflowId); // An existing run is never replayed by approval.
  }
  for (const w of data.workflows) {
    const graph: WorkflowGraph = JSON.parse(w.graph);
    if (workflowTrigger(graph) === "resume_verified")
      add(w.id, w.name, w.version, graph, false);
  }
  const account = data.account;
  if (
    data.linkedAccount &&
    data.linkedAccount.email !== email.trim().toLowerCase()
  )
    fail(
      "The linked account uses another email. Resolve its account link before preparation.",
      409,
    );
  if (
    account &&
    (account.owner !== owner ||
      account.type !== "candidate" ||
      account.banned ||
      (account.linkedCandidateId && account.linkedCandidateId !== candidateId))
  )
    fail(
      "This email is unavailable for candidate access. Use another email or resolve its account link in Accounts.",
      409,
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(snapshot),
  );
  const plan: ApprovalPlan = {
    revision: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    contact: data.contact
      ? {
          id: data.contact.id,
          username: data.contact.username,
          confirmed:
            data.contact.confirmedCandidateId === candidateId &&
            data.contact.confirmedBy === owner,
        }
      : null,
    existingAccount: account
      ? {
          id: account.id,
          email: account.email,
          linked: account.linkedCandidateId === candidateId,
        }
      : null,
    workflows: targets,
  };
  return { plan, snapshot };
}
