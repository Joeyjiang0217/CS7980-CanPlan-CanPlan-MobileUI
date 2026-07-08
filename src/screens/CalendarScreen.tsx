import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { getTaskInstanceViews } from '../features/assignments/api/assignmentApi';
import {
  useAssignmentsForUser,
  useTaskInstanceViews,
} from '../features/assignments/hooks/useAssignments';
import {
  occurrenceState,
  useSeriesActiveDates,
  type OccurrenceLifeState,
} from '../features/assignments/hooks/useSeriesActiveDates';
import {
  occurrenceKey,
  useCompletedSteps,
  useOccurrenceStatuses,
} from '../features/assignments/occurrenceCompletion';
import { describeRepeat } from '../features/assignments/repeat';
import {
  useCoverPreviewUriMap,
  useCoverThumbnailUriMap,
} from '../features/media/hooks/useCoverThumbnails';
import { useMediaDownloadUrl, useMediaDownloadUrlMap } from '../features/media/hooks/useMedia';
import { useTasksByOwner, useTaskSteps } from '../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../navigation/types';
import { getCurrentUserId } from '../shared/api/authTokenProvider';
import type {
  TaskAssignment,
  TaskInstanceStatus,
  TaskInstanceView,
} from '../shared/api/canplanTypes';
import BackButton from '../shared/components/BackButton';
import CachedImage from '../shared/components/CachedImage';
import { queryKeys } from '../shared/query/queryKeys';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type CalendarNavigation = NativeStackNavigationProp<MainStackParamList, 'Calendar'>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StatusKey = 'overdue' | 'todo' | 'done' | 'skipped';

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
function bucketOf(status: TaskInstanceStatus): StatusKey | null {
  switch (status) {
    case 'OVERDUE':
      return 'overdue';
    case 'TO_DO':
    case 'IN_PROGRESS':
      return 'todo';
    case 'COMPLETED':
      return 'done';
    case 'SKIPPED':
      return 'skipped';
    default:
      return null;
  }
}

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
  coverAssetId,
  coverUri,
  coverPreviewUri,
  state,
  isRecurring,
  repeatLabel,
  todayISO,
  onPress,
}: {
  view: TaskInstanceView;
  bucket: StatusKey;
  coverAssetId?: string | null;
  coverUri?: string | null;
  coverPreviewUri?: string | null;
  state: OccurrenceLifeState;
  isRecurring: boolean;
  /** Recurrence type (e.g. "Daily") shown next to the time; omitted for one-time. */
  repeatLabel?: string;
  todayISO: string;
  onPress: () => void;
}) {
  // "Gray" occurrences (projected days after the active one) are inert: dimmed
  // and not tappable. Completed/skipped ones read as done (strikethrough title).
  const isGray = state === 'gray';
  const isDone = bucket === 'done' || bucket === 'skipped';
  const useHeroImage = !isGray && bucket === 'todo' && view.scheduledDate === todayISO;
  const heroCoverUri = coverPreviewUri ?? coverUri;
  // Step completion progress is what distinguishes an assignment occurrence from
  // a plain task: total comes from the real task steps, done from the (UI-only)
  // occurrence completion store.
  const stepsQuery = useTaskSteps(view.taskId);
  const totalSteps = stepsQuery.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0;
  const completed = useCompletedSteps(
    occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
  );
  const doneSteps = stepsQuery.data
    ? (stepsQuery.data.pages.flatMap((page) => page.items).filter((s) => completed.has(s.stepId))
        .length)
    : 0;

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
      <Text numberOfLines={1} style={styles.taskMeta}>
        {doneSteps}/{totalSteps} steps
      </Text>
    </View>
  );

  // Once an occurrence is resolved we lose its OVERDUE status, so infer "was
  // overdue" from a done/skipped occurrence whose scheduled slot has passed —
  // and keep an Overdue badge to the right of the Done/Skipped one.
  const wasOverdue =
    (bucket === 'done' || bucket === 'skipped') &&
    new Date(view.scheduledFor).getTime() < Date.now();

  const statusTags = [
    <View key={bucket} style={[styles.statusTag, { backgroundColor: STATUS_ACCENT[bucket] }]}>
      <Text style={styles.statusTagText}>{STATUS_LABEL[bucket]}</Text>
    </View>,
    wasOverdue ? (
      <View key="overdue" style={[styles.statusTag, { backgroundColor: STATUS_ACCENT.overdue }]}>
        <Text style={styles.statusTagText}>{STATUS_LABEL.overdue}</Text>
      </View>
    ) : null,
  ].filter(Boolean);
  const statusTag = <View style={styles.statusTagRow}>{statusTags}</View>;
  const compactStatusTag = (
    <View style={[styles.statusTagRow, wasOverdue ? styles.statusTagColumn : null]}>
      {statusTags}
    </View>
  );

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
              <Text numberOfLines={1} style={styles.taskMeta}>
                {doneSteps}/{totalSteps} steps
              </Text>
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
              style={styles.monthCell}
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

  const handleSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      const maxIndex = pages.length - 1;
      setCurrentIndex(Math.max(0, Math.min(maxIndex, page)));
      finishButtonPaging();
    },
    [finishButtonPaging, pages.length, width],
  );

  const handleMonthStep = useCallback(
    (step: -1 | 1) => {
      if (pagingFromButtonRef.current) return;
      if (!pagerRef.current || pagerHeight <= 0 || !gridReady) {
        setCurrentIndex((index) => Math.max(0, Math.min(pages.length - 1, index + step)));
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
  const statusOverrides = useOccurrenceStatuses();

  const views = useMemo(() => {
    const result: TaskInstanceView[] = [];
    for (const view of viewsQuery.data?.items ?? []) {
      const override = statusOverrides.get(
        occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      );
      if (bucketOf(override ?? view.status) === activeStatus) {
        result.push(view);
      }
    }
    return result;
  }, [viewsQuery.data, statusOverrides, activeStatus]);

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
    | { kind: 'task'; key: string; view: TaskInstanceView };

  const rows = useMemo<DayRow[]>(() => {
    if (isLoading) return [{ kind: 'loading', key: 'loading' }];
    if (viewsQuery.isError) {
      return [{ kind: 'message', key: 'error', message: 'Could not load this day’s tasks.' }];
    }
    if (views.length === 0) {
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
    return nextRows;
  }, [groups, isLoading, views.length, viewsQuery.isError]);

  const renderRow = useCallback(
    ({ item }: { item: DayRow }) => {
      if (item.kind === 'loading') {
        return <DayLoadingSkeleton />;
      }
      if (item.kind === 'message') {
        return <Text style={styles.stateText}>{item.message}</Text>;
      }
      if (item.kind === 'header') {
        return <Text style={styles.slotHeader}>{slotLabel(item.hour)}</Text>;
      }

      const view = item.view;
      const override = statusOverrides.get(
        occurrenceKey(view.assignmentId, view.scheduledDate, view.scheduledTime),
      );
      const assignment = assignmentById.get(view.assignmentId);
      const isRecurring = assignment?.scheduleType === 'RECURRING';
      const activeDate = activeDates.get(view.assignmentId);
      const state = occurrenceState({
        scheduledDate: view.scheduledDate,
        status: override ?? view.status,
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
          coverAssetId={coverByTask.get(view.taskId)}
          coverUri={coverThumbnailUriByTask.get(view.taskId) ?? null}
          coverPreviewUri={coverPreviewUriByTask.get(view.taskId) ?? null}
          state={state}
          isRecurring={isRecurring}
          repeatLabel={isRecurring ? describeRepeat(assignment) : undefined}
          todayISO={todayISO}
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
      onOpen,
      statusOverrides,
      todayISO,
    ],
  );

  return (
    <FlatList
      style={{ width, height: height || undefined }}
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={5}
      showsVerticalScrollIndicator={false}
    />
  );
}

const MemoDayAssignmentsPage = memo(DayAssignmentsPage);

export default function CalendarScreen() {
  const navigation = useNavigation<CalendarNavigation>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [ownerId, setOwnerId] = useState('');
  const [selected, setSelected] = useState(() => new Date());
  const [visualSelected, setVisualSelected] = useState(() => new Date());
  const [activeStatus, setActiveStatus] = useState<StatusKey>('todo');
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [addChoiceVisible, setAddChoiceVisible] = useState(false);
  const [pagerHeight, setPagerHeight] = useState(0);

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

  const today = useMemo(() => new Date(), []);
  const selectedISO = toISODate(selected);

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
      const key = bucketOf(override ?? view.status);
      if (key) {
        result[key].push(view);
      }
    }
    return result;
  }, [dayViewsQuery.data, statusOverrides]);

  // Horizontal pager: keep three weeks of lightweight positions, but render
  // real task pages only for dates the user has actually opened.
  const pagerRef = useRef<FlatList<Date>>(null);
  const dayCommitFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const initialWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const initialDayPagerIndex = useMemo(
    () => dayPagerIndexForDate(new Date(), initialWeekStart),
    [initialWeekStart],
  );
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

  useEffect(() => {
    console.log('[Calendar] mounted day pages', {
      storeKey: mountedDaysKey,
      dates: [...mountedDayPageKeys].sort(),
    });
  }, [mountedDayPageKeys, mountedDaysKey]);

  const scheduleSelectedCommit = useCallback((target: Date) => {
    if (dayCommitFrameRef.current) {
      cancelAnimationFrame(dayCommitFrameRef.current);
    }
    dayCommitFrameRef.current = requestAnimationFrame(() => {
      dayCommitFrameRef.current = null;
      setSelected(target);
    });
  }, []);

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
        setVisualSelected(date);
        scheduleSelectedCommit(date);
      }
    },
    [dayPagerBase, markDayPageMounted, pages, scheduleSelectedCommit, width],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      if (isSameDay(date, visualSelected)) return;
      const targetWeekStart = startOfWeek(date);
      const index = dayPagerIndexForDate(date, targetWeekStart);
      setVisualSelected(date);
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
    [dayPagerBase, markDayPageMounted, scheduleSelectedCommit, visualSelected],
  );

  useEffect(() => {
    const pendingIndex = pendingDayPagerIndexRef.current;
    if (pendingIndex === null) return;
    pendingDayPagerIndexRef.current = null;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({ index: pendingIndex, animated: false });
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

  const openOccurrence = useCallback(
    (view: TaskInstanceView) => {
      // Future occurrences are preview-only → occurrence detail. Today/past open
      // the step "runner" (TaskView in instance mode).
      if (view.scheduledDate > toISODate(today)) {
        navigation.navigate('OccurrenceDetail', {
          assignmentId: view.assignmentId,
          taskId: view.taskId,
          taskTitle: view.title,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
          status: view.status,
          isVirtual: view.isVirtual,
        });
      } else {
        navigation.navigate('TaskView', {
          taskId: view.taskId,
          assignmentId: view.assignmentId,
          scheduledDate: view.scheduledDate,
          scheduledTime: view.scheduledTime,
          instanceId: view.instanceId ?? undefined,
          status: view.status,
        });
      }
    },
    [navigation, today],
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
          <BackButton onPress={() => navigation.goBack()} variant="dark" />
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Calendar
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open month calendar"
            onPress={() => setMonthPickerVisible(true)}
            style={({ pressed }) => [styles.eyeButton, pressed ? styles.chipPressed : null]}
            hitSlop={6}
          >
            <Ionicons name="eye-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a task"
            onPress={() => setAddChoiceVisible(true)}
            style={({ pressed }) => [styles.addButton, pressed ? styles.addButtonPressed : null]}
          >
            <Ionicons name="add" size={30} color={colors.onPrimary} />
          </Pressable>
        </View>

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
            showsHorizontalScrollIndicator={false}
            keyExtractor={(date) => toISODate(date)}
            initialScrollIndex={initialDayPagerIndex}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onScrollBeginDrag={() => {
              programmaticDayScrollRef.current = false;
            }}
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
                navigation.navigate('SelectTask');
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
                navigation.navigate('CreateTask', { scheduleAfterCreate: true });
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
  statusTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
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
    elevation: 3,
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
