/**
 * Which steps one occurrence shows.
 *
 * A materialized instance carries its own step rows, written once when it was
 * started (`startTaskInstance` snapshots them and never revisits them). Those
 * rows — not the live template — are what the occurrence *is*: starting a task
 * pins the version being worked from, so editing the template afterwards can't
 * rewrite work already under way or a record of work already done. The backend
 * holds the same line, refusing COMPLETED until every *instance* step is checked
 * off. Occurrences with no instance yet read the template, and are pinned the
 * moment they are started.
 *
 * Reading the template instead is what let a deleted step strand an occurrence
 * that could no longer be completed, and let a step added later show up inside
 * an already-finished one, unchecked.
 *
 * Freezing live work has costs, and they are the caller's to accept — see
 * docs/step-snapshots.md for the three (corrections never reaching started
 * occurrences, mixed old text with new media, unskipped work resuming on the old
 * version) and for what backend changes would remove them.
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
 * than dropping the step and quietly shortening the list.
 */
import type { TaskInstanceStep, TaskStep } from '../../shared/api/canplanTypes';

const byOrder = (first: TaskStep, second: TaskStep) => first.order - second.order;

export function resolveOccurrenceSteps({
  templateSteps,
  instanceSteps,
  materialized,
}: {
  templateSteps: readonly TaskStep[];
  instanceSteps: readonly TaskInstanceStep[];
  /** False for a template view, or an occurrence that hasn't been started yet. */
  materialized: boolean;
}): TaskStep[] {
  if (!materialized || instanceSteps.length === 0) {
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
