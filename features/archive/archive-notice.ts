"use client";
import { toast } from "sonner";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { ArchiveType } from "./archive";
export type ArchiveReceipt = { archivedAt: string | null; undoable: boolean };
export function archiveNotice(
  type: ArchiveType,
  id: string,
  label: string,
  result: ArchiveReceipt,
  onRestored?: () => void,
) {
  toast.success(`${label} archived`, {
    duration: 12000,
    ...(result.undoable && result.archivedAt
      ? {
          action: {
            label: "Undo archive",
            onClick: () => {
              void workflowApi(
                `/api/archive/${type}/${encodeURIComponent(id)}`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    action: "restore",
                    expectedArchivedAt: result.archivedAt,
                  }),
                },
              )
                .then(() => {
                  toast.success(`${label} restored`);
                  onRestored?.();
                })
                .catch((e) => toast.error(errorText(e)));
            },
          },
        }
      : {
          description:
            "Restore it from Archive. Review any access or workflow changes before restoring.",
        }),
  });
}
