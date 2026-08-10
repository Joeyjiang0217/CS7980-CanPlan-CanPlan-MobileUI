import type { TaskInstanceStep, TaskStep } from '../../shared/api/canplanTypes';
import { resolveOccurrenceSteps } from './occurrenceSteps';

function templateStep(overrides: Partial<TaskStep> & Pick<TaskStep, 'stepId' | 'order'>): TaskStep {
  return {
    taskId: 'task-1',
    text: `template ${overrides.stepId}`,
    description: null,
    mediaAssets: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function snapshotStep(
  overrides: Partial<TaskInstanceStep> & Pick<TaskInstanceStep, 'stepId' | 'order'>,
): TaskInstanceStep {
  return {
    instanceId: 'instance-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    text: `snapshot ${overrides.stepId}`,
    completed: false,
    activeDurationSeconds: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const IMAGE = {
  assetId: 'asset-1',
  taskId: 'task-1',
  s3Key: 'tasks/task-1/asset-1.jpg',
  type: 'IMAGE' as const,
  mimeType: 'image/jpeg',
  ownerId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('resolveOccurrenceSteps', () => {
  describe('before an occurrence is started', () => {
    it('reads the template, ordered', () => {
      const steps = resolveOccurrenceSteps({
        templateSteps: [templateStep({ stepId: 'b', order: 2 }), templateStep({ stepId: 'a', order: 1 })],
        instanceSteps: [],
        materialized: false,
      });
      expect(steps.map((step) => step.stepId)).toEqual(['a', 'b']);
    });

    it('ignores snapshot rows entirely', () => {
      // A template view of a task that happens to have instances elsewhere must
      // still show the template.
      const steps = resolveOccurrenceSteps({
        templateSteps: [templateStep({ stepId: 'a', order: 1, text: 'current' })],
        instanceSteps: [snapshotStep({ stepId: 'a', order: 1, text: 'frozen' })],
        materialized: false,
      });
      expect(steps[0].text).toBe('current');
    });
  });

  describe('once an occurrence is started', () => {
    it('freezes text and order against later template edits', () => {
      const steps = resolveOccurrenceSteps({
        templateSteps: [
          templateStep({ stepId: 'a', order: 2, text: 'edited later' }),
          templateStep({ stepId: 'b', order: 1, text: 'edited later too' }),
        ],
        instanceSteps: [
          snapshotStep({ stepId: 'a', order: 1, text: 'as started' }),
          snapshotStep({ stepId: 'b', order: 2, text: 'as started too' }),
        ],
        materialized: true,
      });
      expect(steps.map((step) => [step.stepId, step.text])).toEqual([
        ['a', 'as started'],
        ['b', 'as started too'],
      ]);
    });

    it('omits a step added to the template afterwards', () => {
      // Otherwise a finished occurrence shows an unchecked step it never had.
      const steps = resolveOccurrenceSteps({
        templateSteps: [templateStep({ stepId: 'a', order: 1 }), templateStep({ stepId: 'new', order: 2 })],
        instanceSteps: [snapshotStep({ stepId: 'a', order: 1 })],
        materialized: true,
      });
      expect(steps.map((step) => step.stepId)).toEqual(['a']);
    });

    it('keeps a step deleted from the template, text only', () => {
      // deleteTaskStep leaves instance rows alone and purges the media, so the
      // step survives in the record without its photo rather than vanishing.
      const steps = resolveOccurrenceSteps({
        templateSteps: [],
        instanceSteps: [snapshotStep({ stepId: 'gone', order: 1, text: 'still happened' })],
        materialized: true,
      });
      expect(steps).toHaveLength(1);
      expect(steps[0].text).toBe('still happened');
      expect(steps[0].mediaAssets).toEqual([]);
      expect(steps[0].description).toBeNull();
    });

    it('joins media and description back from the template by stepId', () => {
      // Neither is in the snapshot, so they stay live by necessity.
      const steps = resolveOccurrenceSteps({
        templateSteps: [
          templateStep({ stepId: 'a', order: 1, description: 'live desc', mediaAssets: [IMAGE] }),
        ],
        instanceSteps: [snapshotStep({ stepId: 'a', order: 1, text: 'frozen' })],
        materialized: true,
      });
      expect(steps[0].text).toBe('frozen');
      expect(steps[0].description).toBe('live desc');
      expect(steps[0].mediaAssets).toEqual([IMAGE]);
    });

    it('sorts by the snapshot order, not the order rows arrive in', () => {
      const steps = resolveOccurrenceSteps({
        templateSteps: [],
        instanceSteps: [
          snapshotStep({ stepId: 'third', order: 3 }),
          snapshotStep({ stepId: 'first', order: 1 }),
          snapshotStep({ stepId: 'second', order: 2 }),
        ],
        materialized: true,
      });
      expect(steps.map((step) => step.stepId)).toEqual(['first', 'second', 'third']);
    });

    it('falls back to the template while the snapshot is still loading', () => {
      // An empty snapshot means "not fetched yet", not "an occurrence with no
      // steps" — showing nothing would flash an empty task.
      const steps = resolveOccurrenceSteps({
        templateSteps: [templateStep({ stepId: 'a', order: 1 })],
        instanceSteps: [],
        materialized: true,
      });
      expect(steps.map((step) => step.stepId)).toEqual(['a']);
    });
  });
});
