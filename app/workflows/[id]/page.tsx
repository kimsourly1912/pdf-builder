import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { WorkflowEditor } from "@/features/workflows/workflow-editor";
export const dynamic = "force-dynamic";
export default async function Page(props: { params: Promise<{ id: string }> }) { const { id } = await props.params; const user = await requireChatGPTUser(`/workflows/${id}`); return <WorkflowEditor displayName={user.displayName} workflowId={id} />; }
