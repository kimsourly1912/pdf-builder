import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { InterviewDashboard } from "@/features/interviews/interview-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/interviews");
  return (
    <>
      <p className="p-4 text-sm">
        Original interview work list.{" "}
        <Link
          className="underline"
          href="/hiring?queue=upcoming&pipeline=all&view=list"
        >
          Open application interview tasks
        </Link>
        , or{" "}
        <Link className="underline" href="/hiring/legacy">
          review legacy records
        </Link>
        .
      </p>
      <InterviewDashboard
        displayName={owner.displayName}
        preferenceKey={`interview-progress:${owner.email}`}
      />
    </>
  );
}
