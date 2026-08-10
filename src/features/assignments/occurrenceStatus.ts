/**
 * How one occurrence's status is read for display, and which calendar tab it
 * belongs under.
 *
 * Extracted from CalendarScreen so the wall-clock rule can be exercised without
 * a simulator: it is timing-dependent, drives which tab a task appears under,
 * and a mistake here silently files work in the wrong place.
 */
import type { TaskInstanceStatus, TaskInstanceView } from '../../shared/api/canplanTypes';

/** The calendar's four buckets, in tab order. */
export type StatusKey = 'overdue' | 'todo' | 'done' | 'skipped';

/**
 * Live display status. The server derives OVERDUE only at fetch time, and the
 * feed then sits in a 5-minute react-query cache — so an occurrence whose
 * scheduled moment passes while on screen would stay in To Do until the next
 * refetch. Re-derive against the wall clock with the same rule the server
 * (and the calendar's start-mirror) applies: past scheduledFor and unresolved →
 * OVERDUE. Callers re-run off useMinuteTick so the flip happens live.
 */
export function liveStatus(
  view: Pick<TaskInstanceView, 'scheduledFor'>,
  status: TaskInstanceStatus,
): TaskInstanceStatus {
  if (status !== 'TO_DO' && status !== 'IN_PROGRESS') {
    return status;
  }
  const scheduledMs = new Date(view.scheduledFor).getTime();
  return Number.isFinite(scheduledMs) && Date.now() > scheduledMs ? 'OVERDUE' : status;
}

/** Whether a resolved occurrence was finished after its scheduled moment. */
export function isResolvedAfterScheduled(
  view: Pick<TaskInstanceView, 'scheduledFor'>,
  resolvedAt?: string | null,
): boolean {
  if (!resolvedAt) {
    return false;
  }
  const resolvedMs = new Date(resolvedAt).getTime();
  const scheduledMs = new Date(view.scheduledFor).getTime();
  return Number.isFinite(resolvedMs) && Number.isFinite(scheduledMs) && resolvedMs > scheduledMs;
}

/** Which tab a status files under; null for statuses the calendar doesn't show. */
export function bucketOf(status: TaskInstanceStatus): StatusKey | null {
  switch (status) {
    case 'OVERDUE':
      return 'overdue';
    case 'TO_DO':
    case 'IN_PROGRESS':
      return 'todo';
    case 'COMPLETED':
      return 'done';
    case 'SKIPPED':
      return 'skipped';
    default:
      return null;
  }
}
