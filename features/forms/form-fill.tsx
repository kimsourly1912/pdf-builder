"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormRenderer } from "./form-renderer";
import type { FormMedia } from "./form-renderer";
import type { TemplateFillPayload } from "@/features/templates/template.types";
import { RecipientFill } from "@/features/templates/recipient-fill";
import { formApi } from "./client";
export function FillRouter(props: { token: string }) {
  const [payload, setPayload] = useState<TemplateFillPayload | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void formApi<TemplateFillPayload>(
      `/api/fill/${encodeURIComponent(props.token)}`,
    )
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.token]);
  if (error)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Open your assigned form</h1>
        <p role="alert">{error}</p>
        <Button asChild>
          <Link
            href={`/sign-in?return_to=${encodeURIComponent(`/fill/${props.token}`)}`}
          >
            Sign in
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/portal">My forms</Link>
        </Button>
      </div>
    );
  if (!payload)
    return (
      <p role="status" className="p-6 text-center">
        Loading form…
      </p>
    );
  return payload.formDefinition ? (
    <FormFill token={props.token} payload={payload} />
  ) : (
    <RecipientFill token={props.token} />
  );
}
function FormFill(props: { token: string; payload: TemplateFillPayload }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [submitted, setSubmitted] = useState(false),
    revision = useRef(props.payload.formDraftRevision ?? ""),
    requestKey = useRef(crypto.randomUUID());
  const definition = props.payload.formDefinition!;
  async function save(
    values: Record<string, unknown>,
    media: FormMedia,
    draft: boolean,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    const body = new FormData();
    body.set("values", JSON.stringify(values));
    body.set("revision", revision.current);
    for (const [id, file] of media) body.set(`image:${id}`, file);
    try {
      if (draft) {
        const result = await formApi<{ revision: string }>(
          `/api/fill/${encodeURIComponent(props.token)}/draft`,
          { method: "PUT", body },
        );
        revision.current = result.revision;
        setNotice("Draft saved. You can return and continue later.");
      } else {
        const result = await formApi<{ submission: { pdfStatus?: string } }>(
          `/api/fill/${encodeURIComponent(props.token)}`,
          {
            method: "POST",
            headers: { "Idempotency-Key": requestKey.current },
            body,
          },
        );
        setSubmitted(true);
        setNotice(
          result.submission.pdfStatus === "failed"
            ? "Your answers were saved. HR can retry the PDF without asking you to submit again."
            : "Your response has been submitted successfully.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The response could not be saved.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-svh bg-muted/20 px-4 py-8 sm:py-12">
      <main className="mx-auto max-w-3xl rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <p className="mb-5 text-sm font-semibold text-primary">PDF Studio</p>
        <h1 className="text-2xl font-semibold">
          {props.payload.template.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {props.payload.template.description ||
            "Please complete this form and check your details before submitting."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Version {props.payload.template.versionNumber} ·{" "}
          {props.payload.identity?.email}
        </p>
        {error && (
          <p
            role="alert"
            className="my-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="my-5 rounded-md border p-3 text-sm">
            {notice}
          </p>
        )}
        {submitted ? (
          <div className="mt-8 space-y-4">
            <h2 className="font-semibold">
              Thank you. Your response is saved.
            </h2>
            <Button asChild>
              <Link href="/portal">Back to my forms</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8">
            {Boolean(Object.keys(props.payload.initialValues ?? {}).length) && (
              <p className="mb-5 rounded-md bg-primary/5 p-3 text-sm">
                Some details are prefilled. Please check them before submitting.
              </p>
            )}
            <FormRenderer
              definition={definition}
              initial={{
                ...props.payload.initialValues,
                ...props.payload.formDraftValues,
              }}
              readonlyInitial={props.payload.initialValues ?? {}}
              suggestions={props.payload.resumePrefill?.values}
              busy={busy}
              imageUrl={(id) =>
                `/api/fill/${encodeURIComponent(props.token)}/images/${id}`
              }
              onDraft={(values, media) =>
                save(values, media, true).catch(() => {})
              }
              onSubmit={(values, media) =>
                save(values, media, false).catch(() => {})
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}
