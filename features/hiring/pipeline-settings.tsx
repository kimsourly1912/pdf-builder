"use client";
import { DeleteButton } from "@/features/archive/delete-button";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUnsavedChanges } from "@/features/resumes/use-unsaved-changes";
import Link from "next/link";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Copy,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  MoreHorizontal,
} from "lucide-react";
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
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
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

const activityLabels: Record<HiringStage["activity"], string> = {
  inbox: "Inbox",
  cv_review: "CV review",
  forms: "Forms",
  interview: "Interview",
  offer: "Offer",
  custom: "Custom",
};
const colorClasses: Record<HiringStage["color"], string> = {
  neutral: "bg-slate-400",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
};

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
    [publishing, setPublishing] = useState(false),
    [activeTab, setActiveTab] = useState("pipelines"),
    [expandedStages, setExpandedStages] = useState<string[]>([]);
  const dirty =
    !!selected &&
    (name !== selected.name ||
      JSON.stringify(draft) !== JSON.stringify(selected.draft));
  useUnsavedChanges(dirty);
  function select(p: Pipeline) {
    if (selected?.id !== p.id)
      setExpandedStages(p.draft.stages.slice(0, 1).map((stage) => stage.id));
    setSelected(p);
    setName(p.name);
    setDraft(structuredClone(p.draft));
    setError("");
    setNotice("");
  }
  async function create(copy = false) {
    if (dirty && !copy) {
      setError("Save your draft before creating another pipeline.");
      setActiveTab("pipelines");
      return;
    }
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
      if (updated) {
        select(updated.pipelines.find((p) => p.id === id)!);
        setActiveTab("pipelines");
      }
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
          ? "Pipeline updated. Jobs, applications and automation now use its published stages and requirements."
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
    setNotice("");
    setError("");
    setDraft({
      ...draft,
      stages: draft.stages.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });
  }
  function reorder(index: number, delta: number) {
    setNotice("");
    setError("");
    const stages = [...draft.stages];
    [stages[index], stages[index + delta]] = [
      stages[index + delta],
      stages[index],
    ];
    setDraft({ ...draft, stages });
  }
  function addStage() {
    setNotice("");
    setError("");
    const stage: HiringStage = {
      id: crypto.randomUUID(),
      name: "New stage",
      description: "",
      activity: "custom",
      color: "neutral",
      entry: [],
      exit: [],
    };
    setDraft({ ...draft, stages: [...draft.stages, stage] });
    setExpandedStages([stage.id]);
    requestAnimationFrame(() => {
      document.getElementById(`stage-name-${stage.id}`)?.focus();
    });
  }
  const allExpanded = draft.stages.every((stage) =>
    expandedStages.includes(stage.id),
  );
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Hiring pipelines"
        description="Build and update the hiring stages used by your applications."
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
      {(loadError || (error && (!selected || activeTab !== "pipelines"))) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || loadError}{" "}
            <Button variant="link" onClick={() => void reload()}>
              Reload configuration
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && !selected && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!config ? (
        <p role="status">Loading pipelines…</p>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="min-w-0 gap-6"
        >
          <TabsList
            variant="line"
            aria-label="Hiring configuration"
            className="w-full justify-start border-b"
          >
            <TabsTrigger value="pipelines" className="flex-none">
              Pipelines
            </TabsTrigger>
            <TabsTrigger value="jobs" className="flex-none">
              Job openings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pipelines">
            <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="min-w-0 rounded-xl border bg-card p-3 lg:sticky lg:top-20">
                <h2 className="px-2 pb-3 pt-1 text-sm font-semibold">
                  Your pipelines
                </h2>
                {!config.pipelines.length && (
                  <p className="text-sm text-muted-foreground">
                    Create your first pipeline to begin.
                  </p>
                )}
                <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[calc(100dvh-15rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                  {config.pipelines.map((p) => (
                    <Button
                      key={p.id}
                      variant={selected?.id === p.id ? "secondary" : "outline"}
                      className="h-auto w-52 shrink-0 justify-start whitespace-normal px-3 py-3 text-left lg:w-full lg:min-w-0"
                      aria-pressed={selected?.id === p.id}
                      disabled={busy}
                      onClick={() => {
                        if (selected?.id === p.id) return;
                        if (dirty) {
                          setError(
                            "Save your draft before opening another pipeline.",
                          );
                          return;
                        }
                        select(p);
                      }}
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block break-words [overflow-wrap:anywhere]">
                          {p.name}
                        </span>
                        {(p.isDefault || p.archived) && (
                          <span className="flex flex-wrap gap-1">
                            {p.isDefault && (
                              <Badge variant="secondary">Default inbox</Badge>
                            )}
                            {p.archived && (
                              <Badge variant="outline">Archived</Badge>
                            )}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </aside>
              {selected ? (
                <section
                  className="min-w-0 space-y-4"
                  aria-label="Pipeline editor"
                >
                  <div className="shrink-0 space-y-4 rounded-xl border bg-card p-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pipeline-name">Pipeline name</Label>
                        <Input
                          id="pipeline-name"
                          value={name}
                          maxLength={120}
                          disabled={busy || selected.archived}
                          onChange={(e) => {
                            setNotice("");
                            setError("");
                            setName(e.target.value);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pipeline-preparation-mode">
                          Preparation automation
                        </Label>
                        <SelectField
                          className="w-full"
                          id="pipeline-preparation-mode"
                          value={draft.preparationMode ?? "legacy"}
                          disabled={busy || selected.archived}
                          onValueChange={(value) => {
                            setNotice("");
                            setError("");
                            setDraft({
                              ...draft,
                              preparationMode: value as
                                | "legacy"
                                | "application",
                            });
                          }}
                        >
                          <SelectFieldOption value="application">
                            Application workflows
                          </SelectFieldOption>
                          <SelectFieldOption value="legacy">
                            Legacy CV approval workflows
                          </SelectFieldOption>
                        </SelectField>
                        <p className="text-xs text-muted-foreground">
                          Applies to future applications after publishing.
                        </p>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                            How preparation works
                          </summary>
                          <p className="mt-2 leading-relaxed">
                            Application workflows have independent requirements
                            per job. They retain HR account/contact review and
                            prevent new legacy CV-approval preparation for the
                            same CV. Existing applications keep their
                            preparation choice.
                          </p>
                        </details>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Badge variant="outline">
                        {selected.currentVersionId
                          ? "Published"
                          : "Draft"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {dirty ? "Unsaved changes" : "Saved"} · Active
                        applications use the published stages and requirements.
                      </span>
                    </div>
                  </div>
                  <section
                    className="space-y-3 rounded-xl border bg-card p-3 sm:p-4"
                    aria-labelledby="pipeline-stages-heading"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <h2
                        id="pipeline-stages-heading"
                        className="flex items-center gap-2 font-semibold"
                      >
                        Stages{" "}
                        <Badge variant="secondary">{draft.stages.length}</Badge>
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-controls="pipeline-stage-list"
                          onClick={() =>
                            setExpandedStages(
                              allExpanded
                                ? []
                                : draft.stages.map((stage) => stage.id),
                            )
                          }
                        >
                          {allExpanded ? (
                            <ChevronsDownUp />
                          ) : (
                            <ChevronsUpDown />
                          )}
                          {allExpanded ? "Collapse all" : "Expand all"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            selected.archived ||
                            draft.stages.length >= 30
                          }
                          onClick={addStage}
                        >
                          <Plus /> Add stage
                        </Button>
                      </div>
                    </div>
                    {draft.stages.length >= 30 && (
                      <p className="text-xs text-muted-foreground">
                        Maximum of 30 stages reached.
                      </p>
                    )}
                    {selected.archived && (
                      <p className="text-sm text-muted-foreground">
                        This pipeline is archived. Restore it from More actions
                        to edit its stages.
                      </p>
                    )}
                    <div id="pipeline-stage-list" className="space-y-2">
                      {draft.stages.map((stage, index) => (
                        <Collapsible
                          key={stage.id}
                          open={expandedStages.includes(stage.id)}
                          onOpenChange={(open) =>
                            setExpandedStages((current) =>
                              open
                                ? [...current, stage.id]
                                : current.filter((id) => id !== stage.id),
                            )
                          }
                          className="min-w-0 rounded-lg border data-[state=open]:border-primary/50"
                        >
                          <div
                            className="flex flex-wrap items-center gap-2 rounded-t-lg p-2 data-[open=true]:bg-primary/5"
                            data-open={expandedStages.includes(stage.id)}
                          >
                            <h3 className="min-w-0 flex-1 basis-full sm:basis-0">
                              <CollapsibleTrigger asChild>
                                <button
                                  id={`stage-toggle-${stage.id}`}
                                  type="button"
                                  className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-md p-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring"
                                  aria-label={`${expandedStages.includes(stage.id) ? "Collapse" : "Expand"} stage ${index + 1}: ${stage.name || "Unnamed stage"}`}
                                >
                                  {expandedStages.includes(stage.id) ? (
                                    <ChevronDown className="size-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="size-4 shrink-0" />
                                  )}
                                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 break-words font-medium [overflow-wrap:anywhere]">
                                    {stage.name || "Unnamed stage"}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="gap-1.5"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`size-2 rounded-full ${colorClasses[stage.color]}`}
                                    />
                                    {activityLabels[stage.activity]}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {stage.entry.length + stage.exit.length}{" "}
                                    requirements
                                  </span>
                                </button>
                              </CollapsibleTrigger>
                            </h3>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={`Move ${stage.name} up`}
                                disabled={
                                  busy || selected.archived || index === 0
                                }
                                onClick={() => reorder(index, -1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={`Move ${stage.name} down`}
                                disabled={
                                  busy ||
                                  selected.archived ||
                                  index === draft.stages.length - 1
                                }
                                onClick={() => reorder(index, 1)}
                              >
                                <ArrowDown />
                              </Button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Actions for ${stage.name || "Unnamed stage"}`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-64 space-y-2 p-3"
                                  aria-label="Stage actions"
                                >
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start text-destructive hover:text-destructive"
                                    disabled={
                                      busy ||
                                      selected.archived ||
                                      draft.stages.length === 1 ||
                                      selected.usedStageIds?.includes(stage.id)
                                    }
                                    onClick={() => {
                                      setNotice("");
                                      setError("");
                                      setDraft({
                                        ...draft,
                                        stages: draft.stages.filter(
                                          (_, i) => i !== index,
                                        ),
                                      });
                                      setExpandedStages((current) =>
                                        current.filter((id) => id !== stage.id),
                                      );
                                      requestAnimationFrame(() =>
                                        document
                                          .getElementById(
                                            `stage-toggle-${draft.stages[index === 0 ? 1 : index - 1].id}`,
                                          )
                                          ?.focus(),
                                      );
                                    }}
                                  >
                                    Remove from draft
                                  </Button>
                                  <p className="text-xs text-muted-foreground">
                                    {draft.stages.length === 1
                                      ? "Keep at least one stage in the pipeline."
                                      : selected.usedStageIds?.includes(stage.id)
                                        ? "This stage is used by applications, interviews or automation. Update those references before removing it."
                                      : "Removes this stage from the draft. Stages used by applications or automation must be kept."}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                          <CollapsibleContent>
                            <fieldset
                              className="min-w-0 space-y-4 border-t p-3 sm:p-4"
                              disabled={busy || selected.archived}
                            >
                              <legend className="sr-only">
                                Edit {stage.name || "Unnamed stage"}
                              </legend>
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
                                      patchStage(index, {
                                        name: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`stage-type-${stage.id}`}>
                                    Activity
                                  </Label>
                                  <SelectField
                                    className="w-full"
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
                                        {activityLabels[t]}
                                      </SelectFieldOption>
                                    ))}
                                  </SelectField>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`stage-color-${stage.id}`}>
                                    Color
                                  </Label>
                                  <SelectField
                                    className="w-full"
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
                                        <span className="flex items-center gap-2">
                                          <span
                                            aria-hidden="true"
                                            className={`size-3 shrink-0 rounded-full ${colorClasses[c]}`}
                                          />
                                          {c.charAt(0).toUpperCase() +
                                            c.slice(1)}
                                        </span>
                                      </SelectFieldOption>
                                    ))}
                                  </SelectField>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label
                                  htmlFor={`stage-description-${stage.id}`}
                                >
                                  Description (optional)
                                </Label>
                                <Textarea
                                  rows={2}
                                  className="min-h-16"
                                  id={`stage-description-${stage.id}`}
                                  maxLength={500}
                                  value={stage.description}
                                  onChange={(e) =>
                                    patchStage(index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              {stage.activity === "interview" && (
                                <div className="space-y-2">
                                  <Label
                                    htmlFor={`interview-scope-${stage.id}`}
                                  >
                                    Interview completion requirement
                                  </Label>
                                  <SelectField
                                    className="w-full"
                                    id={`interview-scope-${stage.id}`}
                                    value={stage.interviewScope ?? "process"}
                                    onValueChange={(value) =>
                                      patchStage(index, {
                                        interviewScope: value as
                                          | "process"
                                          | "stage",
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
                                    Add the interview-completed requirement to
                                    entry or exit. Stage-specific completion
                                    requires a mapped completed round and every
                                    required submitted scorecard.
                                  </p>
                                </div>
                              )}
                              <details open>
                                <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                                  Requirements ·{" "}
                                  {stage.entry.length + stage.exit.length}
                                </summary>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                  {(["entry", "exit"] as const).map((side) => (
                                    <fieldset
                                      key={side}
                                      className="min-w-0 space-y-3 rounded-lg border p-3"
                                    >
                                      <legend className="mb-3 text-sm font-medium">
                                        {side === "entry"
                                          ? "Before entering"
                                          : "Before leaving"}
                                        {" · "}
                                        {stage[side].length}
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
                            </fieldset>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </section>
                  <PipelineActionBar>
                    {notice && (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        {notice}
                      </p>
                    )}
                    {error && (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p
                        role="status"
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-full ${dirty ? "bg-amber-500" : "bg-green-500"}`}
                        />
                        {busy
                          ? "Working…"
                          : selected.archived
                            ? "Archived pipeline"
                            : dirty
                              ? "Unsaved changes"
                              : "All changes saved"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline">
                              More actions <ChevronDown />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3"
                            aria-label="More pipeline actions"
                          >
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              disabled={busy}
                              onClick={() => void create(true)}
                            >
                              <Copy />
                              Duplicate as draft
                            </Button>
                            {!selected.isDefault && !selected.archived && (
                              <Button
                                variant="ghost"
                                className="w-full justify-start"
                                disabled={
                                  busy || !selected.currentVersionId || dirty
                                }
                                onClick={() => void save("default")}
                              >
                                Use as default inbox
                              </Button>
                            )}
                            {!selected.isDefault &&
                              !selected.archived &&
                              (!selected.currentVersionId || dirty) && (
                                <p className="text-xs text-muted-foreground">
                                  Save and publish this pipeline before using it
                                  as the default inbox.
                                </p>
                              )}
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              disabled={busy || selected.isDefault || dirty}
                              onClick={() =>
                                void save(
                                  selected.archived ? "restore" : "archive",
                                )
                              }
                            >
                              {selected.archived
                                ? "Restore"
                                : "Archive pipeline"}
                            </Button>
                            {selected.isDefault && (
                              <p className="text-xs text-muted-foreground">
                                Choose another default inbox before archiving
                                this pipeline.
                              </p>
                            )}
                            {dirty && (
                              <p className="text-xs text-muted-foreground">
                                Save your changes before archiving or deleting.
                              </p>
                            )}
                            <div className="border-t pt-2">
                              <DeleteButton
                                type="hiring_pipeline"
                                id={selected.id}
                                label={selected.name}
                                disabled={busy || dirty}
                                onDeleted={() => {
                                  setSelected(null);
                                  void reload();
                                }}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
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
                            if (!name.trim()) {
                              setError(
                                "Enter a pipeline name before publishing.",
                              );
                              document.getElementById("pipeline-name")?.focus();
                              return;
                            }
                            if (!result.success) {
                              const issue = result.error.issues[0];
                              const index =
                                issue.path[0] === "stages" &&
                                typeof issue.path[1] === "number"
                                  ? issue.path[1]
                                  : undefined;
                              const stage =
                                index === undefined
                                  ? undefined
                                  : draft.stages[index];
                              setError(
                                stage
                                  ? `${stage.name || `Stage ${index! + 1}`}: ${issue.message}`
                                  : issue.message,
                              );
                              if (stage) {
                                setExpandedStages((current) => [
                                  ...new Set([...current, stage.id]),
                                ]);
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById(`stage-name-${stage.id}`)
                                    ?.focus(),
                                );
                              }
                              return;
                            }
                            setError("");
                            setPublishing(true);
                          }}
                        >
                          Review & publish
                        </Button>
                      </div>
                    </div>
                  </PipelineActionBar>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
                  Choose a hiring model to edit its stages. The default inbox
                  receives new candidates whose job has not been assigned.
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="jobs"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Job openings</h2>
              <p className="text-sm text-muted-foreground">
                Each job uses one published pipeline. Publishing changes updates
                its stages and requirements for existing and future applications.
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
          </TabsContent>
        </Tabs>
      )}
      <Dialog open={publishing} onOpenChange={setPublishing}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publish {name}</DialogTitle>
            <DialogDescription>
              This updates the pipeline’s {draft.stages.length} stages and
              requirements for its jobs, applications and automation. Candidates
              remain in their current stages. The preparation automation choice
              applies to new applications.
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
          <DialogFooter className="gap-2">
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
// AppShell clips overflow, so viewport-pinned actions cannot use CSS sticky here.
// Measure the editor width to keep the bar aligned as the sidebar and viewport change.
function PipelineActionBar({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{
    left: number;
    width: number;
    visible: boolean;
  } | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const editor = anchor.current?.parentElement;
    const actions = bar.current;
    if (!editor || !actions) return;
    function measure() {
      const rect = editor!.getBoundingClientRect();
      const visible =
        rect.top < window.innerHeight - actions!.offsetHeight &&
        rect.bottom > 0;
      setBounds((current) =>
        current?.left === rect.left &&
        current.width === rect.width &&
        current.visible === visible
          ? current
          : { left: rect.left, width: rect.width, visible },
      );
      setHeight(actions!.offsetHeight + 24);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(editor);
    observer.observe(actions);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);
  return (
    <div ref={anchor} style={bounds ? { height } : undefined}>
      <div
        ref={bar}
        aria-label="Pipeline actions"
        className="z-20 space-y-2 rounded-xl border bg-background p-3 shadow-md"
        style={
          bounds
            ? {
                position: "fixed",
                left: bounds.left,
                width: bounds.width,
                bottom: "max(1rem, env(safe-area-inset-bottom))",
                visibility: bounds.visible ? "visible" : "hidden",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
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
            className="w-full"
            id={`job-pipeline-${job?.id ?? "new"}`}
            value={versionId}
            onValueChange={setVersionId}
            placeholder="Choose pipeline"
          >
            {config.versions
              .filter((v) => !v.archived || v.id === versionId)
              .map((v) => (
                <SelectFieldOption key={v.id} value={v.id}>
                  {v.name}
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
