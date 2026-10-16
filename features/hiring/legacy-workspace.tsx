"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { legacyDefinition } from "./hiring";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "@/features/workflows/client";
type Item = {
  proposedStage: string | null;
  id: string;
  name: string;
  email: string;
  resume_id: string | null;
  interview_id: string | null;
  interview_outcome: string | null;
  manual_stage: string | null;
  application_id: string | null;
  application_count: number;
  expectedRevision: string | null;
  canAdopt: boolean;
  archived: boolean;
};
type Inventory = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
};
export function LegacyWorkspace({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Inventory | null>(null),
    [search, setSearch] = useState(""),
    [mapped, setMapped] = useState(false),
    [page, setPage] = useState(1),
    [preview, setPreview] = useState<Item | null>(null),
    [stageId, setStageId] = useState(""),
    [mappingReason, setMappingReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      setData(
        await workflowApi<Inventory>(
          `/api/hiring/legacy?${new URLSearchParams({ search, mapped: String(mapped), page: String(page) })}`,
        ),
      );
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [search, mapped, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  async function adopt() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi("/api/hiring/legacy", {
        method: "POST",
        body: JSON.stringify({
          candidateId: preview.id,
          expectedRevision: preview.expectedRevision,
          confirmAdoption: confirmed,
        }),
      });
      setPreview(null);
      setNotice(
        "Legacy application linked. Its original evidence and history remain retained; no workflow or invitation was started.",
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Legacy hiring records"
        description="Review preparation and interviews recorded before the unified hiring workspace, including archived and incomplete records."
        actions={
          <Button variant="outline" asChild>
            <Link href="/hiring">Back to hiring pipeline</Link>
          </Button>
        }
      />
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="legacy-search">Search legacy candidates</Label>
          <Input
            id="legacy-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-mapped"
            checked={mapped}
            onCheckedChange={(v) => {
              setMapped(v === true);
              setPage(1);
            }}
          />
          <Label htmlFor="include-mapped">
            Include records already linked to applications
          </Label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {!data ? (
          <p role="status">Loading legacy records…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.total} matching records
            </p>
            {data.items.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-xl border bg-card p-5"
              >
                <h2 className="font-semibold">{item.name}</h2>
                <p className="text-sm">
                  {item.email} ·{" "}
                  {item.archived
                    ? "Archived CV"
                    : item.resume_id
                      ? "CV retained"
                      : "Missing CV context"}{" "}
                  ·{" "}
                  {item.interview_outcome ??
                    item.manual_stage ??
                    "Original evidence retained"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.application_count} existing applications. Adoption
                  preserves original outcomes and known stage timing; unresolved
                  context remains available through the original records.
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.application_id ? (
                    <Button asChild>
                      <Link href={`/hiring/${item.application_id}`}>
                        Open application
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={!item.canAdopt}
                      onClick={() => {
                        setPreview(item);
                        setConfirmed(false);
                        setStageId("");
                        setMappingReason("");
                      }}
                    >
                      Preview adoption
                    </Button>
                  )}
                  <Button variant="outline" asChild>
                    <Link href={`/candidates/${item.id}?legacy=1`}>
                      Original candidate records
                    </Link>
                  </Button>
                  {item.interview_id && (
                    <Button variant="outline" asChild>
                      <Link href={`/interviews/${item.interview_id}?legacy=1`}>
                        Original interview history
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!data.items.length && (
              <p className="py-6 text-sm text-muted-foreground">
                No legacy records match this view. Include linked records to
                find adopted or archived history.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">Page {data.page}</span>
              <Button
                variant="outline"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adopt original hiring records</DialogTitle>
            <DialogDescription>
              Review this candidate&apos;s original CV, preparation and
              interview records before continuing in Hiring pipeline.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <p className="text-sm">
                {preview.name} ·{" "}
                {preview.archived
                  ? "Archived CV context retained"
                  : "Selected original CV"}{" "}
                · {preview.interview_outcome ?? "No hiring outcome inferred"}
              </p>
              <p className="text-sm">
                {preview.application_count > 0
                  ? "A separate legacy application will preserve this earlier process alongside existing job applications."
                  : "This creates a legacy application with the original record references."}{" "}
                It sends no messages and starts no automation.
              </p>
              {preview.archived && !preview.proposedStage && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="legacy-stage-mapping">
                      Map original evidence to stage
                    </Label>
                    <SelectField
                      id="legacy-stage-mapping"
                      value={stageId}
                      onValueChange={setStageId}
                      placeholder="Choose the reviewed legacy stage"
                    >
                      {legacyDefinition().stages.map((s) => (
                        <SelectFieldOption key={s.id} value={s.id}>
                          {s.name}
                        </SelectFieldOption>
                      ))}
                    </SelectField>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legacy-stage-reason">Mapping reason</Label>
                    <Input
                      id="legacy-stage-reason"
                      value={mappingReason}
                      onChange={(e) => setMappingReason(e.target.value)}
                      maxLength={1000}
                    />
                  </div>
                </>
              )}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm-legacy-adoption"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                />
                <Label htmlFor="confirm-legacy-adoption">
                  I reviewed the original records and want to retain them as a
                  legacy application.
                </Label>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !confirmed ||
                (!!preview?.archived &&
                  !preview.proposedStage &&
                  (!stageId || mappingReason.trim().length < 10))
              }
              onClick={() => void adopt()}
            >
              Adopt legacy records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
