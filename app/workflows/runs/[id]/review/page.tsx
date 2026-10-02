import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { WorkflowReview } from "@/features/workflows/workflow-review";
export const dynamic = "force-dynamic";
export default async function Page(props: { params: Promise<{ id: string }> }) { const { id } = await props.params; const user = await requireChatGPTUser(`/workflows/runs/${id}/review`); return <WorkflowReview displayName={user.displayName} runId={id} />; }
