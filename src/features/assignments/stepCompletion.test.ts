import type { TaskInstanceStep } from '../../shared/api/canplanTypes';
import { completedStepIds, mergeStepOverrides, pruneSettledOverrides } from './stepCompletion';

function snapshotStep(stepId: string, completed: boolean): TaskInstanceStep {
  return {
    instanceId: 'instance-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stepId,
    order: 1,
    text: stepId,
    completed,
    activeDurationSeconds: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('completedStepIds', () => {
  it('collects only the completed ids', () => {
    const set = completedStepIds([
      snapshotStep('a', true),
      snapshotStep('b', false),
      snapshotStep('c', true),
    ]);
    expect([...set].sort()).toEqual(['a', 'c']);
  });

  it('is empty for an unstarted or unloaded snapshot', () => {
    expect(completedStepIds([]).size).toBe(0);
  });
});

describe('mergeStepOverrides', () => {
  it('adds a step the user just checked', () => {
    const merged = mergeStepOverrides(new Set(['a']), new Map([['b', true]]));
    expect([...merged].sort()).toEqual(['a', 'b']);
  });

  it('removes a step the user just undid, even while the server still has it', () => {
    // Undo has to win locally or the checkmark springs back mid-write.
    const merged = mergeStepOverrides(new Set(['a', 'b']), new Map([['a', false]]));
    expect([...merged]).toEqual(['b']);
  });

  it('leaves the server set alone when there are no overrides', () => {
    const merged = mergeStepOverrides(new Set(['a', 'b']), new Map());
    expect([...merged].sort()).toEqual(['a', 'b']);
  });

  it('does not mutate the server set', () => {
    const server = new Set(['a']);
    mergeStepOverrides(server, new Map([['b', true], ['a', false]]));
    expect([...server]).toEqual(['a']);
  });

  it('tolerates an override for a step the server has never seen', () => {
    // A step checked off the instant it was materialized.
    const merged = mergeStepOverrides(new Set(), new Map([['fresh', true]]));
    expect([...merged]).toEqual(['fresh']);
  });
});

describe('pruneSettledOverrides', () => {
  it('drops an override the server has caught up with', () => {
    const pruned = pruneSettledOverrides(new Map([['a', true]]), new Set(['a']));
    expect(pruned.size).toBe(0);
  });

  it('drops a settled undo too', () => {
    // override false + server no longer has it = agreed.
    const pruned = pruneSettledOverrides(new Map([['a', false]]), new Set());
    expect(pruned.size).toBe(0);
  });

  it('keeps an override whose write is still in flight', () => {
    const pruned = pruneSettledOverrides(new Map([['a', true]]), new Set());
    expect(pruned.get('a')).toBe(true);
  });

  it('settles only the agreed entries', () => {
    const pruned = pruneSettledOverrides(
      new Map([
        ['settled', true],
        ['inflight', true],
      ]),
      new Set(['settled']),
    );
    expect([...pruned.keys()]).toEqual(['inflight']);
  });

  it('returns the same map when nothing settled', () => {
    // Load-bearing: the caller stores this in state, so a fresh map on every
    // server refetch would re-render the whole step list several times a minute.
    const overrides = new Map([['a', true]]);
    expect(pruneSettledOverrides(overrides, new Set())).toBe(overrides);
  });

  it('returns the same (empty) map when there is nothing to prune', () => {
    const overrides = new Map<string, boolean>();
    expect(pruneSettledOverrides(overrides, new Set(['a']))).toBe(overrides);
  });

  it('does not mutate the map it was given', () => {
    const overrides = new Map([['a', true]]);
    pruneSettledOverrides(overrides, new Set(['a']));
    expect(overrides.get('a')).toBe(true);
  });
});
