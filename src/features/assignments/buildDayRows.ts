/**
 * The calendar day list, flattened into rows.
 *
 * Extracted from CalendarScreen: it is the most branch-heavy logic in the app —
 * loading and error and empty states, hour-slot grouping, and Show Overdue's
 * collapsible per-day groups for the past week — and every branch decides what
 * a user sees on the screen they open the app to.
 *
 * The hour grouping and the group-label helpers come along because nothing else
 * uses them. Dates arrive pre-formatted (`todayISO`, `yesterdayISO`) so this
 * stays free of the screen's date helpers and a test can just pass strings.
 */
import type { TaskInstanceView } from '../../shared/api/canplanTypes';
import { occurrenceKey } from './occurrenceCompletion';
import type { StatusKey } from './occurrenceStatus';

export type DayRow =
  | { kind: 'loading'; key: string }
  | { kind: 'message'; key: string; message: string }
  | { kind: 'header'; key: string; hour: number }
  | {
      kind: 'dayheader';
      key: string;
      dayISO: string;
      label: string;
      /** "started/total" for the group, QQ-roster style. */
      count: string;
      expanded: boolean;
    }
  | { kind: 'task'; key: string; view: TaskInstanceView };

/** "2026-07-13" → "Sunday" (past-week group labels; unique within 7 days). */
const weekdayName = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
};

/** "2026-07-13" → "Jul 13" (the date suffix on group labels). */
const monthDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Group a day's occurrences into hour slots (20:00 → the "20:00 - 21:00"
 * header), ascending, so times read as ranges under prominent headers.
 */
function groupByHour(views: readonly TaskInstanceView[]): Array<[number, TaskInstanceView[]]> {
  const byHour = new Map<number, TaskInstanceView[]>();
  for (const view of views) {
    const hour = Number(view.scheduledTime.split(':')[0]) || 0;
    const list = byHour.get(hour);
    if (list) {
      list.push(view);
    } else {
      byHour.set(hour, [view]);
    }
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]);
}

export function buildDayRows({
  views,
  pastOverdueViews,
  activeStatus,
  isLoading,
  isError,
  yesterdayISO,
  groupToggles,
  startedInstanceIds,
}: {
  /** This day's occurrences, already filtered to `activeStatus`. */
  views: readonly TaskInstanceView[];
  /** The past week's unresolved occurrences (today's page, Show Overdue only). */
  pastOverdueViews: readonly TaskInstanceView[];
  activeStatus: StatusKey;
  isLoading: boolean;
  isError: boolean;
  yesterdayISO: string;
  /** Explicit expand/collapse taps, by day. Absent means "use the default". */
  groupToggles: ReadonlyMap<string, boolean>;
  /** Occurrences started this session but not yet reflected in the feed. */
  startedInstanceIds: ReadonlyMap<string, string>;
}): DayRow[] {
  // Show Overdue mode appends the past week's unresolved occurrences as
  // collapsible per-day groups, most recent day first (today's own hour-slot
  // groups stay on top, ungrouped).
  const pastRows: DayRow[] = [];
  if (activeStatus === 'overdue' && pastOverdueViews.length > 0) {
    const byDate = new Map<string, TaskInstanceView[]>();
    for (const view of pastOverdueViews) {
      const list = byDate.get(view.scheduledDate);
      if (list) {
        list.push(view);
      } else {
        byDate.set(view.scheduledDate, [view]);
      }
    }
    const sortedDays = [...byDate.keys()].sort().reverse();
    // Today's overdue already sits expanded above, so a default-open group is
    // only offered when today has none: the newest non-empty past day.
    const defaultExpandedDay = views.length > 0 ? null : sortedDays[0] ?? null;
    for (const dayISO of sortedDays) {
      const dayViews = byDate.get(dayISO)!;
      dayViews.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
      const startedCount = dayViews.filter(
        (view) =>
          !view.isVirtual ||
          startedInstanceIds.has(
            occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
          ),
      ).length;
      const expanded = groupToggles.get(dayISO) ?? dayISO === defaultExpandedDay;
      pastRows.push({
        kind: 'dayheader',
        key: `day-${dayISO}`,
        dayISO,
        label: `${dayISO === yesterdayISO ? 'Yesterday' : weekdayName(dayISO)} · ${monthDay(dayISO)}`,
        count: `${startedCount}/${dayViews.length}`,
        expanded,
      });
      if (expanded) {
        for (const view of dayViews) {
          pastRows.push({
            kind: 'task',
            key: `${view.assignmentId}-${view.scheduledFor}`,
            view,
          });
        }
      }
    }
  }

  if (isLoading) return [{ kind: 'loading', key: 'loading' }];
  if (isError) {
    return [{ kind: 'message', key: 'error', message: 'Could not load this day’s tasks.' }];
  }
  if (views.length === 0 && pastRows.length === 0) {
    return [{ kind: 'message', key: 'empty', message: 'Nothing here for this day.' }];
  }

  const nextRows: DayRow[] = [];
  for (const [hour, groupViews] of groupByHour(views)) {
    nextRows.push({ kind: 'header', key: `header-${hour}`, hour });
    for (const view of groupViews) {
      nextRows.push({
        kind: 'task',
        key: `${view.assignmentId}-${view.scheduledFor}`,
        view,
      });
    }
  }
  nextRows.push(...pastRows);
  return nextRows;
}
