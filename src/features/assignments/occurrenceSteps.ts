/**
 * Which steps a *completed* occurrence shows.
 *
 * A materialized instance carries its own step rows, written once when it was
 * started (`startTaskInstance` snapshots them and never revisits them). For a
 * finished occurrence those rows are the record of what was actually done, so
 * they — not the live template — are what a COMPLETED occurrence renders. Edit
 * the template afterwards and history stays as it happened.
 *
 * Deliberately limited to COMPLETED. It is the only terminal state: SKIPPED can
 * be undone back to IN_PROGRESS, and freezing a state the user can walk out of
 * would either swap the steps under them mid-task or leave them working from
 * instructions that have since been corrected. Occurrences still in play, and
 * ones with no instance yet, keep reading the template.
 *
 * This also settles a smaller wrong: a step added to the template after an
 * occurrence finished used to appear inside it, unchecked — a completed task
 * with an outstanding step.
 *
 * The snapshot is partial, by the backend's own choice when writing it:
 *
 *     // Step snapshots copy text/order only (NOT media — a live Task
 *     // MediaAsset can be deleted).
 *
 * and `deleteTaskStep` does delete the S3 objects, so media cannot be frozen by
 * anyone. Media and description are joined back from the template by stepId,
 * best effort: a step the template still has keeps its photo and audio; a step
 * the template has since dropped shows its frozen text alone, which is better
 * than dropping the step and quietly shortening the record.
 */
import type { TaskInstanceStep, TaskStep } from '../../shared/api/canplanTypes';

const byOrder = (first: TaskStep, second: TaskStep) => first.order - second.order;

export function resolveOccurrenceSteps({
  templateSteps,
  instanceSteps,
  completed,
}: {
  templateSteps: readonly TaskStep[];
  instanceSteps: readonly TaskInstanceStep[];
  /** True only for a COMPLETED occurrence — see the note above on why. */
  completed: boolean;
}): TaskStep[] {
  if (!completed || instanceSteps.length === 0) {
    return [...templateSteps].sort(byOrder);
  }

  const templateById = new Map(templateSteps.map((step) => [step.stepId, step]));
  return instanceSteps
    .map((snapshot) => {
      const template = templateById.get(snapshot.stepId);
      return {
        stepId: snapshot.stepId,
        taskId: snapshot.taskId,
        // Frozen at snapshot time; the template's current values are ignored.
        order: snapshot.order,
        text: snapshot.text,
        // Unfrozen by necessity — neither is in the snapshot.
        description: template?.description ?? null,
        mediaAssets: template?.mediaAssets ?? [],
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      } satisfies TaskStep;
    })
    .sort(byOrder);
}
