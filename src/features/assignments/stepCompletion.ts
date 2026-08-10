/**
 * Step check-off state for one occurrence: what the server says, what the user
 * has just tapped, and how the two are reconciled.
 *
 * Extracted from TaskViewScreen because the reconciliation is easy to get subtly
 * wrong and impossible to see from the outside — an override dropped too early
 * makes a tap flicker back, one dropped too late makes a step ignore the server.
 */
import type { TaskInstanceStep } from '../../shared/api/canplanTypes';

/** The step ids the instance snapshot records as complete. */
export function completedStepIds(instanceSteps: readonly TaskInstanceStep[]): Set<string> {
  const set = new Set<string>();
  for (const step of instanceSteps) {
    if (step.completed) {
      set.add(step.stepId);
    }
  }
  return set;
}

/**
 * Server state with the optimistic overlay applied, so a tap shows immediately
 * while its write is in flight. An override of `false` removes a step the server
 * still calls complete — undo has to win locally too.
 */
export function mergeStepOverrides(
  serverCompleted: ReadonlySet<string>,
  overrides: ReadonlyMap<string, boolean>,
): Set<string> {
  const set = new Set(serverCompleted);
  overrides.forEach((completed, stepId) => {
    if (completed) {
      set.add(stepId);
    } else {
      set.delete(stepId);
    }
  });
  return set;
}

/**
 * Drop the overrides the server has caught up with, keeping the ones still in
 * flight.
 *
 * Returns the *same map* when nothing settled. This is load-bearing, not a micro
 * optimization: the caller stores it in state, so a fresh map on every server
 * refetch would re-render the whole step list several times a minute.
 */
export function pruneSettledOverrides(
  overrides: ReadonlyMap<string, boolean>,
  serverCompleted: ReadonlySet<string>,
): ReadonlyMap<string, boolean> {
  if (overrides.size === 0) {
    return overrides;
  }
  const next = new Map(overrides);
  let changed = false;
  overrides.forEach((completed, stepId) => {
    if (serverCompleted.has(stepId) === completed) {
      next.delete(stepId);
      changed = true;
    }
  });
  return changed ? next : overrides;
}
