import type { CandidateProgress } from "@/features/candidate-progress/progress";
import type { PreparationSnapshot } from "./interviews";
export function preparationChanges(
  snapshot: PreparationSnapshot,
  current: CandidateProgress,
) {
  const changes: string[] = [];
  if (current.selectedCv.id !== snapshot.cv.id)
    changes.push("The selected CV has changed.");
  else if (current.currentCv && current.currentCv.id !== snapshot.cv.id)
    changes.push("A newer CV submission is available.");
  if ((current.run?.id ?? null) !== snapshot.runId)
    changes.push("The selected preparation run has changed.");
  const required = current.forms.filter((f) => f.isRequired !== false);
  if (
    JSON.stringify(
      required.map((f) => [f.id, f.versionNumber ?? null]).sort(),
    ) !==
    JSON.stringify(
      snapshot.forms.map((f) => [f.id, f.versionNumber ?? null]).sort(),
    )
  )
    changes.push("The required forms or their versions have changed.");
  else if (required.some((f) => f.reviewStatus !== "accepted"))
    changes.push("The current preparation has documents awaiting acceptance.");
  if (!current.facts.preparationCurrent)
    changes.push("The current preparation needs review for the selected CV.");
  return changes;
}
