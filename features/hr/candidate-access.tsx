"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CandidateProgress } from "@/features/candidate-progress/progress";

export function CandidateAccess({ item }: { item: CandidateProgress }) {
  const [notice, setNotice] = useState("");
  const assignments = (item.assignments ?? item.forms).filter((f) =>
    ["assigned", "in_progress"].includes(f.status),
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portal`);
      setNotice(
        "Sign-in link copied. Share it with the candidate. Copying does not send an invitation.",
      );
    } catch {
      setNotice(
        "Could not copy. Share this site’s /portal address, or copy an individual form link below.",
      );
    }
  }
  if (!assignments.length && !item.run && !item.invitations?.length)
    return null;
  const latest = item.invitations?.[0];
  return (
    <section
      aria-label="Share candidate access"
      className="rounded-xl border bg-card p-5"
    >
      <h2 className="font-semibold">Share access</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Forms available in account</dt>
          <dd>
            {item.accountDisabled
              ? "Account access disabled"
              : assignments.length
                ? `${assignments.length} form${assignments.length === 1 ? "" : "s"} waiting for answers`
                : "No forms waiting for answers"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telegram invitation</dt>
          <dd>
            {item.facts.invitationSent
              ? "Sent · read status unavailable"
              : latest?.status === "uncertain"
                ? "Delivery uncertain · check before resending"
                : latest
                  ? `Delivery ${latest.status}`
                  : "No invitation recorded for this preparation"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        {item.selectedCv.intakeId
          ? "First-time Telegram access uses the preparation workflow’s private activation invitation. Check contact and delivery before following up."
          : "Share the sign-in or form link after the candidate has activated their account. Assigning or copying a link does not send a message."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.accountCreated &&
          !item.accountDisabled &&
          assignments.length > 0 && (
            <Button variant="outline" onClick={() => void copy()}>
              Copy sign-in link
            </Button>
          )}
        <Button asChild variant="outline">
          <Link href={`/candidates/${item.id}?tab=communication`}>
            Check contact & invitation
          </Link>
        </Button>
        {item.run && (
          <Button asChild variant="outline">
            <Link
              href={`/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`}
            >
              {["failed", "waiting_review"].includes(item.run.status) ||
              latest?.status === "uncertain"
                ? "Resolve invitation or preparation"
                : "View preparation & delivery"}
            </Link>
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
