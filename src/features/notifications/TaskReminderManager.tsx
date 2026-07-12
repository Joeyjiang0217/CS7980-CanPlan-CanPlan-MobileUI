/**
 * Invisible app-level component that keeps the local-reminder window fresh and
 * handles reminder taps. Mounted once inside the NavigationContainer.
 *
 * Tapping a reminder does NOT navigate directly: it opens a "Time to complete
 * the task" prompt (CanPlan 1.0 behavior). "Go to task" pushes Calendar →
 * TaskView so the user lands on the occurrence's step page — its in-page
 * Start button takes it from there; "I'll do it later" just dismisses.
 */
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { navigateIfAvailable, navigationRef } from '../../navigation/navigationRef';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { requestTaskReminderResync } from './taskReminders';

interface ReminderTapTarget {
  taskId: string;
  assignmentId: string;
  taskTitle: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledFor?: string;
}

/**
 * Parse the occurrence payload a reminder was scheduled with (see
 * taskReminders.ts). Null on anything malformed — then the tap simply opens
 * the app with no prompt.
 */
function readReminderTarget(
  data: Record<string, unknown> | undefined,
): ReminderTapTarget | null {
  if (!data) {
    return null;
  }
  const { assignmentId, taskId, taskTitle, scheduledDate, scheduledTime, scheduledFor } =
    data;
  if (
    typeof assignmentId !== 'string' ||
    typeof taskId !== 'string' ||
    typeof taskTitle !== 'string' ||
    typeof scheduledDate !== 'string' ||
    typeof scheduledTime !== 'string'
  ) {
    return null;
  }
  return {
    assignmentId,
    taskId,
    taskTitle,
    scheduledDate,
    scheduledTime,
    scheduledFor: typeof scheduledFor === 'string' ? scheduledFor : undefined,
  };
}

export default function TaskReminderManager() {
  // Covers both a warm tap (app in background, or the foreground banner) and
  // the cold-start tap that launched the app — the hook re-emits per response.
  const lastResponse = Notifications.useLastNotificationResponse();
  const [prompt, setPrompt] = useState<ReminderTapTarget | null>(null);

  useEffect(() => {
    if (!lastResponse) {
      return;
    }
    const target = readReminderTarget(lastResponse.notification.request.content.data);
    if (target) {
      setPrompt(target);
    }
  }, [lastResponse]);

  const openTask = () => {
    const target = prompt;
    setPrompt(null);
    if (!target) {
      return;
    }
    // The reminder was scheduled while the occurrence was still virtual TO_DO;
    // re-derive the overdue flip from the wall clock at tap time.
    const scheduledMs = target.scheduledFor
      ? new Date(target.scheduledFor).getTime()
      : NaN;
    const status =
      Number.isFinite(scheduledMs) && Date.now() > scheduledMs ? 'OVERDUE' : 'TO_DO';
    // On a cold start the container may not be ready the instant the user
    // confirms — retry briefly. navigateIfAvailable additionally no-ops while
    // the Auth stack is up (no Calendar/TaskView routes).
    const tryNavigate = (attemptsLeft: number) => {
      if (navigationRef.isReady()) {
        // Calendar first so "back" from the task's step page lands there.
        navigateIfAvailable('Calendar');
        navigateIfAvailable('TaskView', {
          taskId: target.taskId,
          assignmentId: target.assignmentId,
          scheduledDate: target.scheduledDate,
          scheduledTime: target.scheduledTime,
          scheduledFor: target.scheduledFor,
          status,
        });
        return;
      }
      if (attemptsLeft > 0) {
        setTimeout(() => tryNavigate(attemptsLeft - 1), 250);
      }
    };
    tryNavigate(20);
  };

  useEffect(() => {
    // Startup resync, then refresh the rolling window every time the app
    // returns to the foreground.
    requestTaskReminderResync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        requestTaskReminderResync();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ConfirmDialog
      visible={prompt !== null}
      title="Time to complete the task"
      message={prompt?.taskTitle ?? ''}
      confirmLabel="Go to task"
      cancelLabel="I'll do it later"
      onConfirm={openTask}
      onCancel={() => setPrompt(null)}
    />
  );
}
