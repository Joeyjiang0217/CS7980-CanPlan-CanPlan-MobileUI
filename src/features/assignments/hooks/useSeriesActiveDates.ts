import { useMemo } from 'react';

import type { TaskInstanceStatus } from '../../../shared/api/canplanTypes';
import { occurrenceKey, useOccurrenceStatuses } from '../occurrenceCompletion';
import { useTaskInstanceViews } from './useAssignments';

/** How far ahead we look for a series' next active (still-TODO) occurrence. */
const ACTIVE_HORIZON_DAYS = 30;

/**
 * Statuses that keep an occurrence at the series "frontier" (still the live
 * one). Only an untouched TO_DO holds the frontier: starting a task
 * (IN_PROGRESS) releases it, so the next occurrence turns live right away.
 */
const isActiveStatus = (status: TaskInstanceStatus) => status === 'TO_DO';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Where an occurrence sits in its series' lifecycle — the single source of both
 * the calendar visuals and every screen's delete rules:
 *   active  → the one live occurrence (still TODO); delete this or this-and-future.
 *   settled → a started/finished/skipped/overdue/past occurrence.
 *   gray    → a projected day after the active one; inert — no tap, no delete.
 *
 * The frontier advances the moment the current occurrence leaves TODO (started,
 * done, skipped, OR overdue), which is exactly what promotes the next day from
 * gray to live. Note that materialized occurrences carry their own delete rule
 * (never deletable) regardless of this state.
 */
export type OccurrenceLifeState = 'settled' | 'active' | 'gray';

/**
 * For each series, the "active" occurrence date: the earliest occurrence on or
 * after today that is still an untouched TODO. Everything before it has left
 * TODO (started/done/skipped/overdue → settled); everything after it is inert
 * (gray).
 *
 * In-memory completion overrides layer on top of the server status so the
 * frontier advances the instant an occurrence is finished, before the feed
 * refetches.
 */
export function useSeriesActiveDates(userId: string): ReadonlyMap<string, string> {
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const horizonISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + ACTIVE_HORIZON_DAYS);
    return toISODate(d);
  }, []);

  const viewsQuery = useTaskInstanceViews(userId, todayISO, horizonISO);
  const overrides = useOccurrenceStatuses();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const v of viewsQuery.data?.items ?? []) {
      if (v.scheduledDate < todayISO) {
        continue;
      }
      const override = overrides.get(
        occurrenceKey(v.assignmentId, v.scheduledDate, v.scheduledTime),
      );
      const status = override ?? v.status;
      if (!isActiveStatus(status)) {
        continue;
      }
      const current = map.get(v.assignmentId);
      if (!current || v.scheduledDate < current) {
        map.set(v.assignmentId, v.scheduledDate);
      }
    }
    return map;
  }, [viewsQuery.data, overrides, todayISO]);
}

/** Classify one occurrence given its series' resolved active (frontier) date. */
export function occurrenceState(params: {
  scheduledDate: string;
  /** Effective status (with any in-memory completion override already applied). */
  status: TaskInstanceStatus;
  activeDate: string | undefined;
  todayISO: string;
}): OccurrenceLifeState {
  const { scheduledDate, status, activeDate, todayISO } = params;
  // Anything that has left TODO (done/skipped/overdue/cancelled) is a settled
  // record — you can only remove that one occurrence.
  if (!isActiveStatus(status)) {
    return 'settled';
  }
  if (activeDate) {
    if (scheduledDate > activeDate) {
      return 'gray';
    }
    // The frontier itself (or, defensively, a stray earlier TODO) is active.
    return scheduledDate === activeDate ? 'active' : 'settled';
  }
  // Frontier not resolved yet (loading / beyond the look-ahead window): treat
  // today as the live one, later days inert, earlier days settled.
  if (scheduledDate < todayISO) {
    return 'settled';
  }
  return scheduledDate === todayISO ? 'active' : 'gray';
}
