import type { TaskInstanceStatus } from '../../shared/api/canplanTypes';
import { bucketOf, isResolvedAfterScheduled, liveStatus } from './occurrenceStatus';

const SCHEDULED = '2026-08-10T12:00:00.000Z';

describe('liveStatus', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function atWallClock(iso: string) {
    jest.useFakeTimers().setSystemTime(new Date(iso));
  }

  it('flips an unstarted occurrence to OVERDUE once its moment passes', () => {
    // The point of the function: the feed sits in a 5-minute cache, so without
    // this a task stays in To Do after its time while the screen is open.
    atWallClock('2026-08-10T12:00:01.000Z');
    expect(liveStatus({ scheduledFor: SCHEDULED }, 'TO_DO')).toBe('OVERDUE');
  });

  it('flips a started-but-unfinished occurrence too', () => {
    atWallClock('2026-08-10T13:00:00.000Z');
    expect(liveStatus({ scheduledFor: SCHEDULED }, 'IN_PROGRESS')).toBe('OVERDUE');
  });

  it('leaves an occurrence alone before its moment', () => {
    atWallClock('2026-08-10T11:59:59.000Z');
    expect(liveStatus({ scheduledFor: SCHEDULED }, 'TO_DO')).toBe('TO_DO');
    expect(liveStatus({ scheduledFor: SCHEDULED }, 'IN_PROGRESS')).toBe('IN_PROGRESS');
  });

  it('does not flip exactly at the scheduled instant', () => {
    // Strictly past, matching the server's rule.
    atWallClock(SCHEDULED);
    expect(liveStatus({ scheduledFor: SCHEDULED }, 'TO_DO')).toBe('TO_DO');
  });

  it.each<TaskInstanceStatus>(['COMPLETED', 'SKIPPED', 'OVERDUE', 'CANCELLED'])(
    'never rewrites a resolved status (%s)',
    (status) => {
      atWallClock('2027-01-01T00:00:00.000Z');
      expect(liveStatus({ scheduledFor: SCHEDULED }, status)).toBe(status);
    },
  );

  it('leaves the status as-is when the instant is unparseable', () => {
    // A malformed feed row shouldn't be filed as overdue on a guess.
    atWallClock('2027-01-01T00:00:00.000Z');
    expect(liveStatus({ scheduledFor: 'not a date' }, 'TO_DO')).toBe('TO_DO');
  });
});

describe('isResolvedAfterScheduled', () => {
  it('is true when the work finished after its moment', () => {
    expect(
      isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, '2026-08-10T12:00:01.000Z'),
    ).toBe(true);
  });

  it('is false when it finished before, or exactly at, its moment', () => {
    expect(
      isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, '2026-08-10T11:59:59.000Z'),
    ).toBe(false);
    expect(isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, SCHEDULED)).toBe(false);
  });

  it('is false when nothing resolved it', () => {
    expect(isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, null)).toBe(false);
    expect(isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, undefined)).toBe(false);
  });

  it('is false when either instant is unparseable', () => {
    expect(isResolvedAfterScheduled({ scheduledFor: SCHEDULED }, 'nope')).toBe(false);
    expect(isResolvedAfterScheduled({ scheduledFor: 'nope' }, SCHEDULED)).toBe(false);
  });
});

describe('bucketOf', () => {
  it('files in-progress work under To Do', () => {
    // Both live states share a tab; only the card's controls differ.
    expect(bucketOf('TO_DO')).toBe('todo');
    expect(bucketOf('IN_PROGRESS')).toBe('todo');
  });

  it('maps the remaining shown statuses to their own tabs', () => {
    expect(bucketOf('OVERDUE')).toBe('overdue');
    expect(bucketOf('COMPLETED')).toBe('done');
    expect(bucketOf('SKIPPED')).toBe('skipped');
  });

  it('files cancelled work nowhere', () => {
    // null keeps it out of every tab rather than defaulting into one.
    expect(bucketOf('CANCELLED')).toBeNull();
  });
});
