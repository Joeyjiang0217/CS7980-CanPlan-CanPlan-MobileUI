import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useAssignmentsForUser,
  useCancelTaskInstance,
  useDeleteAssignment,
  useEndAssignment,
  useTaskInstance,
  useTaskInstanceViews,
} from '../../features/assignments/hooks/useAssignments';
import {
  occurrenceState,
  useSeriesActiveDates,
} from '../../features/assignments/hooks/useSeriesActiveDates';
import { occurrenceKey, useOccurrenceStatuses } from '../../features/assignments/occurrenceCompletion';
import { assignmentFirstDate, describeRepeat } from '../../features/assignments/repeat';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { TaskInstanceStatus } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type OccurrenceDetailNavigation = NativeStackNavigationProp<MainStackParamList, 'OccurrenceDetail'>;
type OccurrenceDetailRoute = RouteProp<MainStackParamList, 'OccurrenceDetail'>;

const STATUS_LABEL: Record<TaskInstanceStatus, string> = {
  TO_DO: 'To do',
  IN_PROGRESS: 'In progress',
  OVERDUE: 'Overdue',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const formatLongDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};
const formatActiveDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export default function OccurrenceDetailScreen() {
  const navigation = useNavigation<OccurrenceDetailNavigation>();
  const route = useRoute<OccurrenceDetailRoute>();
  const insets = useSafeAreaInsets();
  const { assignmentId, taskTitle, scheduledDate, scheduledTime, status: paramStatus } = route.params;

  const [ownerId, setOwnerId] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [inlineError, setInlineError] = useState<string>();

  const cancelInstance = useCancelTaskInstance();
  const endAssignment = useEndAssignment();
  const deleteAssignment = useDeleteAssignment();
  const isBusy =
    cancelInstance.isPending || endAssignment.isPending || deleteAssignment.isPending;

  useEffect(() => {
    let mounted = true;
    void getCurrentUserId().then((id) => {
      if (mounted) {
        setOwnerId(id);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const assignmentsQuery = useAssignmentsForUser(ownerId);
  const assignment = useMemo(
    () =>
      assignmentsQuery.data?.pages
        .flatMap((page) => page.items)
        .find((a) => a.assignmentId === assignmentId),
    [assignmentsQuery.data, assignmentId],
  );
  const isRecurring = assignment?.scheduleType === 'RECURRING';

  // The navigation param status can be stale (e.g. completed inside the runner
  // after this screen was pushed), so re-read the live occurrence from the
  // calendar feed for this exact day and prefer it.
  const dayViewsQuery = useTaskInstanceViews(ownerId, scheduledDate, scheduledDate);
  const overrides = useOccurrenceStatuses();
  const occurrence = useMemo(
    () =>
      dayViewsQuery.data?.items.find(
        (v) => v.assignmentId === assignmentId && v.scheduledTime === scheduledTime,
      ),
    [dayViewsQuery.data, assignmentId, scheduledTime],
  );
  const status =
    overrides.get(occurrenceKey(assignmentId, scheduledDate, scheduledTime)) ??
    occurrence?.status ??
    paramStatus;

  // Server-tracked focused time — only exists once the occurrence is
  // materialized (started); virtual occurrences show a dash.
  const timedInstanceId = occurrence?.isVirtual ? undefined : occurrence?.instanceId ?? undefined;
  const instanceQuery = useTaskInstance(timedInstanceId ?? '', Boolean(timedInstanceId));
  const instance = instanceQuery.data;

  // A running step timer isn't in activeDurationSeconds yet (the server only
  // accumulates on close), so add the open interval and tick it every second.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!instance?.activeStepStartedAt) {
      return;
    }
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [instance?.activeStepStartedAt]);

  const activeTimeLabel = useMemo(() => {
    if (!timedInstanceId || !instance) {
      return '—';
    }
    let totalSeconds = instance.activeDurationSeconds;
    if (instance.activeStepStartedAt) {
      const startedMs = new Date(instance.activeStepStartedAt).getTime();
      if (Number.isFinite(startedMs) && nowTick > startedMs) {
        totalSeconds += Math.floor((nowTick - startedMs) / 1000);
      }
    }
    return formatActiveDuration(totalSeconds);
  }, [timedInstanceId, instance, nowTick]);

  // Where this occurrence sits in its series decides what "delete" can do:
  //   active  → this occurrence, or this and all future (manage the series);
  //   completed / past → only this occurrence (a settled record);
  //   gray    → nothing (a projected day after the active one — unreachable from
  //             the calendar, guarded here anyway).
  const activeDates = useSeriesActiveDates(ownerId);
  const state = occurrenceState({
    scheduledDate,
    status,
    activeDate: activeDates.get(assignmentId),
    todayISO: todayISO(),
  });
  const deleteMode: 'series' | 'occurrence' | 'whole' | 'none' = !isRecurring
    ? 'whole'
    : state === 'active'
      ? 'series'
      : state === 'gray'
        ? 'none'
        : 'occurrence';

  const dateLabel = useMemo(() => formatLongDate(scheduledDate), [scheduledDate]);
  const firstDate = assignmentFirstDate(assignment);
  const firstDateLabel = firstDate ? formatLongDate(firstDate) : null;
  const repeatLabel = assignment ? describeRepeat(assignment) : '—';
  const isFuture = scheduledDate > todayISO();

  // After a delete, jump back to the calendar (this screen may have been
  // reached via the runner, so a single goBack would land on the now-stale
  // runner instead of the calendar).
  const leaveOnSuccess = { onSuccess: () => navigation.navigate('Calendar') };
  const onError = (error: Error) => setInlineError(error.message);

  const handleDeleteThis = () => {
    setConfirmVisible(false);
    cancelInstance.mutate(
      { userId: ownerId, assignmentId, scheduledDate, scheduledTime },
      { ...leaveOnSuccess, onError },
    );
  };

  const handleDeleteFuture = () => {
    setConfirmVisible(false);
    endAssignment.mutate(
      { userId: ownerId, assignmentId, effectiveDate: scheduledDate },
      { ...leaveOnSuccess, onError },
    );
  };

  const handleDeleteWhole = () => {
    setConfirmVisible(false);
    deleteAssignment.mutate(
      { userId: ownerId, assignmentId },
      { ...leaveOnSuccess, onError },
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
          {taskTitle}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{dateLabel}</Text>
          </View>
          <View style={styles.divider} />
          {isRecurring && firstDateLabel ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>First date</Text>
                <Text style={styles.rowValue}>{firstDateLabel}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Time</Text>
            <Text style={styles.rowValue}>{scheduledTime}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Repeat</Text>
            <Text style={styles.rowValue}>{repeatLabel}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Status</Text>
            <Text style={styles.rowValue}>{STATUS_LABEL[status]}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total active time</Text>
            <Text style={styles.rowValue}>{activeTimeLabel}</Text>
          </View>
        </View>

        {deleteMode === 'none' ? (
          <Text style={styles.noteText}>
            This occurrence isn’t active yet, so there’s nothing to change here. Step-by-step
            actions unlock on the day it’s scheduled.
          </Text>
        ) : isFuture ? (
          <Text style={styles.noteText}>
            This is a future occurrence — you can only delete it here. Step-by-step actions
            unlock on the day it’s scheduled.
          </Text>
        ) : null}

        {inlineError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {inlineError}
          </Text>
        ) : null}
      </ScrollView>

      {deleteMode !== 'none' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={() => setConfirmVisible(true)}
          style={({ pressed }) => [
            styles.deleteButton,
            { marginBottom: insets.bottom + spacing.lg },
            pressed && !isBusy ? styles.deleteButtonPressed : null,
          ]}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={confirmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Cancel"
            onPress={() => setConfirmVisible(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetMessage}>
              {deleteMode === 'series'
                ? 'This is a repeating task. What would you like to delete?'
                : deleteMode === 'occurrence'
                  ? 'Delete this occurrence? Other days in the series stay.'
                  : 'Delete this scheduled task?'}
            </Text>

            {deleteMode === 'series' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete only this occurrence"
                  onPress={handleDeleteThis}
                  style={({ pressed }) => [styles.sheetButton, pressed ? styles.sheetButtonPressed : null]}
                >
                  <Text style={styles.sheetDestructive}>Delete only this occurrence</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete all future occurrences"
                  onPress={handleDeleteFuture}
                  style={({ pressed }) => [styles.sheetButton, pressed ? styles.sheetButtonPressed : null]}
                >
                  <Text style={styles.sheetDestructive}>Delete all future occurrences</Text>
                </Pressable>
              </>
            ) : deleteMode === 'occurrence' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this occurrence"
                onPress={handleDeleteThis}
                style={({ pressed }) => [styles.sheetButton, pressed ? styles.sheetButtonPressed : null]}
              >
                <Text style={styles.sheetDestructive}>Delete this occurrence</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete"
                onPress={handleDeleteWhole}
                style={({ pressed }) => [styles.sheetButton, pressed ? styles.sheetButtonPressed : null]}
              >
                <Text style={styles.sheetDestructive}>Delete</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setConfirmVisible(false)}
              style={({ pressed }) => [styles.sheetButton, pressed ? styles.sheetButtonPressed : null]}
            >
              <Text style={styles.sheetCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    marginLeft: spacing.md,
    ...typography.title,
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  rowLabel: {
    ...typography.heading,
    color: colors.text,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    ...typography.body,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  noteText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.md,
  },
  deleteButton: {
    marginHorizontal: spacing.xl,
    minHeight: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE8E8',
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteButtonText: {
    ...typography.button,
    color: colors.danger,
  },
  // Action sheet
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  sheetButton: {
    minHeight: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  sheetButtonPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  sheetDestructive: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  sheetCancel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
