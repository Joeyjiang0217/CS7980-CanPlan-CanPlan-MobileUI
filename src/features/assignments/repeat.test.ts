import type { TaskAssignment } from '../../shared/api/canplanTypes';
import {
  REPEAT_OPTIONS,
  assignmentFirstDate,
  describeRepeat,
  repeatLabelForRule,
} from './repeat';

type RepeatAssignment = Pick<TaskAssignment, 'scheduleType' | 'scheduleRule'>;
type DateAssignment = Pick<TaskAssignment, 'scheduleType' | 'startDate' | 'scheduledFor'>;

describe('repeatLabelForRule', () => {
  it('labels every rule the schedule editor can write', () => {
    // Round-trip: anything the picker offers must read back, or a series shows
    // as "Repeats" with no idea how often.
    for (const option of REPEAT_OPTIONS) {
      if (option.rule) {
        expect(repeatLabelForRule(option.rule)).toBe(option.label);
      }
    }
  });

  it('is null for an absent rule', () => {
    expect(repeatLabelForRule(undefined)).toBeNull();
    expect(repeatLabelForRule(null)).toBeNull();
    expect(repeatLabelForRule('')).toBeNull();
  });

  it('is null for a rule this app did not write', () => {
    // e.g. authored elsewhere, or a shape the picker has no option for.
    expect(repeatLabelForRule('FREQ=HOURLY;INTERVAL=6')).toBeNull();
    expect(repeatLabelForRule('FREQ=DAILY;INTERVAL=3')).toBeNull();
  });

  it('does not match on a different attribute order', () => {
    // Documents the exact-string comparison: same meaning, no label.
    expect(repeatLabelForRule('INTERVAL=1;FREQ=DAILY')).toBeNull();
  });
});

describe('describeRepeat', () => {
  it('describes a recurring series by its rule', () => {
    const assignment: RepeatAssignment = {
      scheduleType: 'RECURRING',
      scheduleRule: 'FREQ=WEEKLY;INTERVAL=2',
    };
    expect(describeRepeat(assignment)).toBe('Two Weeks');
  });

  it('says a one-time assignment does not repeat', () => {
    expect(describeRepeat({ scheduleType: 'ONE_TIME', scheduleRule: null })).toBe(
      'Does not repeat',
    );
  });

  it('says the same when there is no assignment at all', () => {
    // The calendar renders virtual occurrences whose assignment hasn't loaded.
    expect(describeRepeat(undefined)).toBe('Does not repeat');
  });

  it('falls back to "Repeats" for a recurring series with an unknown rule', () => {
    // Honest about recurring without inventing a frequency.
    expect(
      describeRepeat({ scheduleType: 'RECURRING', scheduleRule: 'FREQ=DAILY;INTERVAL=9' }),
    ).toBe('Repeats');
    expect(describeRepeat({ scheduleType: 'RECURRING', scheduleRule: null })).toBe('Repeats');
  });

  it('ignores a rule left on a one-time assignment', () => {
    expect(
      describeRepeat({ scheduleType: 'ONE_TIME', scheduleRule: 'FREQ=DAILY;INTERVAL=1' }),
    ).toBe('Does not repeat');
  });
});

describe('assignmentFirstDate', () => {
  it('uses startDate for a recurring series', () => {
    const assignment: DateAssignment = {
      scheduleType: 'RECURRING',
      startDate: '2026-08-10',
      scheduledFor: '2026-01-01T09:00:00-07:00',
    };
    expect(assignmentFirstDate(assignment)).toBe('2026-08-10');
  });

  it('takes the calendar day out of scheduledFor for a one-time assignment', () => {
    expect(
      assignmentFirstDate({
        scheduleType: 'ONE_TIME',
        startDate: null,
        scheduledFor: '2026-08-10T09:00:00-07:00',
      }),
    ).toBe('2026-08-10');
  });

  it('is undefined when the relevant field is missing', () => {
    expect(
      assignmentFirstDate({ scheduleType: 'RECURRING', startDate: null, scheduledFor: null }),
    ).toBeUndefined();
    expect(
      assignmentFirstDate({ scheduleType: 'ONE_TIME', startDate: '2026-08-10', scheduledFor: null }),
    ).toBeUndefined();
    expect(assignmentFirstDate(undefined)).toBeUndefined();
  });
});
