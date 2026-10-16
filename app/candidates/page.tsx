import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProgressDashboard } from "@/features/candidate-progress/progress-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/candidates");
  return (
    <>
      <p className="p-4 text-sm">
        Original preparation view.{" "}
        <Link className="underline" href="/hiring">
          Open Hiring pipeline
        </Link>{" "}
        for application tasks, or{" "}
        <Link className="underline" href="/hiring/legacy">
          review legacy records
        </Link>
        .
      </p>
      <ProgressDashboard
        displayName={owner.displayName}
        preferenceKey={`candidate-progress-view:${owner.email}`}
      />
    </>
  );
}
