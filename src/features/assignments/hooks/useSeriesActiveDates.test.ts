import type { TaskInstanceStatus } from '../../../shared/api/canplanTypes';
import { occurrenceState } from './useSeriesActiveDates';

/**
 * This decides both what the calendar looks like and what may be deleted:
 * `settled` allows removing that one occurrence, `active` allows "this one" or
 * "this and all future", `gray` allows nothing. Getting it wrong either hides a
 * delete the user needs or offers one that removes work they meant to keep.
 */
const TODAY = '2026-08-10';

describe('occurrenceState', () => {
  describe('once an occurrence has left TO_DO', () => {
    it.each<TaskInstanceStatus>(['COMPLETED', 'SKIPPED', 'OVERDUE', 'CANCELLED', 'IN_PROGRESS'])(
      'is a settled record (%s)',
      (status) => {
        // Note IN_PROGRESS counts as settled here: the series frontier only
        // tracks untouched TO_DO days, so a started day is already a record.
        expect(
          occurrenceState({
            scheduledDate: TODAY,
            status,
            activeDate: TODAY,
            todayISO: TODAY,
          }),
        ).toBe('settled');
      },
    );

    it('is settled regardless of where it sits relative to the frontier', () => {
      expect(
        occurrenceState({
          scheduledDate: '2026-08-20',
          status: 'COMPLETED',
          activeDate: TODAY,
          todayISO: TODAY,
        }),
      ).toBe('settled');
    });
  });

  describe('with the series frontier resolved', () => {
    const activeDate = '2026-08-12';

    it('marks the frontier day itself active', () => {
      expect(
        occurrenceState({ scheduledDate: activeDate, status: 'TO_DO', activeDate, todayISO: TODAY }),
      ).toBe('active');
    });

    it('greys out projected days after the frontier', () => {
      expect(
        occurrenceState({
          scheduledDate: '2026-08-13',
          status: 'TO_DO',
          activeDate,
          todayISO: TODAY,
        }),
      ).toBe('gray');
    });

    it('treats a stray TO_DO before the frontier as settled', () => {
      // Defensive: the frontier is the earliest untouched TO_DO, so an earlier
      // one shouldn't exist. If it does, it gets the narrow delete, not the
      // series-wide one.
      expect(
        occurrenceState({
          scheduledDate: '2026-08-11',
          status: 'TO_DO',
          activeDate,
          todayISO: TODAY,
        }),
      ).toBe('settled');
    });

    it('uses the frontier, not today, when the two differ', () => {
      // A frontier past today (today already handled): today's own projection is
      // behind the frontier and must not read as the live one.
      expect(
        occurrenceState({ scheduledDate: TODAY, status: 'TO_DO', activeDate, todayISO: TODAY }),
      ).toBe('settled');
    });
  });

  describe('before the frontier resolves', () => {
    // Loading, or a series whose next TO_DO is beyond the look-ahead window.
    it('treats today as the live one', () => {
      expect(
        occurrenceState({
          scheduledDate: TODAY,
          status: 'TO_DO',
          activeDate: undefined,
          todayISO: TODAY,
        }),
      ).toBe('active');
    });

    it('greys out later days', () => {
      expect(
        occurrenceState({
          scheduledDate: '2026-08-11',
          status: 'TO_DO',
          activeDate: undefined,
          todayISO: TODAY,
        }),
      ).toBe('gray');
    });

    it('settles earlier days', () => {
      expect(
        occurrenceState({
          scheduledDate: '2026-08-09',
          status: 'TO_DO',
          activeDate: undefined,
          todayISO: TODAY,
        }),
      ).toBe('settled');
    });
  });
});
