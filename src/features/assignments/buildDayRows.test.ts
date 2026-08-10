import type { TaskInstanceView } from '../../shared/api/canplanTypes';
import { buildDayRows, type DayRow } from './buildDayRows';
import { occurrenceKey } from './occurrenceCompletion';

function view(overrides: Partial<TaskInstanceView> = {}): TaskInstanceView {
  const scheduledDate = overrides.scheduledDate ?? '2026-08-10';
  const scheduledTime = overrides.scheduledTime ?? '09:00';
  return {
    instanceId: null,
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    userId: 'user-1',
    title: 'Task',
    scheduledDate,
    scheduledTime,
    scheduledFor: `${scheduledDate}T${scheduledTime}:00-07:00`,
    timezone: 'America/Los_Angeles',
    status: 'TO_DO',
    isVirtual: true,
    isException: false,
    ...overrides,
  };
}

const NONE = new Map<string, boolean>();
const NO_STARTS = new Map<string, string>();

function build(overrides: Partial<Parameters<typeof buildDayRows>[0]> = {}): DayRow[] {
  return buildDayRows({
    views: [],
    pastOverdueViews: [],
    activeStatus: 'todo',
    isLoading: false,
    isError: false,
    yesterdayISO: '2026-08-09',
    groupToggles: NONE,
    startedInstanceIds: NO_STARTS,
    ...overrides,
  });
}

describe('buildDayRows', () => {
  describe('states', () => {
    it('shows a single loading row, whatever else is available', () => {
      // Loading wins so a half-loaded day never renders as an empty one.
      expect(build({ isLoading: true, views: [view()] })).toEqual([
        { kind: 'loading', key: 'loading' },
      ]);
    });

    it('shows an error row when the feed failed', () => {
      const rows = build({ isError: true, views: [view()] });
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe('message');
    });

    it('prefers loading over error', () => {
      expect(build({ isLoading: true, isError: true })[0].kind).toBe('loading');
    });

    it('shows the empty row when the day and the past week are both empty', () => {
      const rows = build();
      expect(rows).toEqual([
        { kind: 'message', key: 'empty', message: 'Nothing here for this day.' },
      ]);
    });
  });

  describe('hour slots', () => {
    it('puts a header before each hour, ascending', () => {
      const rows = build({
        views: [
          view({ scheduledTime: '20:30', assignmentId: 'late' }),
          view({ scheduledTime: '09:15', assignmentId: 'early' }),
        ],
      });
      expect(rows.map((row) => (row.kind === 'header' ? row.hour : row.kind))).toEqual([
        9,
        'task',
        20,
        'task',
      ]);
    });

    it('groups several occurrences under one header', () => {
      const rows = build({
        views: [
          view({ scheduledTime: '09:05', assignmentId: 'a' }),
          view({ scheduledTime: '09:55', assignmentId: 'b' }),
        ],
      });
      expect(rows.filter((row) => row.kind === 'header')).toHaveLength(1);
      expect(rows.filter((row) => row.kind === 'task')).toHaveLength(2);
    });

    it('files an unparseable time under hour 0 rather than dropping it', () => {
      const rows = build({ views: [view({ scheduledTime: 'oops' })] });
      expect(rows[0]).toMatchObject({ kind: 'header', hour: 0 });
      expect(rows[1].kind).toBe('task');
    });

    it('keys task rows by assignment and instant, so repeats stay distinct', () => {
      const rows = build({
        views: [view({ scheduledTime: '09:00' }), view({ scheduledTime: '10:00' })],
      });
      const keys = rows.filter((row) => row.kind === 'task').map((row) => row.key);
      expect(new Set(keys).size).toBe(2);
    });
  });

  describe('Show Overdue past-week groups', () => {
    const pastOverdueViews = [
      view({ scheduledDate: '2026-08-08', scheduledTime: '10:00', assignmentId: 'older' }),
      view({ scheduledDate: '2026-08-09', scheduledTime: '08:00', assignmentId: 'newer' }),
    ];

    it('is ignored outside the overdue tab', () => {
      const rows = build({ activeStatus: 'todo', pastOverdueViews });
      expect(rows.some((row) => row.kind === 'dayheader')).toBe(false);
    });

    it('lists past days newest first', () => {
      const rows = build({ activeStatus: 'overdue', pastOverdueViews });
      const days = rows.filter((row) => row.kind === 'dayheader').map((row) => row.dayISO);
      expect(days).toEqual(['2026-08-09', '2026-08-08']);
    });

    it('labels the previous day "Yesterday" and the rest by weekday', () => {
      const rows = build({ activeStatus: 'overdue', pastOverdueViews });
      const headers = rows.filter((row) => row.kind === 'dayheader');
      expect(headers[0].label).toBe('Yesterday · Aug 9');
      expect(headers[1].label).toBe('Saturday · Aug 8');
    });

    it('opens the newest group by default when today has nothing', () => {
      const rows = build({ activeStatus: 'overdue', pastOverdueViews });
      const headers = rows.filter((row) => row.kind === 'dayheader');
      expect(headers.map((row) => row.expanded)).toEqual([true, false]);
      // Only the open group contributes task rows.
      expect(rows.filter((row) => row.kind === 'task')).toHaveLength(1);
    });

    it('opens nothing by default when today already has overdue of its own', () => {
      // Today's own list is expanded above, so a second open group would bury it.
      const rows = build({
        activeStatus: 'overdue',
        views: [view()],
        pastOverdueViews,
      });
      const headers = rows.filter((row) => row.kind === 'dayheader');
      expect(headers.every((row) => !row.expanded)).toBe(true);
    });

    it('lets an explicit tap override the default, both ways', () => {
      const collapsedNewest = build({
        activeStatus: 'overdue',
        pastOverdueViews,
        groupToggles: new Map([['2026-08-09', false]]),
      });
      expect(collapsedNewest.filter((row) => row.kind === 'task')).toHaveLength(0);

      const expandedOlder = build({
        activeStatus: 'overdue',
        pastOverdueViews,
        groupToggles: new Map([['2026-08-08', true]]),
      });
      expect(expandedOlder.filter((row) => row.kind === 'task')).toHaveLength(2);
    });

    it('sorts a day group by time of day', () => {
      const rows = build({
        activeStatus: 'overdue',
        pastOverdueViews: [
          view({ scheduledDate: '2026-08-09', scheduledTime: '18:00', assignmentId: 'evening' }),
          view({ scheduledDate: '2026-08-09', scheduledTime: '07:00', assignmentId: 'morning' }),
        ],
      });
      const tasks = rows.filter((row) => row.kind === 'task');
      expect(tasks.map((row) => (row.kind === 'task' ? row.view.assignmentId : null))).toEqual([
        'morning',
        'evening',
      ]);
    });

    it('counts started occurrences, from the feed or from this session', () => {
      const started = view({
        scheduledDate: '2026-08-09',
        scheduledTime: '07:00',
        assignmentId: 'from-feed',
        isVirtual: false,
      });
      const startedThisSession = view({
        scheduledDate: '2026-08-09',
        scheduledTime: '08:00',
        assignmentId: 'from-session',
      });
      const untouched = view({
        scheduledDate: '2026-08-09',
        scheduledTime: '09:00',
        assignmentId: 'untouched',
      });
      const rows = build({
        activeStatus: 'overdue',
        pastOverdueViews: [started, startedThisSession, untouched],
        startedInstanceIds: new Map([
          [
            occurrenceKey(
              startedThisSession.assignmentId,
              startedThisSession.scheduledDate,
              startedThisSession.scheduledTime,
            ),
            'instance-x',
          ],
        ]),
      });
      const header = rows.find((row) => row.kind === 'dayheader');
      expect(header?.kind === 'dayheader' && header.count).toBe('2/3');
    });

    it('keeps past groups below today, and renders despite an empty day', () => {
      const rows = build({ activeStatus: 'overdue', views: [view()], pastOverdueViews });
      const firstDayHeader = rows.findIndex((row) => row.kind === 'dayheader');
      const lastTodayRow = rows.findIndex((row) => row.kind === 'header');
      expect(lastTodayRow).toBeLessThan(firstDayHeader);
      // ...and with no views at all the groups still show instead of "empty".
      expect(
        build({ activeStatus: 'overdue', pastOverdueViews }).some(
          (row) => row.kind === 'message',
        ),
      ).toBe(false);
    });
  });
});
