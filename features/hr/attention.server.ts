import "server-only";
import { getDatabaseBinding } from "@/db";
import { listApplications } from "@/features/hiring/hiring.server";
import type { AttentionTask } from "./attention";
import { progressOverview } from "@/features/candidate-progress/progress.server";
import { attentionForCandidates } from "./attention-records.server";
import { attentionPage } from "./attention";
export async function attentionTasks(owner: string) {
  const legacy = await attentionForCandidates(owner, await progressOverview(owner));
  const mapped = new Set((await getDatabaseBinding().prepare("SELECT candidate_id FROM hiring_applications WHERE owner_email=? AND intake=1").bind(owner).all<{candidate_id:string}>()).results.map(r=>r.candidate_id));
  const applicationTasks: AttentionTask[] = [];
  for(let page=1;;page++) {
    const result=await listApplications(owner,new URLSearchParams({page:String(page)}));
    for(const app of result.items) {
      const task=app.nextTask;
      if(!task || (!task.attention && task.label!=="View required forms"))continue;
      applicationTasks.push({id:`application:${app.id}`,type:task.label==="Review CV"?"cv_review":task.tab==="activity"?"preparation":task.label==="Review documents"?"submission_review":task.label==="View required forms"?"pending_forms":"other",name:app.name,email:app.email,candidateId:app.candidateId,detail:app.jobTitle,reason:task.description,action:task.label,href:`/hiring/${app.id}?tab=${task.tab}`,since:app.stageEnteredAt,sinceLabel:"In stage",urgent:task.tab==="activity"});
    }
    if(page*result.pageSize>=result.total)break;
  }
  return [...applicationTasks,...legacy.filter(t=>!t.candidateId || !mapped.has(t.candidateId) || t.id.includes("update:"))];
}
export async function listAttention(owner: string, query: URLSearchParams) {
  return attentionPage(await attentionTasks(owner), query);
}
