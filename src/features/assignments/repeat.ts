/**
 * Recurrence options shared by the schedule editor and the read-only surfaces
 * (calendar card, occurrence detail) so the labels stay in sync.
 *
 * `rule` is the RRULE stored on a RECURRING TaskAssignment; NONE is ONE_TIME.
 */
import type { TaskAssignment } from '../../shared/api/canplanTypes';

export type RepeatValue =
  | 'NONE'
  | 'DAILY'
  | 'WEEKLY'
  | 'TWO_WEEKS'
  | 'FOUR_WEEKS'
  | 'MONTHLY'
  | 'TWO_MONTHS'
  | 'YEARLY'
  | 'WEEKDAYS'
  | 'WEEKENDS';

export const REPEAT_OPTIONS: Array<{ value: RepeatValue; label: string; rule?: string }> = [
  { value: 'NONE', label: 'None' },
  { value: 'DAILY', label: 'Daily', rule: 'FREQ=DAILY;INTERVAL=1' },
  { value: 'WEEKLY', label: 'Weekly', rule: 'FREQ=WEEKLY;INTERVAL=1' },
  { value: 'TWO_WEEKS', label: 'Two Weeks', rule: 'FREQ=WEEKLY;INTERVAL=2' },
  { value: 'FOUR_WEEKS', label: 'Four Weeks', rule: 'FREQ=WEEKLY;INTERVAL=4' },
  { value: 'MONTHLY', label: 'Monthly', rule: 'FREQ=MONTHLY;INTERVAL=1' },
  { value: 'TWO_MONTHS', label: 'Two Months', rule: 'FREQ=MONTHLY;INTERVAL=2' },
  { value: 'YEARLY', label: 'Yearly', rule: 'FREQ=YEARLY;INTERVAL=1' },
  { value: 'WEEKDAYS', label: 'Weekdays', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { value: 'WEEKENDS', label: 'Weekends', rule: 'FREQ=WEEKLY;BYDAY=SA,SU' },
];

/** The create-assignment label for an RRULE string, or null if unknown/absent. */
export function repeatLabelForRule(scheduleRule?: string | null): string | null {
  if (!scheduleRule) {
    return null;
  }
  return REPEAT_OPTIONS.find((option) => option.rule === scheduleRule)?.label ?? null;
}

/**
 * Repeat descriptor for an assignment: 'Daily' / 'Weekly' / … for a recurring
 * series, or 'Does not repeat' for a one-time assignment.
 */
export function describeRepeat(
  assignment: Pick<TaskAssignment, 'scheduleType' | 'scheduleRule'> | undefined,
): string {
  if (!assignment || assignment.scheduleType !== 'RECURRING') {
    return 'Does not repeat';
  }
  return repeatLabelForRule(assignment.scheduleRule) ?? 'Repeats';
}

/** The day a series starts (recurring) or the one-time occurrence's date (YYYY-MM-DD). */
export function assignmentFirstDate(
  assignment: Pick<TaskAssignment, 'scheduleType' | 'startDate' | 'scheduledFor'> | undefined,
): string | undefined {
  if (!assignment) {
    return undefined;
  }
  if (assignment.scheduleType === 'RECURRING') {
    return assignment.startDate ?? undefined;
  }
  return assignment.scheduledFor?.slice(0, 10);
}
