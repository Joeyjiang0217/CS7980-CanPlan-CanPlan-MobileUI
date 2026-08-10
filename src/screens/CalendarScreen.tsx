import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { getTaskInstanceViews } from '../features/assignments/api/assignmentApi';
import {
  useAssignmentsForUser,
  useInstanceSteps,
  useStartTaskInstance,
  useTaskInstances,
  useTaskInstanceViews,
  useUpdateInstanceStatus,
} from '../features/assignments/hooks/useAssignments';
import {
  occurrenceState,
  useSeriesActiveDates,
  type OccurrenceLifeState,
} from '../features/assignments/hooks/useSeriesActiveDates';
import {
  occurrenceKey,
  setOccurrenceInstanceId,
  setOccurrenceStatus,
  useOccurrenceInstanceIds,
  useOccurrenceResolvedAt,
  useOccurrenceStatuses,
} from '../features/assignments/occurrenceCompletion';
import {
  bucketOf,
  isResolvedAfterScheduled,
  liveStatus,
  type StatusKey,
} from '../features/assignments/occurrenceStatus';
import { describeRepeat } from '../features/assignments/repeat';
import {
  getInterfaceSettings,
  useInterfaceSettings,
} from '../features/settings/interfaceSettings';
import {
  useCoverPreviewUriMap,
  useCoverThumbnailUriMap,
} from '../features/media/hooks/useCoverThumbnails';
import { useMediaDownloadUrl, useMediaDownloadUrlMap } from '../features/media/hooks/useMedia';
import { useTasksByOwner, useTaskSteps } from '../features/tasks/hooks/useTaskApi';
import { useSettingsTapGate } from '../shared/hooks/useSettingsTapGate';
import type { MainStackParamList } from '../navigation/types';
import { getCurrentUserId } from '../shared/api/authTokenProvider';
import type { TaskAssignment, TaskInstanceView } from '../shared/api/canplanTypes';
import BackButton from '../shared/components/BackButton';
import CachedImage from '../shared/components/CachedImage';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import { queryKeys } from '../shared/query/queryKeys';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type CalendarNavigation = NativeStackNavigationProp<MainStackParamList, 'Calendar'>;
type CalendarRoute = RouteProp<MainStackParamList, 'Calendar'>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** How far back the Show Overdue on Launch list reaches (today-7 … yesterday). */
const PAST_OVERDUE_DAYS = 7;

/**
 * Which status tab the calendar opens on. Consumed once per JS process (a
 * true cold start): Show Overdue on Launch lands on the Overdue tab only in
 * the locked Simple Mode calendar, and Only Show Today's Tasks suppresses it
 * entirely. Later mounts (Settings round-trips, stack rebuilds) keep To Do.
 */
let launchTabDecided = false;
function initialCalendarTab(): StatusKey {
  if (launchTabDecided) {
    return 'todo';
  }
  launchTabDecided = true;
  const settings = getInterfaceSettings();
  return settings.simpleMode &&
    settings.startingPage === 'CALENDAR' &&
    !settings.allowChangingDate &&
    settings.showOverdue &&
    !settings.onlyToday
    ? 'overdue'
    : 'todo';
}

const NO_PAST_OVERDUE: TaskInstanceView[] = [];

/** "2026-07-13" → "Sunday" (past-week group labels; unique within 7 days). */
const weekdayName = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
};

/** "2026-07-13" → "Jul 13" (the date suffix on group labels). */
const monthDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const STATUS_TABS: Array<{ key: StatusKey; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'todo', label: 'To Do' },
  { key: 'done', label: 'Done' },
  { key: 'skipped', label: 'Skipped' },
];

const STATUS_ACCENT: Record<StatusKey, string> = {
  overdue: colors.danger,
  todo: colors.primary,
  done: colors.success,
  skipped: colors.disabled,
};

const STATUS_LABEL: Record<StatusKey, string> = {
  overdue: 'Overdue',
  todo: 'To Do',
  done: 'Done',
  skipped: 'Skipped',
};

/** Map a server status onto one of the four calendar buckets (CANCELLED is dropped). */

// ── Date helpers (local, not UTC) ──────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** Hour → slot range, e.g. 20 → "20:00 - 21:00", 23 → "23:00 - 00:00". */
const slotLabel = (hour: number) => `${pad2(hour)}:00 - ${pad2((hour + 1) % 24)}:00`;
/** "2026-07-02" → "Thu, Jul 2". */
const formatShortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const daysBetween = (a: Date, b: Date) =>
  Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
      Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
      86_400_000,
  );

const MONTH_PAGER_RADIUS = 60;
const DAY_PAGER_SIDE_BUFFER = 7;
const DAY_PAGER_PAGE_COUNT = 21;
const DAY_PAGER_REBASE_EDGE = 3;
const dayPagerIndexForDate = (date: Date, weekStartDate: Date) =>
  daysBetween(date, weekStartDate) + DAY_PAGER_SIDE_BUFFER;

/** Local calendar day as one comparable number, usable on both threads. */
const localDayKey = (d: Date) => {
  'worklet';
  return d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate();
};

/**
 * Today's date, kept current while mounted. A mounted-at-time snapshot goes
 * stale when the app sleeps (or stays open) past midnight, leaving the red
 * "today" marker, Start buttons, runner-vs-preview routing, and to do/overdue
 * bucketing keyed to yesterday until a full reload.
 *
 * The watcher deliberately avoids JS timers: React Native schedules those
 * against the wall clock (RCTTiming targets are NSDates), so a backwards
 * clock change leaves every pending timer — setInterval and rAF included —
 * frozen until the clock catches back up to the old deadline. A Reanimated
 * frame callback instead compares the day key once per UI-thread frame:
 * display links are vsync-driven and immune to clock changes, and they pause
 * and resume with the app's foreground state. The JS thread is only woken
 * when the calendar day actually changes, so re-renders (and all downstream
 * recomputes) stay day-boundary-only. The AppState listener is belt and
 * braces for the highest-stakes production path — first frame after an
 * overnight background resume.
 */
function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  const refresh = useCallback(() => {
    const now = new Date();
    setToday((current) => (isSameDay(current, now) ? current : now));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const watchedDayKey = useSharedValue(localDayKey(today));
  useFrameCallback(() => {
    'worklet';
    const key = localDayKey(new Date());
    if (watchedDayKey.value !== key) {
      watchedDayKey.value = key;
      runOnJS(refresh)();
    }
  });

  return today;
}

/**
 * Epoch minute, ticking while mounted — drives the live to do → overdue flip.
 * Same frame-callback pattern as useToday (see its doc comment for why JS
 * timers are avoided): the UI thread compares the minute key per frame and
 * only wakes the JS thread when the minute actually changes.
 */
function useMinuteTick(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  const watchedMinute = useSharedValue(Math.floor(Date.now() / 60_000));
  useFrameCallback(() => {
    'worklet';
    const next = Math.floor(Date.now() / 60_000);
    if (watchedMinute.value !== next) {
      watchedMinute.value = next;
      runOnJS(setMinute)(next);
    }
  });
  return minute;
}

const calendarMountedDays = new Map<string, ReadonlySet<string>>();
const calendarMountedDayListeners = new Set<() => void>();

function mountedDaysStoreKey(ownerId: string | null | undefined) {
  return ownerId ?? '__anonymous__';
}

function emitMountedDaysChange() {
  calendarMountedDayListeners.forEach((listener) => listener());
}

function subscribeMountedDays(listener: () => void) {
  calendarMountedDayListeners.add(listener);
  return () => {
    calendarMountedDayListeners.delete(listener);
  };
}

function getMountedDaysSnapshot(storeKey: string, initialDateKey: string) {
  const existing = calendarMountedDays.get(storeKey);
  if (existing) return existing;
  const initial = new Set([initialDateKey]);
  calendarMountedDays.set(storeKey, initial);
  return initial;
}

function markCalendarDayMounted(storeKey: string, dateKey: string) {
  const current = calendarMountedDays.get(storeKey);
  if (current?.has(dateKey)) return;
  const next = new Set(current ?? []);
  next.add(dateKey);
  calendarMountedDays.set(storeKey, next);
  emitMountedDaysChange();
}

function useCalendarMountedDays(storeKey: string, initialDateKey: string) {
  const getSnapshot = useCallback(
    () => getMountedDaysSnapshot(storeKey, initialDateKey),
    [initialDateKey, storeKey],
  );
  return useSyncExternalStore(subscribeMountedDays, getSnapshot, getSnapshot);
}

// ── A task's cover image, resolved from its asset id ───────────────────────────

function TaskCover({
  uri,
  cacheKey,
  style,
  iconSize = 32,
  dimmed = false,
}: {
  uri?: string | null;
  cacheKey?: string;
  style: object;
  iconSize?: number;
  dimmed?: boolean;
}) {
  return (
    <View style={[style, styles.coverPlaceholder, dimmed ? styles.coverDimmed : null]}>
      <Ionicons name="image-outline" size={iconSize} color={colors.disabled} />
      {uri ? (
        <CachedImage
          uri={uri}
          cacheKey={cacheKey ?? uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
      ) : null}
    </View>
  );
}

// ── Off-screen cover prewarm ───────────────────────────────────────────────────

/** Warms one cover's URL (react-query) + bytes (expo-image, keyed by assetId). */
function CoverPrewarmCell({ taskId, assetId }: { taskId: string; assetId: string }) {
  const download = useMediaDownloadUrl(taskId, assetId);
  return (
    <CachedImage
      uri={download.data?.downloadUrl ?? null}
      cacheKey={assetId}
      style={styles.prewarmPixel}
      transition={0}
    />
  );
}

/**
 * Renders every task cover off-screen so both cache layers are warm before the
 * user opens the month grid: the URL query is shared by key, and the bytes are
 * cached by expo-image under `cacheKey` (= assetId) — the same key the grid reads,
 * which `Image.prefetch` can't target on this expo-image version. Mounting is
 * deferred until interactions settle so it never competes with the day view's
 * first paint or with swiping between days. The set is tiny (one entry per task,
 * not per day), so this stays cheap.
 */
function CoverPrewarmer({ covers }: { covers: ReadonlyArray<{ taskId: string; assetId: string }> }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => handle.cancel();
  }, []);
  if (!ready || covers.length === 0) return null;
  return (
    <View style={styles.prewarmLayer} pointerEvents="none" accessibilityElementsHidden>
      {covers.map(({ taskId, assetId }) => (
        <CoverPrewarmCell key={`${taskId}:${assetId}`} taskId={taskId} assetId={assetId} />
      ))}
    </View>
  );
}

// ── WeChat-style thumbnail collage for a calendar day (up to 9 covers) ─────────

const THUMB_SIZE = 48;

/** One distinct task cover in a day's collage, plus whether it's not yet materialized. */
type DayThumbItem = { taskId: string; gray: boolean };

function DayThumbGrid({
  items,
  coverByTask,
  coverUriByTask,
}: {
  items: DayThumbItem[];
  coverByTask: Map<string, string | null | undefined>;
  // taskId → local thumbnail URI. Cells stay hook-free: ~30 days × up to 9
  // covers × pages of per-cell query hooks is what froze the pager on mount.
  coverUriByTask: ReadonlyMap<string, string | null>;
}) {
  // Each cover gets its own equal square tile (WeChat-group-avatar style) so
  // covers show in full rather than being stretched into tall side-by-side
  // strips. Partial rows are centered by the container's justify/alignContent.
  const cols = items.length <= 1 ? 1 : items.length <= 4 ? 2 : 3;
  const tile = Math.floor(THUMB_SIZE / cols);
  return (
    <View style={styles.monthThumb}>
      {items.map(({ taskId, gray }, index) => {
        const assetId = coverByTask.get(taskId);
        const thumbUri = coverUriByTask.get(taskId) ?? null;
        return (
          <View key={`${taskId}-${index}`} style={{ width: tile, height: tile }}>
            <View style={StyleSheet.absoluteFill}>
              {assetId && thumbUri ? (
                <CachedImage
                  uri={thumbUri}
                  cacheKey={`${assetId}:month-thumb-64-v2`}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={0}
                />
              ) : null}
            </View>
            {/* Not-yet-materialized days read as grey; materialized show in colour. */}
            {gray ? <View style={styles.thumbGrayVeil} pointerEvents="none" /> : null}
          </View>
        );
      })}
    </View>
  );
}

// ── Assignment card ────────────────────────────────────────────────────────────

function AssignmentCard({
  view,
  bucket,
  wasOverdue,
  ownerId,
  coverAssetId,
  coverUri,
  coverPreviewUri,
  state,
  isRecurring,
  repeatLabel,
  todayISO,
  started,
  starting,
  finishing,
  onStart,
  onMarkDone,
  onPress,
}: {
  view: TaskInstanceView;
  bucket: StatusKey;
  wasOverdue: boolean;
  ownerId: string;
  coverAssetId?: string | null;
  coverUri?: string | null;
  coverPreviewUri?: string | null;
  state: OccurrenceLifeState;
  isRecurring: boolean;
  /** Recurrence type (e.g. "Daily") shown next to the time; omitted for one-time. */
  repeatLabel?: string;
  todayISO: string;
  /** The occurrence is materialized (user pressed start) — show "In progress". */
  started: boolean;
  /** A start request for this occurrence is in flight. */
  starting: boolean;
  /** A mark-as-done request for this occurrence is in flight. */
  finishing: boolean;
  /** Ask to materialize this occurrence (To Do/Overdue, today or earlier). */
  onStart: () => void;
  /** Mark a fully-checked occurrence as done. */
  onMarkDone: () => void;
  onPress: () => void;
}) {
  // "Gray" occurrences (projected days after the active one) are inert: dimmed
  // and not tappable. Completed/skipped ones read as done (strikethrough title).
  const isGray = state === 'gray';
  const isDone = bucket === 'done' || bucket === 'skipped';
  const useHeroImage = !isGray && bucket === 'todo' && view.scheduledDate === todayISO;
  const heroCoverUri = coverPreviewUri ?? coverUri;
  // Step completion progress is what distinguishes an assignment occurrence from
  // a plain task: total comes from the task's steps, done from the backend's
  // instance step snapshots (virtual occurrences have none → 0 done).
  const stepsQuery = useTaskSteps(view.taskId);
  const templateStepCount =
    stepsQuery.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0;
  const instanceStepsQuery = useInstanceSteps(
    ownerId,
    view.isVirtual ? '' : view.instanceId ?? '',
  );
  const instanceStepCount = useMemo(
    () => instanceStepsQuery.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0,
    [instanceStepsQuery.data],
  );
  const doneSteps = useMemo(() => {
    let count = 0;
    for (const page of instanceStepsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (item.completed) {
          count += 1;
        }
      }
    }
    return count;
  }, [instanceStepsQuery.data]);
  // Count the occurrence's own steps once it has them, matching the frozen list
  // behind the card. Counting the template instead could call a task fully done
  // while a snapshot step sat unchecked — which the backend then refuses to
  // complete, leaving the "All done!" button permanently failing.
  const totalSteps = instanceStepCount > 0 ? instanceStepCount : templateStepCount;
  // Every step checked on a started occurrence (but not yet marked done).
  const allStepsDone = started && totalSteps > 0 && doneSteps >= totalSteps;
  const stepsLine = (
    <View style={styles.taskStepsRow}>
      <Text numberOfLines={1} style={[styles.taskMeta, styles.taskMetaInline]}>
        {doneSteps}/{totalSteps} steps
      </Text>
      {allStepsDone ? (
        // Same dark-teal circle check as the task view's progress label.
        <Ionicons name="checkmark-circle" size={16} color="#2E9C92" />
      ) : null}
    </View>
  );

  // Title + time/repeat + steps — shared by both layouts.
  const textBlock = (
    <View style={styles.taskTextWrap}>
      <Text
        numberOfLines={2}
        style={[
          styles.taskTitle,
          isDone ? styles.taskTitleDone : isGray ? styles.taskTitleFuture : null,
        ]}
      >
        {view.title}
      </Text>
      <View style={styles.taskMetaRow}>
        {isRecurring ? (
          <Ionicons
            name="repeat"
            size={14}
            color={isGray ? colors.disabled : colors.textMuted}
            accessibilityLabel="Repeats"
          />
        ) : null}
        <Text numberOfLines={1} style={[styles.taskMeta, styles.taskMetaInline]}>
          {repeatLabel ? `${view.scheduledTime} · ${repeatLabel}` : view.scheduledTime}
        </Text>
      </View>
      {stepsLine}
    </View>
  );

  // Starting (materializing) is an explicit action, offered on today-or-earlier
  // To Do/Overdue occurrences that aren't materialized yet. Once started, the
  // spot shows a static "In progress" state instead.
  const isActionBucket = bucket === 'todo' || bucket === 'overdue';
  const canStart =
    isActionBucket && !isGray && !started && view.scheduledDate <= todayISO;
  const startButton = canStart ? (
    <Pressable
      key="start"
      accessibilityRole="button"
      accessibilityLabel={
        bucket === 'overdue' ? `Start ${view.title} now` : `Start ${view.title}`
      }
      accessibilityState={{ disabled: starting }}
      disabled={starting}
      onPress={onStart}
      style={({ pressed }) => [
        styles.startButton,
        pressed ? styles.startButtonPressed : null,
        starting ? styles.startButtonDisabled : null,
      ]}
    >
      <Ionicons name="play" size={12} color={colors.onPrimary} />
      <Text style={styles.statusTagText}>
        {starting ? 'Starting…' : bucket === 'overdue' ? 'Start now' : 'To Do'}
      </Text>
    </Pressable>
  ) : null;
  // Every step checked → the tag becomes a button that marks the whole
  // occurrence done; otherwise it's a static "In progress" state.
  const allDoneButton =
    isActionBucket && started && allStepsDone ? (
      <Pressable
        key="all-done"
        accessibilityRole="button"
        accessibilityLabel={`Mark ${view.title} done`}
        accessibilityState={{ disabled: finishing }}
        disabled={finishing}
        onPress={onMarkDone}
        style={({ pressed }) => [
          styles.startButton,
          styles.allDoneButton,
          pressed ? styles.startButtonPressed : null,
          finishing ? styles.startButtonDisabled : null,
        ]}
      >
        <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
        <Text style={styles.statusTagText}>{finishing ? 'Saving…' : 'All done!'}</Text>
      </Pressable>
    ) : null;
  const inProgressTag =
    isActionBucket && started && !allStepsDone ? (
      <View key="in-progress" style={[styles.statusTag, styles.inProgressTag]}>
        <Text style={styles.statusTagText}>In progress</Text>
      </View>
    ) : null;
  const bucketChip = (
    <View key={bucket} style={[styles.statusTag, { backgroundColor: STATUS_ACCENT[bucket] }]}>
      <Text style={styles.statusTagText}>{STATUS_LABEL[bucket]}</Text>
    </View>
  );
  const statusTags = [
    // The To Do chip itself is the start affordance / progress state; Overdue
    // keeps its chip and stacks the start control under it.
    bucket === 'todo' ? (startButton ?? allDoneButton ?? inProgressTag ?? bucketChip) : bucketChip,
    bucket === 'overdue' ? (startButton ?? allDoneButton ?? inProgressTag) : null,
    wasOverdue ? (
      <View key="overdue" style={[styles.statusTag, { backgroundColor: STATUS_ACCENT.overdue }]}>
        <Text style={styles.statusTagText}>{STATUS_LABEL.overdue}</Text>
      </View>
    ) : null,
  ].filter(Boolean);
  const stackTags = wasOverdue || (bucket === 'overdue' && statusTags.length > 1);
  const statusTag = (
    <View style={[styles.statusTagRow, stackTags ? styles.statusTagColumn : null]}>
      {statusTags}
    </View>
  );
  const compactStatusTag = statusTag;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${view.title}, ${view.scheduledTime}, ${doneSteps} of ${totalSteps} steps${
        isGray ? ', not active yet' : ''
      }`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskCard,
        isGray ? styles.taskCardGray : null,
        pressed ? styles.taskCardPressed : null,
      ]}
    >
      {!useHeroImage ? (
        <View style={styles.compactTaskRow}>
          <View style={styles.compactTaskMain}>
            <TaskCover
              uri={coverUri}
              cacheKey={coverAssetId ? `${coverAssetId}:calendar-card-thumb-v2` : undefined}
              style={styles.compactTaskThumb}
              iconSize={20}
            />
            <View style={[styles.taskTextWrap, styles.compactTaskTextWrap]}>
              <Text
                numberOfLines={2}
                style={[
                  styles.taskTitle,
                  isDone ? styles.taskTitleDone : isGray ? styles.taskTitleFuture : null,
                ]}
              >
                {view.title}
              </Text>
              <View style={styles.taskMetaRow}>
                {isRecurring ? (
                  <Ionicons
                    name="repeat"
                    size={14}
                    color={isGray ? colors.disabled : colors.textMuted}
                    accessibilityLabel="Repeats"
                  />
                ) : null}
                <Text numberOfLines={1} style={[styles.taskMeta, styles.taskMetaInline]}>
                  {repeatLabel ? `${view.scheduledTime} · ${repeatLabel}` : view.scheduledTime}
                </Text>
              </View>
              {stepsLine}
            </View>
          </View>
          <View style={styles.compactTaskActions}>
            {compactStatusTag}
            <Ionicons
              name={isGray ? 'information-circle-outline' : 'chevron-forward'}
              size={24}
              color={isGray ? colors.disabled : colors.primary}
            />
          </View>
        </View>
      ) : (
        // Today's live To Do keeps the larger image treatment.
        <>
          <TaskCover
            uri={heroCoverUri}
            cacheKey={
              coverAssetId
                ? coverPreviewUri
                  ? `${coverAssetId}:calendar-card-preview-v1`
                  : `${coverAssetId}:calendar-card-thumb-v2`
                : undefined
            }
            style={styles.taskImage}
          />
          <View style={styles.taskBody}>
            <View style={[styles.taskAccent, { backgroundColor: STATUS_ACCENT[bucket] }]} />
            {textBlock}
            {statusTag}
            <Ionicons name="chevron-forward" size={24} color={colors.primary} />
          </View>
        </>
      )}
    </Pressable>
  );
}

// ── Month picker modal (opened from the eye icon) ──────────────────────────────

// ── One month's grid (its own data query, one pager page) ──────────────────────

// Memoized so the pager's silent recenter after a swipe doesn't re-render the
// two pages whose props didn't change — with ~30 day cells each that re-render
// is what made the settle stutter.
const MonthGridPage = memo(function MonthGridPage({
  monthDate,
  width,
  height,
  ownerId,
  coverByTask,
  coverUriByTask,
  activeDates,
  today,
  showThumbnails,
  onSelectDay,
}: {
  monthDate: Date;
  width: number;
  height: number;
  ownerId: string;
  coverByTask: Map<string, string | null | undefined>;
  coverUriByTask: ReadonlyMap<string, string | null>;
  activeDates: ReadonlyMap<string, string>;
  today: Date;
  showThumbnails: boolean;
  onSelectDay: (date: Date) => void;
}) {
  const statusOverrides = useOccurrenceStatuses();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthEnd = useMemo(() => new Date(year, month + 1, 0), [year, month]);

  // One request per month, keyed by month, so navigating only fetches the new
  // month and previously seen months stay cached (5-min staleTime).
  const viewsQuery = useTaskInstanceViews(
    ownerId,
    toISODate(monthStart),
    toISODate(monthEnd),
  );

  // date string → up to 9 distinct task covers scheduled that day, each flagged
  // gray when that day's occurrence isn't materialized yet.
  const tasksByDate = useMemo(() => {
    const todayISO = toISODate(today);
    const byDate = new Map<string, Map<string, boolean>>();
    for (const v of viewsQuery.data?.items ?? []) {
      let covers = byDate.get(v.scheduledDate);
      if (!covers) {
        covers = new Map<string, boolean>();
        byDate.set(v.scheduledDate, covers);
      }
      const override = statusOverrides.get(
        occurrenceKey(v.assignmentId, v.scheduledDate, v.scheduledTime),
      );
      const gray =
        occurrenceState({
          scheduledDate: v.scheduledDate,
          status: override ?? v.status,
          activeDate: activeDates.get(v.assignmentId),
          todayISO,
        }) === 'gray';
      if (covers.has(v.taskId)) {
        if (!gray) {
          covers.set(v.taskId, false);
        }
      } else if (covers.size < 9) {
        covers.set(v.taskId, gray);
      }
    }
    const result = new Map<string, DayThumbItem[]>();
    for (const [date, covers] of byDate) {
      result.set(
        date,
        [...covers.entries()].map(([taskId, gray]) => ({ taskId, gray })),
      );
    }
    return result;
  }, [viewsQuery.data, statusOverrides, activeDates, today]);

  const cells = useMemo<Array<number | null>>(() => {
    const firstWeekday = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();
    return [
      ...Array<null>(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [monthStart, monthEnd]);

  const [thumbRenderLimit, setThumbRenderLimit] = useState(0);
  useEffect(() => {
    if (!showThumbnails) {
      setThumbRenderLimit(0);
      return;
    }

    const daysInMonth = monthEnd.getDate();
    const firstBatch = Math.min(daysInMonth, 14);
    setThumbRenderLimit(firstBatch);
    let cancelled = false;
    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    raf = requestAnimationFrame(() => {
      if (!cancelled) {
        setThumbRenderLimit(daysInMonth);
      }
    });

    return () => {
      cancelled = true;
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [showThumbnails, monthEnd, viewsQuery.dataUpdatedAt]);

  return (
    <View style={[styles.modalGridContent, { width, height: height || undefined }]}>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={styles.monthCell} />;
          }
          const date = new Date(year, month, day);
          const iso = toISODate(date);
          const dayItems = tasksByDate.get(iso) ?? [];
          const shouldRenderThumb = dayItems.length > 0 && day <= thumbRenderLimit;
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={date.toDateString()}
              onPress={() => onSelectDay(date)}
              style={[styles.monthCell, isToday ? styles.monthCellToday : null]}
            >
              {shouldRenderThumb ? (
                <DayThumbGrid
                  items={dayItems}
                  coverByTask={coverByTask}
                  coverUriByTask={coverUriByTask}
                />
              ) : null}
              {isToday ? <View style={styles.monthTodayHalo} pointerEvents="none" /> : null}
              <View style={styles.monthDayBadge}>
                <Text
                  style={[
                    styles.monthDayText,
                    shouldRenderThumb ? styles.monthDayTextOnImage : null,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

// ── Month picker modal (opened from the eye icon) ──────────────────────────────

function MonthPickerModal({
  visible,
  ownerId,
  initialDate,
  coverByTask,
  coverUriByTask,
  activeDates,
  today,
  onClose,
  onSelectDay,
}: {
  visible: boolean;
  ownerId: string;
  initialDate: Date;
  coverByTask: Map<string, string | null | undefined>;
  coverUriByTask: ReadonlyMap<string, string | null>;
  activeDates: ReadonlyMap<string, string>;
  today: Date;
  onClose: () => void;
  onSelectDay: (date: Date) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const slideY = useRef(new Animated.Value(windowHeight)).current;
  const [modalMounted, setModalMounted] = useState(visible);
  const [contentReady, setContentReady] = useState(false);
  const [baseMonth, setBaseMonth] = useState(() => startOfMonth(initialDate));
  const [currentIndex, setCurrentIndex] = useState(MONTH_PAGER_RADIUS);
  const [pagerHeight, setPagerHeight] = useState(0);
  const pagerRef = useRef<FlatList<Date>>(null);
  const visualMonthIndexRef = useRef(MONTH_PAGER_RADIUS);
  const pagingFromButtonRef = useRef(false);
  const pendingButtonIndexRef = useRef<number | null>(null);
  const pagingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentReadyHandleRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);

  useEffect(() => {
    if (visible) {
      contentReadyHandleRef.current?.cancel();
      setModalMounted(true);
      setContentReady(false);
      slideY.setValue(windowHeight);
      Animated.timing(slideY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        contentReadyHandleRef.current = InteractionManager.runAfterInteractions(() => {
          setContentReady(true);
          contentReadyHandleRef.current = null;
        });
      });
      return;
    }

    contentReadyHandleRef.current?.cancel();
    contentReadyHandleRef.current = null;
    Animated.timing(slideY, {
      toValue: windowHeight,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setContentReady(false);
        setModalMounted(false);
      }
    });
  }, [visible, slideY, windowHeight]);

  // Re-sync to the current selection whenever the sheet is reopened.
  useEffect(() => {
    if (visible) {
      setBaseMonth(startOfMonth(initialDate));
      visualMonthIndexRef.current = MONTH_PAGER_RADIUS;
      setCurrentIndex(MONTH_PAGER_RADIUS);
    }
  }, [visible, initialDate]);

  const pages = useMemo(
    () =>
      Array.from({ length: MONTH_PAGER_RADIUS * 2 + 1 }, (_, index) =>
        addMonths(baseMonth, index - MONTH_PAGER_RADIUS),
      ),
    [baseMonth],
  );
  const currentMonthDate = pages[currentIndex] ?? baseMonth;
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const monthLabel = currentMonthDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const queryClient = useQueryClient();
  const currentMonthQueryKey = useMemo(() => {
    const start = toISODate(new Date(year, month, 1));
    const end = toISODate(new Date(year, month + 1, 0));
    return queryKeys.assignments.instanceViews(ownerId, start, end);
  }, [ownerId, year, month]);

  // Warm the two neighbouring months in the background (after the open/settle
  // interaction) so swiping to them is instant, without making the initial open
  // wait on all three. The centered month is fetched eagerly by its own page.
  useEffect(() => {
    if (!visible || !ownerId) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      for (const offset of [-1, 1]) {
        const start = toISODate(new Date(year, month + offset, 1));
        const end = toISODate(new Date(year, month + offset + 1, 0));
        void queryClient.prefetchQuery({
          queryKey: queryKeys.assignments.instanceViews(ownerId, start, end),
          queryFn: () => getTaskInstanceViews(ownerId, start, end),
        });
      }
    });
    return () => handle.cancel();
  }, [visible, ownerId, year, month, queryClient]);

  // First open can still wait for the slide interaction if there is no month
  // cache yet. Cached/reopened grids mount immediately so the sheet is not blank.
  const [gridReady, setGridReady] = useState(false);
  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!ownerId || gridReady || queryClient.getQueryData(currentMonthQueryKey)) {
      setGridReady(true);
      return;
    }
    const handle = InteractionManager.runAfterInteractions(() => setGridReady(true));
    return () => handle.cancel();
  }, [visible, ownerId, gridReady, currentMonthQueryKey, queryClient]);

  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => {
      pagerRef.current?.scrollToOffset({
        offset: width * MONTH_PAGER_RADIUS,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [visible, baseMonth, width]);

  const finishButtonPaging = useCallback(() => {
    pagingFromButtonRef.current = false;
    pendingButtonIndexRef.current = null;
    if (pagingResetTimerRef.current) {
      clearTimeout(pagingResetTimerRef.current);
      pagingResetTimerRef.current = null;
    }
  }, []);

  const updateVisualMonthIndex = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(pages.length - 1, index));
      if (visualMonthIndexRef.current === nextIndex) return;
      visualMonthIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    },
    [pages.length],
  );

  const handleMonthScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      updateVisualMonthIndex(page);
    },
    [updateVisualMonthIndex, width],
  );

  const handleSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      const maxIndex = pages.length - 1;
      updateVisualMonthIndex(Math.max(0, Math.min(maxIndex, page)));
      finishButtonPaging();
    },
    [finishButtonPaging, pages.length, updateVisualMonthIndex, width],
  );

  const handleMonthStep = useCallback(
    (step: -1 | 1) => {
      if (pagingFromButtonRef.current) return;
      if (!pagerRef.current || pagerHeight <= 0 || !gridReady) {
        updateVisualMonthIndex(currentIndex + step);
        return;
      }
      const nextIndex = Math.max(0, Math.min(pages.length - 1, currentIndex + step));
      if (nextIndex === currentIndex) return;
      pagingFromButtonRef.current = true;
      pendingButtonIndexRef.current = nextIndex;
      pagerRef.current.scrollToOffset({
        offset: width * nextIndex,
        animated: true,
      });
      pagingResetTimerRef.current = setTimeout(() => {
        setCurrentIndex(pendingButtonIndexRef.current ?? nextIndex);
        pagingFromButtonRef.current = false;
        pendingButtonIndexRef.current = null;
        pagingResetTimerRef.current = null;
      }, 700);
    },
    [currentIndex, gridReady, pagerHeight, pages.length, width],
  );

  const keyMonthPage = useCallback((d: Date) => toISODate(d), []);

  const renderMonthPage = useCallback(
    ({ item }: { item: Date }) => (
      <MonthGridPage
        monthDate={item}
        width={width}
        height={pagerHeight}
        ownerId={ownerId}
        coverByTask={coverByTask}
        coverUriByTask={coverUriByTask}
        activeDates={activeDates}
        today={today}
        showThumbnails={item.getFullYear() === year && item.getMonth() === month}
        onSelectDay={onSelectDay}
      />
    ),
    [
      activeDates,
      coverByTask,
      coverUriByTask,
      ownerId,
      pagerHeight,
      onSelectDay,
      today,
      width,
      year,
      month,
    ],
  );

  useEffect(
    () => () => {
      if (pagingResetTimerRef.current) {
        clearTimeout(pagingResetTimerRef.current);
      }
      contentReadyHandleRef.current?.cancel();
    },
    [],
  );

  if (!modalMounted) {
    return null;
  }

  return (
    <Modal visible={modalMounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          styles.modalRoot,
          {
            paddingTop: insets.top,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Calendar</Text>
          <View style={styles.modalHeaderSpacer} />
        </View>

        <View style={styles.monthNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => handleMonthStep(-1)}
            style={({ pressed }) => [styles.monthArrow, pressed ? styles.chipPressed : null]}
            hitSlop={6}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => handleMonthStep(1)}
            style={({ pressed }) => [styles.monthArrow, pressed ? styles.chipPressed : null]}
            hitSlop={6}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} style={styles.weekdayLabel}>
              {day}
            </Text>
          ))}
        </View>

        <View
          style={styles.monthBody}
          onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
        >
          {pagerHeight > 0 && gridReady && contentReady ? (
            <FlatList
              ref={pagerRef}
              data={pages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={keyMonthPage}
              initialScrollIndex={MONTH_PAGER_RADIUS}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onScroll={handleMonthScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={handleSettle}
              initialNumToRender={5}
              maxToRenderPerBatch={2}
              windowSize={5}
              onScrollToIndexFailed={({ index }) => {
                requestAnimationFrame(() => {
                  pagerRef.current?.scrollToOffset({ offset: width * index, animated: false });
                });
              }}
              renderItem={renderMonthPage}
            />
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── One swipeable day page (its own list + data) ───────────────────────────────

function DayLoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap} pointerEvents="none" accessibilityElementsHidden>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.skeletonGroup}>
          <View style={styles.skeletonSlotHeader} />
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonImage} />
            <View style={styles.skeletonBody}>
              <View style={styles.skeletonAccent} />
              <View style={styles.skeletonTextBlock}>
                <View style={[styles.skeletonLine, styles.skeletonTitleLine]} />
                <View style={[styles.skeletonLine, styles.skeletonMetaLine]} />
                <View style={[styles.skeletonLine, styles.skeletonStepsLine]} />
              </View>
              <View style={styles.skeletonPill} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function DayPagePlaceholder({ width, height }: { width: number; height: number }) {
  return (
    <View style={[styles.dayPagePlaceholder, { width, height: height || undefined }]}>
      <DayLoadingSkeleton />
    </View>
  );
}

function DayAssignmentsPage({
  date,
  width,
  height,
  ownerId,
  activeStatus,
  pastOverdueViews,
  coverByTask,
  coverThumbnailUriByTask,
  coverPreviewUriByTask,
  assignmentById,
  activeDates,
  today,
  bottomPadding,
  onOpen,
}: {
  date: Date;
  width: number;
  height: number;
  ownerId: string;
  activeStatus: StatusKey;
  /** Past week's unresolved occurrences (today's page, Show Overdue mode only). */
  pastOverdueViews: readonly TaskInstanceView[];
  coverByTask: Map<string, string | null | undefined>;
  coverThumbnailUriByTask: ReadonlyMap<string, string | null>;
  coverPreviewUriByTask: ReadonlyMap<string, string | null>;
  assignmentById: ReadonlyMap<string, TaskAssignment>;
  activeDates: ReadonlyMap<string, string>;
  today: Date;
  bottomPadding: number;
  onOpen: (view: TaskInstanceView) => void;
}) {
  const iso = toISODate(date);
  const viewsQuery = useTaskInstanceViews(ownerId, iso, iso);
  const instancesQuery = useTaskInstances(iso, iso);
  const statusOverrides = useOccurrenceStatuses();
  const resolvedAtOverrides = useOccurrenceResolvedAt();
  const instanceIdOverrides = useOccurrenceInstanceIds();

  // Pull-to-refresh: refetch every active query behind the calendar view — this
  // day's feed and instances plus the parent's day counts, task covers, and the
  // past-week overdue feed — so a manual pull reloads the whole page at once.
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Explicit start flow: pressing a card's To Do / "Start now" control asks for
  // confirmation (starting forfeits delete — only skip remains), then
  // materializes the occurrence and opens it. The in-memory overrides bridge
  // the gap until the invalidated feed refetch reports the occurrence as
  // non-virtual with its instanceId.
  const startInstance = useStartTaskInstance();
  const [startTarget, setStartTarget] = useState<TaskInstanceView | null>(null);
  const [startingKeys, setStartingKeys] = useState<ReadonlySet<string>>(new Set());

  const confirmStart = useCallback(
    (view: TaskInstanceView) => {
      const key = occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime);
      setStartTarget(null);
      setStartingKeys((current) => new Set(current).add(key));
      startInstance.mutate(
        {
          userId: ownerId,
          assignmentId: view.assignmentId,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
        },
        {
          onSuccess: (instance) => {
            // Starting releases the series frontier: mirror the materialized
            // instanceId and status into the in-memory overrides so the next
            // occurrence turns live and taps open the materialized view
            // before the feed refetches. Past-due occurrences stay OVERDUE —
            // the server derives the same, and mirroring IN_PROGRESS would
            // wrongly move the card into the To Do bucket (same derivation as
            // un-skip in TaskViewScreen).
            setOccurrenceInstanceId(key, instance.instanceId);
            const scheduledMs = new Date(view.scheduledFor).getTime();
            setOccurrenceStatus(
              key,
              Number.isFinite(scheduledMs) && Date.now() > scheduledMs
                ? 'OVERDUE'
                : 'IN_PROGRESS',
            );
            // Starting means "I'm doing this now" — go straight to the runner.
            onOpen({
              ...view,
              instanceId: instance.instanceId,
              status: instance.status,
              isVirtual: false,
            });
          },
          onError: (error) => {
            Alert.alert('Could not start this task', error.message);
          },
          onSettled: () => {
            setStartingKeys((current) => {
              const next = new Set(current);
              next.delete(key);
              return next;
            });
          },
        },
      );
    },
    [ownerId, startInstance, onOpen],
  );

  // "All done!" tap: every step is already complete on the backend, so a single
  // status update finishes the occurrence; the in-memory override moves the
  // card to the Done bucket instantly, ahead of the feed refetch.
  const updateStatus = useUpdateInstanceStatus();
  const [markDoneTarget, setMarkDoneTarget] = useState<TaskInstanceView | null>(null);
  const [finishingKeys, setFinishingKeys] = useState<ReadonlySet<string>>(new Set());
  const markDone = useCallback(
    (view: TaskInstanceView) => {
      const key = occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime);
      const instanceId = view.instanceId ?? instanceIdOverrides.get(key);
      if (!instanceId) {
        return;
      }
      setFinishingKeys((current) => new Set(current).add(key));
      updateStatus.mutate(
        { userId: ownerId, instanceId, status: 'COMPLETED' },
        {
          onSuccess: () => {
            setOccurrenceStatus(key, 'COMPLETED');
          },
          onError: (error) => {
            Alert.alert('Could not mark this task done', error.message);
          },
          onSettled: () => {
            setFinishingKeys((current) => {
              const next = new Set(current);
              next.delete(key);
              return next;
            });
          },
        },
      );
    },
    [ownerId, updateStatus, instanceIdOverrides],
  );

  const instanceResolvedAtByKey = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    for (const page of instancesQuery.data?.pages ?? []) {
      for (const instance of page.items) {
        map.set(
          occurrenceKey(instance.assignmentId, instance.scheduledDate, instance.scheduledTime),
          instance.completedAt ?? instance.skippedAt,
        );
      }
    }
    return map;
  }, [instancesQuery.data]);

  // minuteTick re-runs the memos below so liveStatus's wall-clock comparison
  // stays current (the to do → overdue flip at the scheduled moment).
  const minuteTick = useMinuteTick();
  const views = useMemo(() => {
    const result: TaskInstanceView[] = [];
    for (const view of viewsQuery.data?.items ?? []) {
      const override = statusOverrides.get(
        occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      );
      if (bucketOf(liveStatus(view, override ?? view.status)) === activeStatus) {
        result.push(view);
      }
    }
    return result;
  }, [viewsQuery.data, statusOverrides, activeStatus, minuteTick]);

  // Group the day's occurrences into hour slots (20:00 → "20:00 - 21:00") so
  // times read as ranges under prominent slot headers.
  const groups = useMemo(() => {
    const byHour = new Map<number, TaskInstanceView[]>();
    for (const view of views) {
      const hour = Number(view.scheduledTime.split(':')[0]) || 0;
      const list = byHour.get(hour);
      if (list) {
        list.push(view);
      } else {
        byHour.set(hour, [view]);
      }
    }
    return [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  }, [views]);

  const isLoading = viewsQuery.isLoading || !ownerId;
  const todayISO = toISODate(today);

  type DayRow =
    | { kind: 'loading'; key: string }
    | { kind: 'message'; key: string; message: string }
    | { kind: 'header'; key: string; hour: number }
    | {
        kind: 'dayheader';
        key: string;
        dayISO: string;
        label: string;
        /** "started/total" for the group, QQ-roster style. */
        count: string;
        expanded: boolean;
      }
    | { kind: 'task'; key: string; view: TaskInstanceView };

  // Collapsible past-day groups: an explicit tap wins; otherwise only the
  // default group is open. Session-only by design (resets on relaunch).
  const [groupToggles, setGroupToggles] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const toggleGroup = useCallback((dayISO: string, expanded: boolean) => {
    setGroupToggles((current) => {
      const next = new Map(current);
      next.set(dayISO, !expanded);
      return next;
    });
  }, []);

  const rows = useMemo<DayRow[]>(() => {
    // Show Overdue mode appends the past week's unresolved occurrences as
    // collapsible per-day groups, most recent day first (today's own
    // hour-slot groups stay on top, ungrouped).
    const pastRows: DayRow[] = [];
    if (activeStatus === 'overdue' && pastOverdueViews.length > 0) {
      const byDate = new Map<string, TaskInstanceView[]>();
      for (const view of pastOverdueViews) {
        const list = byDate.get(view.scheduledDate);
        if (list) {
          list.push(view);
        } else {
          byDate.set(view.scheduledDate, [view]);
        }
      }
      const sortedDays = [...byDate.keys()].sort().reverse();
      // Today's overdue already sits expanded above, so a default-open group
      // is only offered when today has none: the newest non-empty past day.
      const defaultExpandedDay = views.length > 0 ? null : sortedDays[0] ?? null;
      const yesterdayISO = toISODate(addDays(today, -1));
      for (const dayISO of sortedDays) {
        const dayViews = byDate.get(dayISO)!;
        dayViews.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
        const startedCount = dayViews.filter(
          (view) =>
            !view.isVirtual ||
            instanceIdOverrides.has(
              occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
            ),
        ).length;
        const expanded = groupToggles.get(dayISO) ?? dayISO === defaultExpandedDay;
        pastRows.push({
          kind: 'dayheader',
          key: `day-${dayISO}`,
          dayISO,
          label: `${dayISO === yesterdayISO ? 'Yesterday' : weekdayName(dayISO)} · ${monthDay(dayISO)}`,
          count: `${startedCount}/${dayViews.length}`,
          expanded,
        });
        if (expanded) {
          for (const view of dayViews) {
            pastRows.push({
              kind: 'task',
              key: `${view.assignmentId}-${view.scheduledFor}`,
              view,
            });
          }
        }
      }
    }

    if (isLoading) return [{ kind: 'loading', key: 'loading' }];
    if (viewsQuery.isError) {
      return [{ kind: 'message', key: 'error', message: 'Could not load this day’s tasks.' }];
    }
    if (views.length === 0 && pastRows.length === 0) {
      return [{ kind: 'message', key: 'empty', message: 'Nothing here for this day.' }];
    }

    const nextRows: DayRow[] = [];
    for (const [hour, groupViews] of groups) {
      nextRows.push({ kind: 'header', key: `header-${hour}`, hour });
      for (const view of groupViews) {
        nextRows.push({
          kind: 'task',
          key: `${view.assignmentId}-${view.scheduledFor}`,
          view,
        });
      }
    }
    nextRows.push(...pastRows);
    return nextRows;
  }, [
    groups,
    isLoading,
    views.length,
    viewsQuery.isError,
    activeStatus,
    pastOverdueViews,
    today,
    groupToggles,
    instanceIdOverrides,
  ]);

  // Pin hour-slot and day-group headers while their section scrolls
  // (QQ-roster style; an incoming header pushes the stuck one out).
  const stickyHeaderIndices = useMemo(() => {
    const indices: number[] = [];
    rows.forEach((row, index) => {
      if (row.kind === 'header' || row.kind === 'dayheader') {
        indices.push(index);
      }
    });
    return indices;
  }, [rows]);

  const renderRow = useCallback(
    ({ item }: { item: DayRow }) => {
      if (item.kind === 'loading') {
        return <DayLoadingSkeleton />;
      }
      if (item.kind === 'message') {
        return <Text style={styles.stateText}>{item.message}</Text>;
      }
      if (item.kind === 'header') {
        // Opaque wrapper so cards scroll cleanly underneath while stuck.
        return (
          <View style={styles.slotHeaderRow}>
            <Text style={styles.slotHeader}>{slotLabel(item.hour)}</Text>
          </View>
        );
      }
      if (item.kind === 'dayheader') {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: item.expanded }}
            accessibilityLabel={`${item.label}, ${item.count} tasks`}
            onPress={() => toggleGroup(item.dayISO, item.expanded)}
            style={({ pressed }) => [
              styles.dayGroupHeader,
              pressed ? styles.dayGroupHeaderPressed : null,
            ]}
          >
            <Ionicons
              name={item.expanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.textMuted}
            />
            <Text style={styles.dayGroupLabel}>{item.label}</Text>
            <Text style={styles.dayGroupCount}>{item.count}</Text>
          </Pressable>
        );
      }

      const view = item.view;
      const key = occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime);
      const override = statusOverrides.get(key);
      const resolvedAt = resolvedAtOverrides.get(key) ?? instanceResolvedAtByKey.get(key);
      const wasOverdue =
        (activeStatus === 'done' || activeStatus === 'skipped') &&
        isResolvedAfterScheduled(view, resolvedAt);
      const assignment = assignmentById.get(view.assignmentId);
      const isRecurring = assignment?.scheduleType === 'RECURRING';
      const activeDate = activeDates.get(view.assignmentId);
      const state = occurrenceState({
        scheduledDate: view.scheduledDate,
        status: liveStatus(view, override ?? view.status),
        activeDate,
        todayISO,
      });
      const handlePress =
        state === 'gray'
          ? () =>
              Alert.alert(
                'Not active yet',
                activeDate
                  ? `This day hasn’t started in the series yet — it’s not materialized. Open the current task on ${formatShortDate(activeDate)} to delete this or all future occurrences.`
                  : 'This day hasn’t started in the series yet — it’s not materialized. Open the current task to delete this or all future occurrences.',
              )
          : () => onOpen(view);

      return (
        <AssignmentCard
          view={view}
          bucket={activeStatus}
          wasOverdue={wasOverdue}
          ownerId={ownerId}
          coverAssetId={coverByTask.get(view.taskId)}
          coverUri={coverThumbnailUriByTask.get(view.taskId) ?? null}
          coverPreviewUri={coverPreviewUriByTask.get(view.taskId) ?? null}
          state={state}
          isRecurring={isRecurring}
          repeatLabel={isRecurring ? describeRepeat(assignment) : undefined}
          todayISO={todayISO}
          started={!view.isVirtual || instanceIdOverrides.has(key)}
          starting={startingKeys.has(key)}
          finishing={finishingKeys.has(key)}
          onStart={() => setStartTarget(view)}
          onMarkDone={() => setMarkDoneTarget(view)}
          onPress={handlePress}
        />
      );
    },
    [
      activeDates,
      activeStatus,
      assignmentById,
      coverByTask,
      coverThumbnailUriByTask,
      coverPreviewUriByTask,
      finishingKeys,
      instanceResolvedAtByKey,
      markDone,
      onOpen,
      ownerId,
      resolvedAtOverrides,
      instanceIdOverrides,
      startingKeys,
      statusOverrides,
      todayISO,
      minuteTick,
      toggleGroup,
    ],
  );

  return (
    <>
      <FlatList
        style={{ width, height: height || undefined }}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderRow}
        stickyHeaderIndices={stickyHeaderIndices.length > 0 ? stickyHeaderIndices : undefined}
        // Sticky group headers break under cell recycling (rows blank out
        // near the end and scroll-up jumps back to the group top), so with
        // groups present every row stays mounted — collapsed groups keep the
        // row count small. The plain ungrouped day keeps the lean window.
        initialNumToRender={stickyHeaderIndices.length > 0 ? rows.length : 6}
        maxToRenderPerBatch={stickyHeaderIndices.length > 0 ? rows.length : 4}
        windowSize={stickyHeaderIndices.length > 0 ? 31 : 5}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
      <ConfirmDialog
        visible={startTarget !== null}
        title="Start this task?"
        message="Once you start, this task can't be deleted anymore — it can only be skipped."
        confirmLabel="Start"
        cancelLabel="Cancel"
        onConfirm={() => startTarget && confirmStart(startTarget)}
        onCancel={() => setStartTarget(null)}
      />
      <ConfirmDialog
        visible={markDoneTarget !== null}
        title="All steps done!"
        message="Great work — do you want to mark this task as done now?"
        confirmLabel="Mark as done"
        cancelLabel="Later"
        onConfirm={() => {
          if (markDoneTarget) {
            markDone(markDoneTarget);
          }
          setMarkDoneTarget(null);
        }}
        onCancel={() => setMarkDoneTarget(null)}
      />
    </>
  );
}

const MemoDayAssignmentsPage = memo(DayAssignmentsPage);

export default function CalendarScreen() {
  const navigation = useNavigation<CalendarNavigation>();
  const route = useRoute<CalendarRoute>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Caregiver delegated view: a linked primary user's calendar, opened from the
  // patient overview. The caregiver's own Simple Mode / launch simplifications
  // must not shape a delegated view (see effective settings below).
  const managedOwnerId = route.params?.ownerId;
  const managingName = route.params?.managingName;
  const managed = Boolean(managedOwnerId);

  const [ownerId, setOwnerId] = useState(managedOwnerId ?? '');
  const [selected, setSelected] = useState(() => new Date());
  const [visualSelected, setVisualSelected] = useState(() => new Date());
  const [activeStatus, setActiveStatus] = useState<StatusKey>(() =>
    managed ? 'todo' : initialCalendarTab(),
  );
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [addChoiceVisible, setAddChoiceVisible] = useState(false);
  const [pagerHeight, setPagerHeight] = useState(0);

  useEffect(() => {
    // Managed mode: the owner is the primary user from the route.
    if (managedOwnerId) {
      setOwnerId(managedOwnerId);
      return;
    }
    let mounted = true;
    void getCurrentUserId().then((id) => {
      if (mounted) {
        setOwnerId(id);
      }
    });
    return () => {
      mounted = false;
    };
  }, [managedOwnerId]);

  const today = useToday();
  const selectedISO = toISODate(selected);
  const settings = useInterfaceSettings();
  const { startingPage, showOverdue, onlyToday } = settings;
  // A delegated calendar always runs as the full, date-navigable calendar; the
  // caregiver's own Simple Mode / date-lock never applies to another person.
  const simpleMode = settings.simpleMode && !managed;
  const allowChangingDate = managed ? true : settings.allowChangingDate;

  // Show Overdue on Launch data scope: the locked Simple Mode calendar's
  // Overdue tab also carries the past week's unresolved occurrences. Only
  // Show Today's Tasks fully suppresses this.
  const includePastOverdue =
    simpleMode &&
    startingPage === 'CALENDAR' &&
    !allowChangingDate &&
    showOverdue &&
    !onlyToday;

  // Simple Mode: no back, no add — only a settings gear guarded by the same
  // 3-tap sequence as the simple All Tasks screen (accidental-tap protection).
  const openSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
  const { handleSettingsTap, settingsHint } = useSettingsTapGate(openSettings);

  const dayViewsQuery = useTaskInstanceViews(ownerId, selectedISO, selectedISO);
  const tasksQuery = useTasksByOwner(ownerId);
  const assignmentsQuery = useAssignmentsForUser(ownerId);

  // assignmentId → its assignment, for the card's repeat icon + type label.
  const assignmentById = useMemo(() => {
    const map = new Map<string, TaskAssignment>();
    for (const page of assignmentsQuery.data?.pages ?? []) {
      for (const assignment of page.items) {
        map.set(assignment.assignmentId, assignment);
      }
    }
    return map;
  }, [assignmentsQuery.data]);

  // assignmentId → the series' current active occurrence date (earliest
  // uncompleted on/after today). Drives the three-state visual + delete rules.
  const activeDates = useSeriesActiveDates(ownerId);

  // taskId → cover asset id, used by both the cards and the month thumbnails.
  const coverByTask = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    for (const page of tasksQuery.data?.pages ?? []) {
      for (const task of page.items) {
        map.set(task.taskId, task.coverImageAssetId);
      }
    }
    return map;
  }, [tasksQuery.data]);

  // Distinct (taskId, assetId) covers to prewarm off-screen (one per task, not
  // per day) so the month grid opens with URLs + bytes already cached.
  const prewarmCovers = useMemo(() => {
    const list: Array<{ taskId: string; assetId: string }> = [];
    for (const [taskId, assetId] of coverByTask) {
      if (assetId) list.push({ taskId, assetId });
    }
    return list;
  }, [coverByTask]);

  // One URL query per distinct task cover, resolved here and passed down as
  // plain strings — month-grid cells render with zero hooks of their own.
  const coverUriByTask = useMediaDownloadUrlMap(prewarmCovers);
  const coverThumbnailUriByTask = useCoverThumbnailUriMap(prewarmCovers, coverUriByTask);
  const coverPreviewUriByTask = useCoverPreviewUriMap(prewarmCovers, coverUriByTask);

  // UI-only status overrides (mark done / skip from the runner) win over the
  // server status so the occurrence moves buckets within the session.
  const statusOverrides = useOccurrenceStatuses();
  const instanceIdOverrides = useOccurrenceInstanceIds();
  // minuteTick keeps the bucket split (and the footer counts) flipping to do →
  // overdue live as scheduled moments pass.
  const minuteTick = useMinuteTick();

  // The past week's feed, fetched only in Show Overdue mode (empty ownerId
  // disables the query otherwise).
  const pastOverdueQuery = useTaskInstanceViews(
    includePastOverdue ? ownerId : '',
    toISODate(addDays(today, -PAST_OVERDUE_DAYS)),
    toISODate(addDays(today, -1)),
  );
  const pastOverdueViews = useMemo(() => {
    if (!includePastOverdue) {
      return NO_PAST_OVERDUE;
    }
    return (pastOverdueQuery.data?.items ?? []).filter((view) => {
      const override = statusOverrides.get(
        occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      );
      return liveStatus(view, override ?? view.status) === 'OVERDUE';
    });
  }, [includePastOverdue, pastOverdueQuery.data, statusOverrides, minuteTick]);

  const buckets = useMemo(() => {
    const result: Record<StatusKey, TaskInstanceView[]> = {
      overdue: [],
      todo: [],
      done: [],
      skipped: [],
    };
    for (const view of dayViewsQuery.data?.items ?? []) {
      const override = statusOverrides.get(
        occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      );
      const key = bucketOf(liveStatus(view, override ?? view.status));
      if (key) {
        result[key].push(view);
      }
    }
    // Footer count stays in step with the Overdue tab's list content.
    result.overdue.push(...pastOverdueViews);
    return result;
  }, [dayViewsQuery.data, statusOverrides, minuteTick, pastOverdueViews]);

  // Horizontal pager: keep three weeks of lightweight positions, but render
  // real task pages only for dates the user has actually opened.
  const pagerRef = useRef<FlatList<Date>>(null);
  const dayCommitFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const initialWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const initialDayPagerIndex = useMemo(
    () => dayPagerIndexForDate(new Date(), initialWeekStart),
    [initialWeekStart],
  );
  const visualDateKeyRef = useRef(selectedISO);
  const visualDayPagerIndexRef = useRef(initialDayPagerIndex);
  const pendingDayPagerIndexRef = useRef<number | null>(null);
  const programmaticDayScrollRef = useRef(false);
  const [dayPagerBase, setDayPagerBase] = useState(() => initialWeekStart);
  const mountedDaysKey = useMemo(() => mountedDaysStoreKey(ownerId), [ownerId]);
  const mountedDayPageKeys = useCalendarMountedDays(mountedDaysKey, selectedISO);
  const pages = useMemo(
    () =>
      Array.from({ length: DAY_PAGER_PAGE_COUNT }, (_, index) =>
        addDays(dayPagerBase, index - DAY_PAGER_SIDE_BUFFER),
      ),
    [dayPagerBase],
  );
  const markDayPageMounted = useCallback(
    (date: Date) => {
      markCalendarDayMounted(mountedDaysKey, toISODate(date));
    },
    [mountedDaysKey],
  );

  const updateVisualSelectedDate = useCallback(
    (date: Date) => {
      const dateKey = toISODate(date);
      if (visualDateKeyRef.current === dateKey) return;
      visualDateKeyRef.current = dateKey;
      setVisualSelected(date);
      markDayPageMounted(date);
    },
    [markDayPageMounted],
  );

  const scheduleSelectedCommit = useCallback((target: Date) => {
    if (dayCommitFrameRef.current) {
      cancelAnimationFrame(dayCommitFrameRef.current);
    }
    dayCommitFrameRef.current = requestAnimationFrame(() => {
      dayCommitFrameRef.current = null;
      setSelected(target);
    });
  }, []);

  const handleDayPagerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (programmaticDayScrollRef.current) return;
      const index = Math.max(
        0,
        Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
      );
      if (visualDayPagerIndexRef.current === index) return;
      const date = pages[index];
      if (!date) return;
      visualDayPagerIndexRef.current = index;
      updateVisualSelectedDate(date);
    },
    [pages, updateVisualSelectedDate, width],
  );

  const handlePagerSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
      const date = pages[index];
      if (date) {
        const targetWeekStart = startOfWeek(date);
        const targetIndex = dayPagerIndexForDate(date, targetWeekStart);
        markDayPageMounted(date);
        programmaticDayScrollRef.current = false;
        const shouldRebase =
          index <= DAY_PAGER_REBASE_EDGE || index >= pages.length - 1 - DAY_PAGER_REBASE_EDGE;
        if (shouldRebase && toISODate(targetWeekStart) !== toISODate(dayPagerBase)) {
          pendingDayPagerIndexRef.current = targetIndex;
          setDayPagerBase(targetWeekStart);
        }
        visualDayPagerIndexRef.current = index;
        updateVisualSelectedDate(date);
        scheduleSelectedCommit(date);
      }
    },
    [dayPagerBase, markDayPageMounted, pages, scheduleSelectedCommit, updateVisualSelectedDate, width],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      if (isSameDay(date, visualSelected)) return;
      const targetWeekStart = startOfWeek(date);
      const index = dayPagerIndexForDate(date, targetWeekStart);
      visualDayPagerIndexRef.current = index;
      updateVisualSelectedDate(date);
      markDayPageMounted(date);
      programmaticDayScrollRef.current = true;
      if (toISODate(targetWeekStart) !== toISODate(dayPagerBase)) {
        pendingDayPagerIndexRef.current = index;
        setDayPagerBase(targetWeekStart);
      } else {
        pagerRef.current?.scrollToIndex({ index, animated: false });
        requestAnimationFrame(() => {
          programmaticDayScrollRef.current = false;
        });
      }
      scheduleSelectedCommit(date);
    },
    [dayPagerBase, markDayPageMounted, scheduleSelectedCommit, updateVisualSelectedDate, visualSelected],
  );

  useEffect(() => {
    const pendingIndex = pendingDayPagerIndexRef.current;
    if (pendingIndex === null) return;
    pendingDayPagerIndexRef.current = null;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({ index: pendingIndex, animated: false });
      visualDayPagerIndexRef.current = pendingIndex;
      requestAnimationFrame(() => {
        programmaticDayScrollRef.current = false;
      });
    });
  }, [pages]);

  useEffect(
    () => () => {
      if (dayCommitFrameRef.current) {
        cancelAnimationFrame(dayCommitFrameRef.current);
      }
    },
    [],
  );

  // "Allow Changing Date in Calendar" off → the calendar is pinned to today:
  // week strip and month picker are hidden, the day pager can't swipe, and
  // this effect snaps back to today (also following it across midnight).
  useEffect(() => {
    if (!allowChangingDate && !isSameDay(visualSelected, today)) {
      handleSelectDate(today);
    }
  }, [allowChangingDate, visualSelected, today, handleSelectDate]);

  const openOccurrence = useCallback(
    (view: TaskInstanceView) => {
      // The views feed can lag a just-made start or status change (the chip
      // already flipped via the in-memory overrides, but the cached view still
      // says virtual/TO_DO) — resolve through the overrides so a tap in that
      // window opens the materialized state, not the stale one.
      const key = occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime);
      const instanceId = view.instanceId ?? instanceIdOverrides.get(key);
      const status = liveStatus(view, statusOverrides.get(key) ?? view.status);
      // Future occurrences are preview-only → occurrence detail. Today/past open
      // the step "runner" (TaskView in instance mode).
      if (view.scheduledDate > toISODate(today)) {
        navigation.navigate('OccurrenceDetail', {
          assignmentId: view.assignmentId,
          taskId: view.taskId,
          taskTitle: view.title,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
          status,
          isVirtual: view.isVirtual && !instanceId,
          ownerId: managedOwnerId,
          managingName,
        });
      } else {
        navigation.navigate('TaskView', {
          taskId: view.taskId,
          assignmentId: view.assignmentId,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
          scheduledFor: view.scheduledFor,
          instanceId,
          status,
          ownerId: managedOwnerId,
          managingName,
        });
      }
    },
    [navigation, today, instanceIdOverrides, statusOverrides, managedOwnerId, managingName],
  );

  const weekStart = useMemo(() => startOfWeek(visualSelected), [visualSelected]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.topArea, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          {!simpleMode ? (
            <BackButton onPress={() => navigation.goBack()} variant="dark" />
          ) : (
            // Invisible mirror of the right-side buttons (44pt each + row gap)
            // so the centered title sits on the true screen centerline.
            <View style={{ width: allowChangingDate ? 88 + spacing.sm : 44 }} />
          )}
          {simpleMode && settingsHint ? (
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.headerSettingsHint}
            >
              {settingsHint}
            </Text>
          ) : (
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.headerTitle, simpleMode ? styles.headerTitleCentered : null]}
            >
              Calendar
            </Text>
          )}
          {allowChangingDate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open month calendar"
              onPress={() => setMonthPickerVisible(true)}
              style={({ pressed }) => [styles.eyeButton, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Ionicons name="eye-outline" size={24} color={colors.text} />
            </Pressable>
          ) : null}
          {simpleMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={handleSettingsTap}
              style={({ pressed }) => [styles.eyeButton, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a task"
              onPress={() => setAddChoiceVisible(true)}
              style={({ pressed }) => [styles.addButton, pressed ? styles.addButtonPressed : null]}
            >
              <Ionicons name="add" size={30} color={colors.onPrimary} />
            </Pressable>
          )}
        </View>

        {managed && managingName ? (
          <Text style={styles.managingBanner} numberOfLines={1}>
            Managing {managingName}
          </Text>
        ) : null}

        {!allowChangingDate ? (
          <Text
            accessibilityRole="header"
            accessibilityLabel={`Today, ${formatShortDate(toISODate(today))}`}
            style={styles.lockedTodayLabel}
          >
            {formatShortDate(toISODate(today))}
          </Text>
        ) : (
        <View style={styles.weekStrip}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, visualSelected);
            const isToday = isSameDay(day, today);
            const highlightColor = isToday ? colors.danger : colors.text;
            return (
              <Pressable
                key={day.toISOString()}
                accessibilityRole="button"
                accessibilityLabel={day.toDateString()}
                accessibilityState={{ selected: isSelected }}
                onPress={() => handleSelectDate(day)}
                style={styles.weekCell}
              >
                <Text
                  style={[
                    styles.weekCellWeekday,
                    isToday && !isSelected ? styles.weekCellToday : null,
                  ]}
                >
                  {WEEKDAYS[day.getDay()]}
                </Text>
                <View
                  style={[
                    styles.weekCellCircle,
                    isSelected ? { backgroundColor: highlightColor } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.weekCellDay,
                      isToday && !isSelected ? styles.weekCellToday : null,
                      isSelected ? styles.weekCellDaySelected : null,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        )}
      </View>

      <View
        style={styles.listWrap}
        onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
      >
        {pagerHeight > 0 ? (
          <FlatList
            ref={pagerRef}
            data={pages}
            horizontal
            pagingEnabled
            // Locked to today: swiping between days is date changing too.
            scrollEnabled={allowChangingDate}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(date) => toISODate(date)}
            initialScrollIndex={initialDayPagerIndex}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onScrollBeginDrag={() => {
              programmaticDayScrollRef.current = false;
            }}
            onScroll={handleDayPagerScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handlePagerSettle}
            initialNumToRender={3}
            maxToRenderPerBatch={2}
            windowSize={7}
            removeClippedSubviews={false}
            extraData={mountedDayPageKeys}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                pagerRef.current?.scrollToOffset({ offset: width * index, animated: false });
              });
            }}
            renderItem={({ item }) =>
              mountedDayPageKeys.has(toISODate(item)) ? (
                <MemoDayAssignmentsPage
                  date={item}
                  width={width}
                  height={pagerHeight}
                  ownerId={ownerId}
                  activeStatus={activeStatus}
                  pastOverdueViews={
                    isSameDay(item, today) ? pastOverdueViews : NO_PAST_OVERDUE
                  }
                  coverByTask={coverByTask}
                  coverThumbnailUriByTask={coverThumbnailUriByTask}
                  coverPreviewUriByTask={coverPreviewUriByTask}
                  assignmentById={assignmentById}
                  activeDates={activeDates}
                  today={today}
                  bottomPadding={insets.bottom + spacing.xxl}
                  onOpen={openOccurrence}
                />
              ) : (
                <DayPagePlaceholder width={width} height={pagerHeight} />
              )
            }
          />
        ) : null}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label}, ${buckets[tab.key].length}`}
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveStatus(tab.key)}
              style={styles.bottomTab}
            >
              <Text style={[styles.bottomLabel, isActive ? styles.bottomLabelActive : null]}>
                {tab.label}
              </Text>
              <Text style={[styles.bottomCount, isActive ? styles.bottomCountActive : null]}>
                {buckets[tab.key].length}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CoverPrewarmer covers={prewarmCovers} />

      <MonthPickerModal
        visible={monthPickerVisible}
        ownerId={ownerId}
        initialDate={visualSelected}
        coverByTask={coverByTask}
        coverUriByTask={coverThumbnailUriByTask}
        activeDates={activeDates}
        today={today}
        onClose={() => setMonthPickerVisible(false)}
        onSelectDay={(date) => {
          handleSelectDate(date);
          setMonthPickerVisible(false);
        }}
      />

      <Modal
        visible={addChoiceVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddChoiceVisible(false)}
      >
        <View style={styles.choiceBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close"
            onPress={() => setAddChoiceVisible(false)}
          />
          <View style={[styles.choiceSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.choiceTitle}>Add to calendar</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose an existing task"
              onPress={() => {
                setAddChoiceVisible(false);
                // Delegated: browse the caregiver's OWN templates, but carry the
                // patient forward so the assignment is scheduled FOR them.
                navigation.navigate('SelectTask', {
                  assignForUserId: managedOwnerId,
                  managingName,
                });
              }}
              style={({ pressed }) => [styles.choiceButton, pressed ? styles.choiceButtonPressed : null]}
            >
              <Ionicons name="list-outline" size={22} color={colors.primary} />
              <Text style={styles.choiceButtonText}>Choose an existing task</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start from scratch"
              onPress={() => {
                setAddChoiceVisible(false);
                // Delegated: author the template under the caregiver (self), then
                // schedule it FOR the patient.
                navigation.navigate('CreateTask', {
                  scheduleAfterCreate: true,
                  assignForUserId: managedOwnerId,
                  managingName,
                });
              }}
              style={({ pressed }) => [styles.choiceButton, pressed ? styles.choiceButtonPressed : null]}
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.choiceButtonText}>Start from scratch</Text>
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
  topArea: {
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    marginLeft: spacing.sm,
    ...typography.title,
    color: colors.text,
  },
  headerTitleCentered: {
    textAlign: 'center',
  },
  // Delegated context strip — mirrors the caregiver overview "Managing {name}".
  managingBanner: {
    marginTop: spacing.sm,
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: 'center',
  },
  // 3-tap settings hint — same look as the simple All Tasks header prompt.
  headerSettingsHint: {
    flex: 1,
    marginLeft: spacing.sm,
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
  },
  eyeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.cardStrong,
  },
  addButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  chipPressed: {
    backgroundColor: colors.border,
  },
  weekStrip: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  // Replaces the week strip when date changing is disabled: just today's date.
  lockedTodayLabel: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekCellWeekday: {
    ...typography.caption,
    color: colors.textMuted,
  },
  weekCellToday: {
    color: colors.danger,
  },
  weekCellCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCellDay: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  weekCellDaySelected: {
    color: colors.onPrimary,
  },
  listWrap: {
    flex: 1,
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  stateBox: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.xxl,
  },
  dayPagePlaceholder: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  skeletonWrap: {
    gap: spacing.lg,
  },
  skeletonGroup: {
    gap: spacing.md,
  },
  skeletonSlotHeader: {
    width: 170,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceWarm,
  },
  skeletonCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  skeletonImage: {
    height: 130,
    backgroundColor: colors.surfaceWarm,
  },
  skeletonBody: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 96,
  },
  skeletonAccent: {
    width: 6,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  skeletonTextBlock: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceWarm,
  },
  skeletonTitleLine: {
    width: '58%',
    height: 24,
  },
  skeletonMetaLine: {
    width: '44%',
  },
  skeletonStepsLine: {
    width: '30%',
  },
  skeletonPill: {
    width: 82,
    height: 32,
    borderRadius: radius.pill,
    marginRight: spacing.lg,
    backgroundColor: colors.surfaceWarm,
  },
  slotGroup: {
    gap: spacing.md,
  },
  slotHeader: {
    ...typography.heading,
    color: colors.text,
  },
  slotHeaderRow: {
    backgroundColor: colors.bg,
    paddingVertical: spacing.xs,
  },
  // Collapsible past-day group header. Opaque background so cards scroll
  // cleanly underneath while it's stuck to the top.
  dayGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    paddingVertical: spacing.sm,
  },
  dayGroupHeaderPressed: {
    opacity: 0.6,
  },
  dayGroupLabel: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  dayGroupCount: {
    ...typography.body,
    color: colors.textMuted,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  taskCardPressed: {
    opacity: 0.85,
  },
  taskCardGray: {
    opacity: 0.5,
  },
  taskImage: {
    height: 112,
  },
  coverPlaceholder: {
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverDimmed: {
    opacity: 0.4,
  },
  // Off-screen, zero-footprint layer that mounts cover images purely to warm the
  // URL + byte caches; positioned far off-screen and non-interactive.
  prewarmLayer: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    width: 0,
    height: 0,
    opacity: 0,
  },
  prewarmPixel: {
    width: 1,
    height: 1,
  },
  taskBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  compactTaskMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  compactTaskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  compactTaskThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  taskAccent: {
    width: 6,
    alignSelf: 'stretch',
  },
  taskTextWrap: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  compactTaskTextWrap: {
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  taskTitle: {
    ...typography.heading,
    color: colors.text,
  },
  taskTitleFuture: {
    color: colors.textMuted,
  },
  taskTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  taskMetaInline: {
    marginTop: 0,
  },
  taskStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statusTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  // Pressable start control — icon + raised shadow so it reads as a button,
  // unlike the flat status chips around it.
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  startButtonPressed: {
    opacity: 0.72,
  },
  startButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  // Static "In progress" state after starting (teal, matching step progress).
  inProgressTag: {
    backgroundColor: '#3DB8AD',
  },
  // "All done!" reuses the start-button treatment in the progress teal.
  allDoneButton: {
    backgroundColor: '#3DB8AD',
  },
  statusTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusTagColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  statusTagText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bottomLabel: {
    ...typography.bodyStrong,
    color: colors.textMuted,
  },
  bottomLabelActive: {
    color: colors.primary,
  },
  bottomCount: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  bottomCountActive: {
    color: colors.primary,
  },
  // Month picker modal
  modalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalCancel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  modalTitle: {
    ...typography.heading,
    color: colors.text,
  },
  modalHeaderSpacer: {
    width: 54,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  monthArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    ...typography.heading,
    fontSize: 22,
    color: colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    ...typography.caption,
    color: colors.textMuted,
  },
  monthBody: {
    flex: 1,
  },
  modalGridContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  monthCell: {
    width: `${100 / 7}%`,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCellToday: {
    zIndex: 10,
    elevation: 10,
  },
  thumbGrayVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(181,175,165,0.72)',
  },
  monthThumb: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -THUMB_SIZE / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
  },
  monthDayBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 12,
    elevation: 12,
  },
  monthTodayHalo: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.danger,
    backgroundColor: 'transparent',
    shadowColor: colors.danger,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 11,
    elevation: 11,
  },
  monthDayText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  monthDayTextOnImage: {
    color: colors.onPrimary,
  },
  // Add-to-calendar choice sheet
  choiceBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  choiceSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  choiceTitle: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 64,
    ...shadow.card,
  },
  choiceButtonPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  choiceButtonText: {
    ...typography.heading,
    color: colors.text,
  },
});
