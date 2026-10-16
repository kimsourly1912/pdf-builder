"use client";
import { useState } from "react";
import { useUnsavedChanges } from "@/features/resumes/use-unsaved-changes";
import Link from "next/link";
import { ArrowUp, ArrowDown, Plus, Copy } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "@/features/workflows/client";
import {
  ACTIVITY_TYPES,
  COLORS,
  REQUIREMENTS,
  initialDefinition,
  definitionSchema,
  type Pipeline,
  type PipelineDefinition,
  type HiringStage,
  type HiringJob,
} from "./hiring";
import { useHiringConfiguration, type HiringConfiguration } from "./client";

export function PipelineSettings({ displayName }: { displayName: string }) {
  const {
    config,
    setConfig,
    error: loadError,
    reload,
  } = useHiringConfiguration();
  const [selected, setSelected] = useState<Pipeline | null>(null),
    [name, setName] = useState(""),
    [draft, setDraft] = useState<PipelineDefinition>(initialDefinition),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [publishing, setPublishing] = useState(false);
  const dirty =
    !!selected &&
    (name !== selected.name ||
      JSON.stringify(draft) !== JSON.stringify(selected.draft));
  useUnsavedChanges(dirty);
  function select(p: Pipeline) {
    setSelected(p);
    setName(p.name);
    setDraft(structuredClone(p.draft));
    setError("");
    setNotice("");
  }
  async function create(copy = false) {
    setBusy(true);
    setError("");
    try {
      const { id } = await workflowApi<{ id: string }>(
        "/api/hiring/pipelines",
        {
          method: "POST",
          body: JSON.stringify({
            name: copy ? `${name} copy`.slice(0, 120) : "New hiring pipeline",
            definition: copy ? draft : initialDefinition(),
          }),
        },
      );
      const updated = await reload();
      if (updated) select(updated.pipelines.find((p) => p.id === id)!);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(action: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const updated = await workflowApi<HiringConfiguration>(
        `/api/hiring/pipelines/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            expectedRevision: selected.revision,
            name,
            definition: draft,
          }),
        },
      );
      setConfig(updated);
      select(updated.pipelines.find((p) => p.id === selected.id)!);
      setPublishing(false);
      setNotice(
        action === "publish"
          ? "Pipeline published. Existing applications keep their previous version. Select this version for new jobs when ready."
          : action === "default"
            ? "Default inbox enabled for future incoming candidates."
            : "Pipeline saved.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function patchStage(index: number, patch: Partial<HiringStage>) {
    setDraft({
      ...draft,
      stages: draft.stages.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });
  }
  function reorder(index: number, delta: number) {
    const stages = [...draft.stages];
    [stages[index], stages[index + delta]] = [
      stages[index + delta],
      stages[index],
    ];
    setDraft({ ...draft, stages });
  }
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Hiring pipelines"
        description="Create hiring models for your jobs. Publish stages, choose requirements, and connect stage automation."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/hiring">Open hiring board</Link>
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              <Plus />
              New pipeline
            </Button>
          </>
        }
      />
      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || loadError}{" "}
            <Button variant="link" onClick={() => void reload()}>
              Reload configuration
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!config ? (
        <p role="status">Loading pipelines…</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <h2 className="font-semibold">Your hiring models</h2>
              {!config.pipelines.length && (
                <p className="text-sm text-muted-foreground">
                  Create your first pipeline to begin.
                </p>
              )}
              {config.pipelines.map((p) => (
                <Button
                  key={p.id}
                  variant={selected?.id === p.id ? "secondary" : "outline"}
                  className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                  onClick={() => {
                    if (dirty) {
                      setError(
                        "Save your draft before opening another pipeline.",
                      );
                      return;
                    }
                    select(p);
                  }}
                >
                  {p.name}
                  {p.isDefault && <Badge variant="secondary">Inbox</Badge>}
                  {p.archived && " · Archived"}
                </Button>
              ))}
            </aside>
            {selected ? (
              <section className="min-w-0 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="pipeline-name">Pipeline name</Label>
                  <Input
                    id="pipeline-name"
                    value={name}
                    maxLength={120}
                    disabled={busy || selected.archived}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pipeline-preparation-mode">
                    Preparation automation for new applications
                  </Label>
                  <SelectField
                    id="pipeline-preparation-mode"
                    value={draft.preparationMode ?? "legacy"}
                    disabled={busy || selected.archived}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        preparationMode: value as "legacy" | "application",
                      })
                    }
                  >
                    <SelectFieldOption value="application">
                      Application workflows · independent requirements per job
                    </SelectFieldOption>
                    <SelectFieldOption value="legacy">
                      Legacy CV approval workflows
                    </SelectFieldOption>
                  </SelectField>
                  <p className="text-xs text-muted-foreground">
                    Publishing sets the default for future applications.
                    Application workflows keep HR account/contact review and
                    suppress new legacy CV-approval preparation for their CV.
                    Existing applications retain their preparation choice.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {selected.publishedVersion
                      ? `Published version ${selected.publishedVersion}`
                      : "Draft"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {dirty ? "Unsaved changes" : "Saved"} · Active applications
                    stay on their published version.
                  </span>
                </div>
                <fieldset
                  className="space-y-4"
                  disabled={busy || selected.archived}
                >
                  <legend className="mb-3 font-semibold">Stages</legend>
                  {draft.stages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className="space-y-4 rounded-xl border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-medium">
                          {index + 1}. {stage.name || "Unnamed stage"}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Move ${stage.name} up`}
                            disabled={index === 0}
                            onClick={() => reorder(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Move ${stage.name} down`}
                            disabled={index === draft.stages.length - 1}
                            onClick={() => reorder(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={draft.stages.length === 1}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                stages: draft.stages.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            Remove from draft
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor={`stage-name-${stage.id}`}>
                            Stage name
                          </Label>
                          <Input
                            id={`stage-name-${stage.id}`}
                            maxLength={80}
                            value={stage.name}
                            onChange={(e) =>
                              patchStage(index, { name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`stage-type-${stage.id}`}>
                            Activity
                          </Label>
                          <SelectField
                            id={`stage-type-${stage.id}`}
                            value={stage.activity}
                            onValueChange={(v) =>
                              patchStage(index, {
                                activity: v as HiringStage["activity"],
                              })
                            }
                          >
                            {ACTIVITY_TYPES.map((t) => (
                              <SelectFieldOption key={t} value={t}>
                                {t.replaceAll("_", " ")}
                              </SelectFieldOption>
                            ))}
                          </SelectField>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`stage-color-${stage.id}`}>
                            Color
                          </Label>
                          <SelectField
                            id={`stage-color-${stage.id}`}
                            value={stage.color}
                            onValueChange={(v) =>
                              patchStage(index, {
                                color: v as HiringStage["color"],
                              })
                            }
                          >
                            {COLORS.map((c) => (
                              <SelectFieldOption key={c} value={c}>
                                {c}
                              </SelectFieldOption>
                            ))}
                          </SelectField>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`stage-description-${stage.id}`}>
                          Description
                        </Label>
                        <Textarea
                          id={`stage-description-${stage.id}`}
                          maxLength={500}
                          value={stage.description}
                          onChange={(e) =>
                            patchStage(index, { description: e.target.value })
                          }
                        />
                      </div>
                      {stage.activity === "interview" && (
                        <div className="space-y-2">
                          <Label htmlFor={`interview-scope-${stage.id}`}>
                            Interview completion requirement
                          </Label>
                          <SelectField
                            id={`interview-scope-${stage.id}`}
                            value={stage.interviewScope ?? "process"}
                            onValueChange={(value) =>
                              patchStage(index, {
                                interviewScope: value as "process" | "stage",
                              })
                            }
                          >
                            <SelectFieldOption value="process">
                              All rounds in the application process
                            </SelectFieldOption>
                            <SelectFieldOption value="stage">
                              Only rounds mapped to this stage
                            </SelectFieldOption>
                          </SelectField>
                          <p className="text-xs text-muted-foreground">
                            Add the interview-completed requirement to entry or
                            exit. Stage-specific completion requires a mapped
                            completed round and every required submitted
                            scorecard.
                          </p>
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">
                          Requirements ·{" "}
                          {stage.entry.length + stage.exit.length}
                        </summary>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          {(["entry", "exit"] as const).map((side) => (
                            <fieldset key={side} className="space-y-3">
                              <legend className="mb-3 text-sm font-medium">
                                {side === "entry"
                                  ? "Before entering"
                                  : "Before leaving"}
                              </legend>
                              {Object.entries(REQUIREMENTS).map(
                                ([key, label]) => (
                                  <div
                                    key={key}
                                    className="flex items-start gap-2"
                                  >
                                    <Checkbox
                                      id={`${stage.id}-${side}-${key}`}
                                      checked={stage[side].includes(
                                        key as keyof typeof REQUIREMENTS,
                                      )}
                                      onCheckedChange={(checked) =>
                                        patchStage(index, {
                                          [side]:
                                            checked === true
                                              ? [...stage[side], key]
                                              : stage[side].filter(
                                                  (r) => r !== key,
                                                ),
                                        })
                                      }
                                    />
                                    <Label
                                      htmlFor={`${stage.id}-${side}-${key}`}
                                      className="text-sm font-normal leading-5"
                                    >
                                      {label}
                                    </Label>
                                  </div>
                                ),
                              )}
                            </fieldset>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    disabled={draft.stages.length >= 30}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        stages: [
                          ...draft.stages,
                          {
                            id: crypto.randomUUID(),
                            name: "New stage",
                            description: "",
                            activity: "custom",
                            color: "neutral",
                            entry: [],
                            exit: [],
                          },
                        ],
                      })
                    }
                  >
                    <Plus />
                    Add stage
                  </Button>
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || selected.archived || !dirty}
                    onClick={() => void save("save")}
                  >
                    Save draft
                  </Button>
                  <Button
                    disabled={busy || selected.archived}
                    onClick={() => {
                      const result = definitionSchema.safeParse(draft);
                      if (!result.success) {
                        setError(result.error.issues[0].message);
                        return;
                      }
                      setPublishing(true);
                    }}
                  >
                    Review & publish
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void create(true)}
                  >
                    <Copy />
                    Duplicate as draft
                  </Button>
                  {!selected.isDefault && !selected.archived && (
                    <Button
                      variant="outline"
                      disabled={busy || !selected.publishedVersion || dirty}
                      onClick={() => void save("default")}
                    >
                      Use as default inbox
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={busy || selected.isDefault || dirty}
                    onClick={() =>
                      void save(selected.archived ? "restore" : "archive")
                    }
                  >
                    {selected.archived ? "Restore" : "Archive pipeline"}
                  </Button>
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
                Choose a hiring model to edit its stages. The default inbox
                receives new candidates whose job has not been assigned.
              </div>
            )}
          </div>
          <section className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Job openings</h2>
            <p className="text-sm text-muted-foreground">
              Each job uses a published pipeline version. Updating the job
              affects new applications; existing applications keep their
              version.
            </p>
            {config.jobs.map((job) => (
              <JobEditor
                key={`${job.id}-${job.revision}`}
                job={job}
                config={config}
                reload={reload}
              />
            ))}
            <JobEditor key="new-job" config={config} reload={reload} />
          </section>
        </>
      )}
      <Dialog open={publishing} onOpenChange={setPublishing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish {name}</DialogTitle>
            <DialogDescription>
              This makes {draft.stages.length} stages available for new
              applications and workflow selectors. Existing applications and
              automation keep their published version. Reordering stages does
              not move candidates.
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-60 list-decimal space-y-2 overflow-y-auto pl-5">
            {draft.stages.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPublishing(false)}
            >
              Keep editing
            </Button>
            <Button disabled={busy} onClick={() => void save("publish")}>
              {busy ? "Publishing…" : "Publish pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function JobEditor({
  job,
  config,
  reload,
}: {
  job?: HiringJob;
  config: HiringConfiguration;
  reload: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(job?.title ?? ""),
    [versionId, setVersionId] = useState(job?.pipelineVersionId ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(archived = job?.archived ?? false) {
    setBusy(true);
    setError("");
    try {
      await workflowApi("/api/hiring/jobs", {
        method: "POST",
        body: JSON.stringify({
          id: job?.id,
          expectedRevision: job?.revision,
          title,
          pipelineVersionId: versionId,
          archived,
        }),
      });
      if (!job) {
        setTitle("");
        setVersionId("");
      }
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor={`job-title-${job?.id ?? "new"}`}>
            {job ? "Job title" : "New job title"}
            {job?.archived ? " · Archived" : ""}
          </Label>
          <Input
            id={`job-title-${job?.id ?? "new"}`}
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`job-pipeline-${job?.id ?? "new"}`}>
            Published pipeline
          </Label>
          <SelectField
            id={`job-pipeline-${job?.id ?? "new"}`}
            value={versionId}
            onValueChange={setVersionId}
            placeholder="Choose pipeline version"
          >
            {config.versions
              .filter((v) => !v.archived || v.id === versionId)
              .map((v) => (
                <SelectFieldOption key={v.id} value={v.id}>
                  {v.name} · v{v.version}
                </SelectFieldOption>
              ))}
          </SelectField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !title.trim() || !versionId}
            variant={job ? "outline" : "default"}
            onClick={() => void save()}
          >
            {job ? "Save job" : "Create job"}
          </Button>
          {job && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void save(!job.archived)}
            >
              {job.archived ? "Reopen job" : "Close job"}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
