import "server-only";
import { progressOverview } from "@/features/candidate-progress/progress.server";
import { attentionForCandidates } from "./attention-records.server";
import { attentionPage } from "./attention";
export async function attentionTasks(owner: string) {
  return attentionForCandidates(owner, await progressOverview(owner));
}
export async function listAttention(owner: string, query: URLSearchParams) {
  return attentionPage(await attentionTasks(owner), query);
}
