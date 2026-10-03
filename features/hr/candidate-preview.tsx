"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormRenderer } from "@/features/forms/form-renderer";
import type { FormDefinition } from "@/features/forms/form";

const subscribeToPreview = () => () => {};
export function CandidatePreview({
  form,
}: {
  form: {
    name: string;
    description: string;
    definition: FormDefinition;
  } | null;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [mobile, setMobile] = useState(false);
  const ready = useSyncExternalStore(
    subscribeToPreview,
    () => true,
    () => false,
  );
  return (
    <div className="space-y-5">
      <p role="status" className="rounded-lg border bg-primary/5 p-4 text-sm">
        HR preview · Sample answers stay in this browser. No account,
        submission, invitation, or paid AI request is created.
      </p>
      <ol className="grid gap-4 sm:grid-cols-3">
        {[
          [
            "Activate account",
            "The Telegram invitation opens a private activation link. The candidate sets their own password.",
          ],
          [
            "Complete forms",
            "My forms lists assigned forms and any corrections requested by HR. Each form opens on mobile or desktop.",
          ],
          [
            "Submission saved",
            "The candidate receives confirmation, returns to My forms, and waits for HR review.",
          ],
        ].map(([title, description], i) => (
          <li className="rounded-xl border bg-card p-4" key={title}>
            <h2 className="font-semibold">
              {i + 1}. {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </li>
        ))}
      </ol>
      {form && (
        <div role="group" aria-label="Preview device" className="flex gap-2">
          <Button
            variant={mobile ? "outline" : "secondary"}
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            Desktop
          </Button>
          <Button
            variant={mobile ? "secondary" : "outline"}
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            Mobile
          </Button>
        </div>
      )}
      {form ? (
        <section
          className={`mx-auto w-full rounded-xl border bg-card p-5 sm:p-8 ${mobile ? "max-w-[360px]" : "max-w-3xl"}`}
          aria-label="Published candidate form preview"
        >
          <h2 className="text-xl font-semibold">{form.name}</h2>
          <p className="my-4 whitespace-pre-wrap text-sm text-muted-foreground">
            {form.description}
          </p>
          {submitted ? (
            <div role="status" className="space-y-4">
              <h3 className="font-semibold">
                Preview complete. This is where the candidate sees their
                receipt.
              </h3>
              <p className="text-sm text-muted-foreground">
                In the live form, answers are saved and HR reviews them. A PDF
                processing problem does not require resubmission.
              </p>
              <Button variant="outline" onClick={() => setSubmitted(false)}>
                Try the form again
              </Button>
            </div>
          ) : ready ? (
            <FormRenderer
              definition={form.definition}
              preview
              compact={mobile}
              onSubmit={async () => setSubmitted(true)}
              submitLabel="Test submission"
            />
          ) : (
            <p role="status">Preparing preview…</p>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">Publish a form to try it here</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You can also preview unfinished questions directly in the builder.
          </p>
          <Button asChild className="mt-4">
            <Link href="/forms">Open form templates</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
