/**
 * In-memory, UI-only occurrence status overrides.
 *
 * When the user completes/skips/un-skips an occurrence, the new status is
 * mirrored here so the calendar reflects it instantly, before the invalidated
 * feed refetches. Step-level completion lives on the backend
 * (TaskInstanceStep via setTaskInstanceStepCompletion).
 */
import { useSyncExternalStore } from 'react';

import type { TaskInstanceStatus } from '../../shared/api/canplanTypes';

/** A user-applied status for a whole occurrence (UI-only). */
export type OccurrenceStatus = Extract<
  TaskInstanceStatus,
  'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'SKIPPED'
>;

let statusSnapshot: ReadonlyMap<string, OccurrenceStatus> = new Map();
let resolvedAtSnapshot: ReadonlyMap<string, string> = new Map();
let instanceIdSnapshot: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable key for one occurrence. */
export function occurrenceKey(
  assignmentId: string,
  scheduledDate: string,
  scheduledTime: string,
): string {
  return `${assignmentId}#${scheduledDate}#${scheduledTime}`;
}

export function setOccurrenceStatus(
  key: string,
  status: OccurrenceStatus,
  resolvedAt?: string,
) {
  const next = new Map(statusSnapshot);
  next.set(key, status);
  statusSnapshot = next;
  const nextResolvedAt = new Map(resolvedAtSnapshot);
  if (status === 'COMPLETED' || status === 'SKIPPED') {
    nextResolvedAt.set(key, resolvedAt ?? new Date().toISOString());
  } else {
    nextResolvedAt.delete(key);
  }
  resolvedAtSnapshot = nextResolvedAt;
  emit();
}

/** Drop a status override (e.g. after un-skipping) so the server status shows through. */
export function clearOccurrenceStatus(key: string) {
  if (!statusSnapshot.has(key)) {
    return;
  }
  const next = new Map(statusSnapshot);
  next.delete(key);
  statusSnapshot = next;
  const nextResolvedAt = new Map(resolvedAtSnapshot);
  nextResolvedAt.delete(key);
  resolvedAtSnapshot = nextResolvedAt;
  emit();
}

/**
 * Record the instanceId a start (materialize) call returned, so taps that land
 * before the invalidated feed refetch still open the materialized view instead
 * of the stale virtual one. An occurrence's instanceId never changes, so
 * entries are write-once and never cleared.
 */
export function setOccurrenceInstanceId(key: string, instanceId: string) {
  if (instanceIdSnapshot.get(key) === instanceId) {
    return;
  }
  const next = new Map(instanceIdSnapshot);
  next.set(key, instanceId);
  instanceIdSnapshot = next;
  emit();
}

/** Subscribe to instanceIds recorded by materializations this session. */
export function useOccurrenceInstanceIds(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => instanceIdSnapshot,
    () => instanceIdSnapshot,
  );
}

/** Subscribe to the whole map of occurrence status overrides. */
export function useOccurrenceStatuses(): ReadonlyMap<string, OccurrenceStatus> {
  return useSyncExternalStore(
    subscribe,
    () => statusSnapshot,
    () => statusSnapshot,
  );
}

/** Subscribe to UI-local completion/skip timestamps keyed by occurrence. */
export function useOccurrenceResolvedAt(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => resolvedAtSnapshot,
    () => resolvedAtSnapshot,
  );
}
