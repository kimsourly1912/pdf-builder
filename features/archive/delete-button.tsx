"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "@/features/workflows/client";
import { ARCHIVE_LABELS, type ArchiveType } from "./archive";

type Preview = {
  state: string;
  members: { type: ArchiveType; id: string; label: string; reason: string | null }[];
};

export function DeleteButton({ type, id, label, onDeleted, disabled = false }: {
  type: ArchiveType;
  id: string;
  label: string;
  onDeleted?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const endpoint = `/api/archive/${type}/${encodeURIComponent(id)}`;
  async function review() {
    setOpen(true);
    setPreview(null);
    setError("");
    setConfirmation("");
    setLoading(true);
    try {
      setPreview(await workflowApi<Preview>(`${endpoint}?preview=delete`));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }
  async function remove() {
    if (!preview || confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "delete_permanently", confirm: true, expectedState: preview.state }),
      });
      setOpen(false);
      toast.success(`${label} permanently deleted`);
      onDeleted?.();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const blocked = preview?.members.some((member) => member.reason);
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogTrigger asChild>
      <Button variant="outline" size="sm" disabled={disabled}
        className="text-destructive hover:text-destructive"
        aria-label={`Delete ${label} permanently`} onClick={() => void review()}>
        <Trash2 /> Delete permanently
      </Button>
      </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw_-_2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-words pr-6 [overflow-wrap:anywhere]">Delete {label} permanently?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Eligible records are archived and permanently removed together.
              Choose Archive instead if you may need to restore this item.
              {type === "intake" || type === "resume" ? " The linked intake and resume PDF are deleted together. Other CVs and the candidate profile remain available." : ""}
              {type === "hiring_application" ? " Only this application is removed; the candidate profile and resume remain available." : ""}
              {type === "hiring_pipeline" ? " This also removes its unused published versions." : ""}
            </DialogDescription>
          </DialogHeader>
          {loading && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Checking linked history…</p>}
          {preview && (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Affected records</p>
              <ul className="space-y-2">
                {preview.members.map((member) => (
                  <li key={`${member.type}:${member.id}`} className="break-words [overflow-wrap:anywhere]">
                    <p className="text-xs text-muted-foreground">{ARCHIVE_LABELS[member.type]}</p>
                    {member.label}
                    {member.reason && <p className="text-destructive">{member.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview && !blocked && (
            <div className="space-y-2">
              <Label htmlFor={`delete-confirm-${type}-${id}`}>Type DELETE to confirm</Label>
              <Input id={`delete-confirm-${type}-${id}`} value={confirmation} disabled={busy}
                autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{blocked ? "Keep record" : "Cancel"}</Button>
            <Button variant="destructive" disabled={loading || busy || !preview || blocked || confirmation !== "DELETE"} onClick={() => void remove()}>
              {busy && <LoaderCircle className="animate-spin" />} Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
