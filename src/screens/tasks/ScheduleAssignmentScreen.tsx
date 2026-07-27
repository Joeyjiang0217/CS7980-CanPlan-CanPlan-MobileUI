import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCreateAssignment } from '../../features/assignments/hooks/useAssignments';
import { REPEAT_OPTIONS, type RepeatValue } from '../../features/assignments/repeat';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { CreateTaskAssignmentInput } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type ScheduleAssignmentNavigation = NativeStackNavigationProp<MainStackParamList, 'ScheduleAssignment'>;
type ScheduleAssignmentRoute = RouteProp<MainStackParamList, 'ScheduleAssignment'>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/** Current wall-clock time rounded UP to the next 5-minute mark (e.g. 23:17 → 23:20). */
function roundUpToFiveMinutes(now: Date): string {
  const total = (Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// ── Date picker sheet (past days disabled) ─────────────────────────────────────

function DateSheet({
  visible,
  selected,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  selected: Date;
  onCancel: () => void;
  onSelect: (date: Date) => void;
}) {
  const insets = useSafeAreaInsets();
  const [viewDate, setViewDate] = useState(selected);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    if (visible) {
      setViewDate(selected);
    }
  }, [visible, selected]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array<null>(monthStart.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.monthNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => setViewDate(new Date(year, month - 1, 1))}
              style={styles.monthArrow}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => setViewDate(new Date(year, month + 1, 1))}
              style={styles.monthArrow}
              hitSlop={6}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={styles.weekdayLabel}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={styles.dayCell} />;
              }
              const date = new Date(year, month, day);
              const isPast = startOfDay(date) < today;
              const isSelected = isSameDay(date, selected);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={date.toDateString()}
                  accessibilityState={{ disabled: isPast, selected: isSelected }}
                  disabled={isPast}
                  onPress={() => onSelect(date)}
                  style={styles.dayCell}
                >
                  <View style={[styles.dayCircle, isSelected ? styles.dayCircleSelected : null]}>
                    <Text
                      style={[
                        styles.dayText,
                        isPast ? styles.dayTextDisabled : null,
                        isSelected ? styles.dayTextSelected : null,
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
      </View>
    </Modal>
  );
}

// ── A single scroll wheel column ───────────────────────────────────────────────

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;

function WheelColumn({
  values,
  initialIndex,
  onChange,
  accessibilityLabel,
}: {
  values: string[];
  initialIndex: number;
  onChange: (index: number) => void;
  accessibilityLabel: string;
}) {
  const ref = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    setCurrent(initialIndex);
    ref.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
  }, [initialIndex]);

  const handleEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const index = Math.max(0, Math.min(values.length - 1, raw));
    setCurrent(index);
    onChange(index);
  };

  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
      contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * ((VISIBLE_ROWS - 1) / 2) }}
      onMomentumScrollEnd={handleEnd}
    >
      {values.map((value, index) => (
        <View key={value} style={styles.wheelItem}>
          <Text style={[styles.wheelText, index === current ? styles.wheelTextActive : null]}>
            {value}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Time picker sheet (required; no on/off toggle) ─────────────────────────────

function TimeSheet({
  visible,
  initialTime,
  onCancel,
  onDone,
}: {
  visible: boolean;
  initialTime?: string;
  onCancel: () => void;
  onDone: (time: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // When no time has been chosen yet, open at the next 5-minute mark from now.
  const fallback = useMemo(() => roundUpToFiveMinutes(new Date()), [visible]);
  const [h, m] = (initialTime ?? fallback).split(':');
  const initialHour = Math.max(0, HOURS.indexOf(h));
  const initialMin = Math.max(0, MINUTES.indexOf(m));
  const hourRef = useRef(initialHour);
  const minRef = useRef(initialMin);

  useEffect(() => {
    if (visible) {
      hourRef.current = initialHour;
      minRef.current = initialMin;
    }
  }, [visible, initialHour, initialMin]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} hitSlop={8}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Time</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => onDone(`${HOURS[hourRef.current]}:${MINUTES[minRef.current]}`)}
              hitSlop={8}
            >
              <Text style={styles.sheetDone}>Done</Text>
            </Pressable>
          </View>
          {visible ? (
            <View style={styles.wheelRow}>
              <View style={styles.wheelHighlight} pointerEvents="none" />
              <WheelColumn
                values={HOURS}
                initialIndex={initialHour}
                onChange={(i) => {
                  hourRef.current = i;
                }}
                accessibilityLabel="Hour"
              />
              <Text style={styles.wheelColon}>:</Text>
              <WheelColumn
                values={MINUTES}
                initialIndex={initialMin}
                onChange={(i) => {
                  minRef.current = i;
                }}
                accessibilityLabel="Minute"
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ── Repeat picker sheet ────────────────────────────────────────────────────────

function RepeatSheet({
  visible,
  selected,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  selected: RepeatValue;
  onCancel: () => void;
  onSelect: (value: RepeatValue) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} hitSlop={8}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Select Repeat</Text>
            <View style={styles.sheetHeaderSpacer} />
          </View>
          <ScrollView style={styles.repeatList} showsVerticalScrollIndicator={false}>
            {REPEAT_OPTIONS.map((option, index) => {
              const isSelected = option.value === selected;
              return (
                <Fragment key={option.value}>
                  {index > 0 ? <View style={styles.repeatDivider} /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelect(option.value)}
                    style={({ pressed }) => [styles.repeatRow, pressed ? styles.repeatRowPressed : null]}
                  >
                    <Text style={styles.repeatLabel}>{option.label}</Text>
                    {isSelected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                  </Pressable>
                </Fragment>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ScheduleAssignmentScreen() {
  const navigation = useNavigation<ScheduleAssignmentNavigation>();
  const route = useRoute<ScheduleAssignmentRoute>();
  const insets = useSafeAreaInsets();
  const { taskId, taskTitle } = route.params;

  const createAssignment = useCreateAssignment();

  const [ownerId, setOwnerId] = useState('');
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [time, setTime] = useState<string>();
  const [repeat, setRepeat] = useState<RepeatValue>('NONE');
  const [activeSheet, setActiveSheet] = useState<'date' | 'time' | 'repeat'>();
  const [inlineError, setInlineError] = useState<string>();

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

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const repeatLabel = REPEAT_OPTIONS.find((o) => o.value === repeat)?.label ?? 'None';
  const canSave = Boolean(ownerId) && Boolean(time) && !createAssignment.isPending;

  const handleSave = () => {
    if (!time) {
      setInlineError('Please choose a time.');
      return;
    }
    if (!canSave) {
      return;
    }

    // Reject a first occurrence that is already in the past (the date picker
    // blocks past days, but an earlier time today is still selectable).
    const [hh, mm] = time.split(':').map(Number);
    const scheduledAt = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hh,
      mm,
      0,
      0,
    );
    if (scheduledAt.getTime() < Date.now()) {
      setInlineError('You can’t schedule a task in the past.');
      return;
    }
    setInlineError(undefined);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const option = REPEAT_OPTIONS.find((o) => o.value === repeat);
    const dateISO = toISODate(date);

    const input: CreateTaskAssignmentInput =
      repeat === 'NONE' || !option?.rule
        ? {
            taskId,
            userId: ownerId,
            scheduleType: 'ONE_TIME',
            scheduledFor: `${dateISO}T${time}:00`,
            timezone,
          }
        : {
            taskId,
            userId: ownerId,
            scheduleType: 'RECURRING',
            scheduleRule: option.rule,
            startDate: dateISO,
            startTime: time,
            timezone,
          };

    createAssignment.mutate(input, {
      onSuccess: () => {
        navigation.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Calendar' }] });
      },
      onError: (error) => setInlineError(errorMessage(error)),
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
          {taskTitle ?? 'Schedule'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save schedule"
          accessibilityState={{ disabled: !canSave, busy: createAssignment.isPending }}
          disabled={!canSave}
          onPress={handleSave}
          hitSlop={8}
          style={styles.headerAction}
        >
          {createAssignment.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[styles.headerActionText, !canSave ? styles.headerActionDisabled : null]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>DATE &amp; TIME</Text>

        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Date, ${dateLabel}`}
            onPress={() => setActiveSheet('date')}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          >
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{dateLabel}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={time ? `Time, ${time}` : 'Set time'}
            onPress={() => setActiveSheet('time')}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          >
            <Text style={styles.rowLabel}>Time</Text>
            <Text style={[styles.rowValue, !time ? styles.rowValuePlaceholder : null]}>
              {time ?? 'Set time'}
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Repeat, ${repeatLabel}`}
            onPress={() => setActiveSheet('repeat')}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          >
            <Text style={styles.rowLabel}>Repeat</Text>
            <Text style={styles.rowValue}>{repeatLabel}</Text>
          </Pressable>
        </View>

        {inlineError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {inlineError}
          </Text>
        ) : null}
      </ScrollView>

      <DateSheet
        visible={activeSheet === 'date'}
        selected={date}
        onCancel={() => setActiveSheet(undefined)}
        onSelect={(next) => {
          setDate(startOfDay(next));
          setActiveSheet(undefined);
        }}
      />
      <TimeSheet
        visible={activeSheet === 'time'}
        initialTime={time}
        onCancel={() => setActiveSheet(undefined)}
        onDone={(next) => {
          setTime(next);
          setActiveSheet(undefined);
        }}
      />
      <RepeatSheet
        visible={activeSheet === 'repeat'}
        selected={repeat}
        onCancel={() => setActiveSheet(undefined)}
        onSelect={(next) => {
          setRepeat(next);
          setActiveSheet(undefined);
        }}
      />
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
    marginHorizontal: spacing.md,
    ...typography.title,
    color: colors.text,
  },
  headerAction: {
    minWidth: 56,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerActionText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  headerActionDisabled: {
    color: colors.disabled,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
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
    minHeight: 60,
  },
  rowPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  rowLabel: {
    ...typography.heading,
    color: colors.text,
  },
  rowValue: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValuePlaceholder: {
    color: colors.primary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.md,
  },
  // Sheets
  backdrop: {
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
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.heading,
    color: colors.text,
  },
  sheetCancel: {
    ...typography.bodyStrong,
    color: colors.textMuted,
  },
  sheetDone: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  sheetHeaderSpacer: {
    width: 54,
  },
  // Date grid
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
    color: colors.text,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    ...typography.caption,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  dayTextDisabled: {
    color: colors.disabled,
  },
  dayTextSelected: {
    color: colors.onPrimary,
  },
  // Time wheels
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  wheelHighlight: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    height: ITEM_HEIGHT,
    top: ITEM_HEIGHT * ((VISIBLE_ROWS - 1) / 2),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
  },
  wheel: {
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    width: 90,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 24,
    fontWeight: '400',
    color: colors.textMuted,
  },
  wheelTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  wheelColon: {
    ...typography.title,
    color: colors.text,
  },
  // Repeat list
  repeatList: {
    maxHeight: 420,
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  repeatRowPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  repeatLabel: {
    ...typography.heading,
    fontWeight: '400',
    color: colors.text,
  },
  repeatDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
