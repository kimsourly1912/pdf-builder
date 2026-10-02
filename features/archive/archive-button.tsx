"use client";
import { archiveNotice } from "./archive-notice";
import { useState } from "react";
import { Archive, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { ArchiveType } from "./archive";
export function ArchiveButton({
  type,
  id,
  label,
  onArchived,
  disabled = false,
}: {
  type: ArchiveType;
  id: string;
  label: string;
  onArchived?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function archive() {
    setBusy(true);
    setError("");
    try {
      const result = await workflowApi<{
        archivedAt: string | null;
        undoable: boolean;
      }>(`/api/archive/${type}/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ action: "archive" }),
      });
      setOpen(false);
      onArchived?.();
      archiveNotice(type, id, label, result, onArchived);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        disabled={disabled}
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Archive ${label}`}
      >
        <Archive /> Archive
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {label}?</DialogTitle>
            <DialogDescription>
              This hides the record from active lists and preserves its history.
              Restore it from Archive.
              {type === "intake" || type === "resume"
                ? " The linked intake and CV are archived together; other CVs for this candidate remain available. Active runs using this CV pause and require a retry after restoration."
                : type === "account"
                  ? " The account will lose sign-in access and its sessions will be revoked. Assigned forms and submissions remain stored."
                  : type === "workflow"
                    ? " New runs stop. Existing runs continue using their saved workflow."
                    : type === "workflow_run"
                      ? " This run stops processing. Restore and retry it explicitly to continue."
                      : type === "template"
                        ? " Existing assigned forms remain available. New assignments and shared links are disabled."
                        : ""}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void archive()}>
              {busy && <LoaderCircle className="animate-spin" />}Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
