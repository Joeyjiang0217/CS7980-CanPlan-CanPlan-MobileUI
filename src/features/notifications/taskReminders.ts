/**
 * Rolling-window local reminder scheduler.
 *
 * Recurring assignments only store an RRULE — future occurrences are virtual
 * until the user interacts with them — so nothing on the device knows a
 * concrete "fire at" time by itself. This module asks the calendar feed
 * (getTaskInstanceViews) for the next WINDOW_DAYS of concrete occurrences and
 * mirrors them into OS-scheduled local notifications, staying under iOS's
 * 64-pending-notification cap.
 *
 * The whole schedule is thrown away and rebuilt on every resync (app
 * foreground, preference change, any assignment/instance mutation), which is
 * what lets a preference change apply to ALL future reminders at once and lets
 * completed/skipped occurrences drop their pending reminder.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { TaskInstanceView } from '../../shared/api/canplanTypes';
import { getTaskInstanceViews } from '../assignments/api/assignmentApi';
import {
  getOccurrenceStatusOverrides,
  occurrenceKey,
} from '../assignments/occurrenceCompletion';
import { getNotificationAlertPreference } from './alertPreference';
import { hasNotificationPermission } from './permissions';

/** How far ahead we mirror occurrences into OS notifications. */
const WINDOW_DAYS = 14;
/** Headroom under iOS's hard limit of 64 pending local notifications. */
const MAX_SCHEDULED = 60;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ANDROID_CHANNEL_ID = 'task-reminders';

// Foreground presentation: show the banner even while the app is open, so a
// reminder isn't silently lost when the user happens to be on another screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "4:40 PM" — device-local clock time, matching the notification copy spec. */
function formatClockTime(scheduledFor: string): string {
  return new Date(scheduledFor).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function resolveUserId(): Promise<string | null> {
  try {
    return await getCurrentUserId();
  } catch {
    // Guest mode / signed out — nothing to remind about.
    return null;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function resyncTaskReminders(): Promise<void> {
  const preference = await getNotificationAlertPreference();
  if (preference === 'NONE' || !(await hasNotificationPermission())) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const userId = await resolveUserId();
  if (!userId) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const start = new Date();
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + (WINDOW_DAYS - 1),
  );
  const feed = await getTaskInstanceViews(userId, toISODate(start), toISODate(end));

  const offsetMs = preference === 'FIFTEEN_MINUTES_BEFORE' ? FIFTEEN_MINUTES_MS : 0;
  const overrides = getOccurrenceStatusOverrides();
  const now = Date.now();

  const upcoming = (feed.items ?? [])
    .filter((view: TaskInstanceView) => view.status === 'TO_DO')
    // Session-local complete/skip/start overrides that may be ahead of an
    // eventually-consistent feed read.
    .filter(
      (view) =>
        !overrides.has(occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime)),
    )
    .map((view) => ({
      view,
      fireAt: new Date(view.scheduledFor).getTime() - offsetMs,
    }))
    .filter(({ fireAt }) => Number.isFinite(fireAt) && fireAt > now + 5_000)
    .sort((a, b) => a.fireAt - b.fireAt)
    .slice(0, MAX_SCHEDULED);

  await ensureAndroidChannel();
  // Full rebuild: task reminders are the only notifications this app schedules.
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const { view, fireAt } of upcoming) {
    const clockTime = formatClockTime(view.scheduledFor);
    await Notifications.scheduleNotificationAsync({
      identifier: occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      content: {
        // "Time to start", not "deadline passed" — scheduled time is when the
        // task should begin (it flips to Overdue right after).
        body:
          preference === 'FIFTEEN_MINUTES_BEFORE'
            ? `${view.title} starts at ${clockTime}`
            : `It's time to start ${view.title} (${clockTime})`,
        sound: 'default',
        // Tap target: everything OccurrenceDetail needs (see TaskReminderManager).
        data: {
          assignmentId: view.assignmentId,
          taskId: view.taskId,
          taskTitle: view.title,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
          scheduledFor: view.scheduledFor,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
      },
    });
  }
}

let running = false;
let rerunRequested = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function runResync(): Promise<void> {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    await resyncTaskReminders();
  } catch (error) {
    // Reminders are best-effort; the next resync trigger retries from scratch.
    console.warn('[notifications] task reminder resync failed', error);
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      void runResync();
    }
  }
}

/**
 * Rebuild the scheduled-reminder window soon. Debounced so bursts (e.g. a
 * mutation's onSuccess plus the foreground event) collapse into one rebuild;
 * concurrent requests during a run queue exactly one follow-up run.
 */
export function requestTaskReminderResync(delayMs = 1_000): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runResync();
  }, delayMs);
}
