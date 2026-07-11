import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  pauseTaskInstanceTimer,
  startTaskInstanceStep,
} from '../../features/assignments/api/assignmentApi';
import {
  useInstanceSteps,
  useSetInstanceStepCompletion,
} from '../../features/assignments/hooks/useAssignments';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import { useCachedMediaUri } from '../../features/media/hooks/useCachedMedia';
import { useTask } from '../../features/tasks/hooks/useTask';
import { useTaskSteps } from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import type { TaskStep } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import CachedImage from '../../shared/components/CachedImage';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type StepDetailNavigation = NativeStackNavigationProp<MainStackParamList, 'StepDetail'>;
type StepDetailRoute = RouteProp<MainStackParamList, 'StepDetail'>;

/** How long the swipe counter stays visible after the last interaction. */
const COUNTER_HIDE_DELAY_MS = 2500;
/** Height of the pull-up description area in the player sheet. */
const PLAYER_DESC_HEIGHT = 260;
/**
 * Arrow-tap paging spring. Interruptible with velocity carry-over: rapid taps
 * retarget the in-flight spring, which naturally speeds the slide up instead
 * of cancelling it. Overshoot is clamped so pages never bounce past the edge.
 */
const PAGE_SPRING = {
  stiffness: 220,
  damping: 28,
  mass: 1,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

// ── Player page: full-bleed photo + pull-up title/description sheet ──────────

function PlayerStepPage({
  taskId,
  step,
  width,
}: {
  taskId: string;
  step: TaskStep;
  width: number;
}) {
  const visual = useMemo(
    () => step.mediaAssets.find((a) => a.type === 'IMAGE'),
    [step.mediaAssets],
  );
  const visualUri = useCachedMediaUri(taskId, visual);
  const hasDescription = Boolean(step.description);

  // The dark title bar doubles as a drag handle: pulling it up reveals the
  // description panel; pulling down (or flinging) collapses it again.
  const expandAnim = useRef(new Animated.Value(0)).current;
  const expandedRef = useRef(false);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim clearly-vertical drags only, so horizontal step swipes pass
        // through to the pager underneath.
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
        onPanResponderMove: (_evt, gesture) => {
          const base = expandedRef.current ? 1 : 0;
          const next = base - gesture.dy / PLAYER_DESC_HEIGHT;
          expandAnim.setValue(Math.min(1, Math.max(0, next)));
        },
        onPanResponderRelease: (_evt, gesture) => {
          const base = expandedRef.current ? 1 : 0;
          const value = base - gesture.dy / PLAYER_DESC_HEIGHT;
          const shouldExpand =
            gesture.vy < -0.3 ? true : gesture.vy > 0.3 ? false : value > 0.5;
          expandedRef.current = shouldExpand;
          Animated.spring(expandAnim, {
            toValue: shouldExpand ? 1 : 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(expandAnim, {
            toValue: expandedRef.current ? 1 : 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        },
      }),
    [expandAnim],
  );
  const translateY = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [PLAYER_DESC_HEIGHT, 0],
  });

  return (
    <View style={[styles.playerPage, { width }]}>
      {visual ? (
        visualUri ? (
          <CachedImage
            accessibilityLabel={`${step.text} photo`}
            uri={visualUri}
            cacheKey={visual.assetId}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.playerPagePlaceholder]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.playerPagePlaceholder]}>
          <Ionicons name="image-outline" size={48} color={colors.disabled} />
        </View>
      )}

      <Animated.View
        style={[
          styles.playerSheet,
          hasDescription ? { transform: [{ translateY }] } : null,
        ]}
      >
        <View
          {...(hasDescription ? panResponder.panHandlers : {})}
          style={styles.playerSheetHandle}
        >
          {hasDescription ? <View style={styles.playerSheetGrabber} /> : null}
          <Text style={styles.playerSheetTitle}>{step.text}</Text>
        </View>
        {hasDescription ? (
          <View style={styles.playerSheetBody}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.playerSheetDescription}>{step.description}</Text>
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StepDetailScreen() {
  const navigation = useNavigation<StepDetailNavigation>();
  const route = useRoute<StepDetailRoute>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { taskId, stepId, assignmentId, scheduledDate, scheduledTime, status } = route.params;
  const instanceId = route.params.instanceId;

  const isInstance = Boolean(assignmentId && scheduledDate && scheduledTime);
  // Toggling needs a materialized instance (started from the calendar), and
  // completed/skipped occurrences are read-only here, matching the step list.
  const canToggle =
    isInstance && Boolean(instanceId) && status !== 'COMPLETED' && status !== 'SKIPPED';
  // Template mode and skipped occurrences use the swipeable "player" layout;
  // materialized runner modes (to do / overdue / done) keep the classic layout
  // with the completion button.
  const playerMode = !isInstance || status === 'SKIPPED';

  // Cloud-first completion state, same as TaskViewScreen: the instance's step
  // snapshot is the source of truth, with an optimistic flip while saving.
  const [ownerId, setOwnerId] = useState('');
  const [override, setOverride] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const stepToggle = useSetInstanceStepCompletion();

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

  const instanceStepsQuery = useInstanceSteps(ownerId, instanceId ?? '');
  const serverCompleted = useMemo(() => {
    for (const page of instanceStepsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (item.stepId === stepId) {
          return item.completed;
        }
      }
    }
    return false;
  }, [instanceStepsQuery.data, stepId]);
  const completed = override ?? serverCompleted;

  // Drop the optimistic override once the refetched server state agrees.
  useEffect(() => {
    setOverride((current) => (current !== null && current === serverCompleted ? null : current));
  }, [serverCompleted]);

  // ── Server-side step timing ──────────────────────────────────────────────
  // While this step is focused on a started (non-settled) occurrence, its
  // backend timer runs. Leaving the screen or backgrounding/locking pauses it;
  // returning resumes it. Already-completed steps are not timed (undoing one
  // restarts the timer). Both mutations are idempotent and the timing is
  // best-effort telemetry, so calls are fire-and-forget (no invalidation).
  useEffect(() => {
    if (!canToggle || !ownerId || !instanceId || completed) {
      return;
    }
    const beginTiming = () => {
      void startTaskInstanceStep({ userId: ownerId, instanceId, stepId }).catch(
        (error: unknown) => {
          if (__DEV__) {
            console.warn('[step-timing] startTaskInstanceStep failed', error);
          }
        },
      );
    };
    const pauseTiming = () => {
      void pauseTaskInstanceTimer({ userId: ownerId, instanceId }).catch((error: unknown) => {
        if (__DEV__) {
          console.warn('[step-timing] pauseTaskInstanceTimer failed', error);
        }
      });
    };
    beginTiming();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        beginTiming();
      } else {
        pauseTiming();
      }
    });
    return () => {
      subscription.remove();
      pauseTiming();
    };
  }, [canToggle, ownerId, instanceId, stepId, completed]);

  const toggleCompleted = useCallback(async () => {
    if (!canToggle || !instanceId || !ownerId || saving) {
      return;
    }
    const nextCompleted = !completed;
    setSaveError(undefined);
    setSaving(true);
    setOverride(nextCompleted);
    try {
      await stepToggle.mutateAsync({
        userId: ownerId,
        instanceId,
        stepId,
        completed: nextCompleted,
      });
    } catch (error) {
      // Roll the optimistic flip back and surface the failure.
      setOverride(null);
      setSaveError(
        error instanceof Error ? error.message : 'Could not save this step. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [canToggle, instanceId, ownerId, saving, completed, stepToggle, stepId]);

  const taskQuery = useTask(taskId);
  const stepsQuery = useTaskSteps(taskId);

  const steps = useMemo(
    () =>
      [...(stepsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => a.order - b.order,
      ),
    [stepsQuery.data],
  );
  // Player mode pages through steps in place; the classic layout stays pinned
  // to the step the route opened.
  const routeIndex = steps.findIndex((s) => s.stepId === stepId);
  const [pagerIndex, setPagerIndex] = useState<number | null>(null);
  const index = playerMode && pagerIndex !== null ? pagerIndex : routeIndex;
  const step = index >= 0 ? steps[index] : undefined;

  const visual = useMemo(
    () => step?.mediaAssets.find((a) => a.type === 'IMAGE'),
    [step],
  );
  const audio = useMemo(
    () => step?.mediaAssets.find((a) => a.type === 'AUDIO'),
    [step],
  );
  const visualUri = useCachedMediaUri(taskId, visual);
  const audioUri = useCachedMediaUri(taskId, audio);
  const hasAudio = Boolean(audio);

  const audioPlayer = useAudioPlayer(audioUri);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isPlaying = hasAudio ? audioStatus.playing : isSpeaking;

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => {
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (audioStatus.didJustFinish) {
      try {
        void audioPlayer.seekTo(0);
      } catch {
        // player released — ignore
      }
    }
  }, [audioStatus.didJustFinish, audioPlayer]);

  // Switching steps silences any in-flight narration.
  useEffect(() => {
    void Speech.stop();
    setIsSpeaking(false);
  }, [index]);

  // As the player pages, report the current step to the TaskView beneath us
  // (via its route params) so its list re-centres before we navigate back.
  useEffect(() => {
    if (!playerMode || !step) {
      return;
    }
    const state = navigation.getState();
    const previousRoute = state.index > 0 ? state.routes[state.index - 1] : undefined;
    if (previousRoute?.name === 'TaskView') {
      navigation.dispatch({
        ...CommonActions.setParams({ focusStepId: step.stepId }),
        source: previousRoute.key,
      });
    }
  }, [playerMode, step, navigation]);

  const togglePlayback = useCallback(() => {
    if (!step) {
      return;
    }
    if (isPlaying) {
      if (hasAudio) {
        audioPlayer.pause();
      } else {
        void Speech.stop();
        setIsSpeaking(false);
      }
      return;
    }
    if (hasAudio) {
      if (!audioUri) {
        return;
      }
      audioPlayer.play();
    } else {
      void Speech.stop();
      setIsSpeaking(true);
      Speech.speak(step.text, {
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  }, [step, isPlaying, hasAudio, audioPlayer, audioUri]);

  // ── Player chrome: swipe counter + arrow navigation ───────────────────────
  const pagerRef = useAnimatedRef<FlatList<TaskStep>>();
  const counterOpacity = useRef(new Animated.Value(0)).current;
  const counterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCounter = useCallback(() => {
    if (counterTimerRef.current) {
      clearTimeout(counterTimerRef.current);
    }
    Animated.timing(counterOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
    counterTimerRef.current = setTimeout(() => {
      Animated.timing(counterOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, COUNTER_HIDE_DELAY_MS);
  }, [counterOpacity]);

  const stepsLoaded = steps.length > 0;
  useEffect(() => {
    if (playerMode && stepsLoaded) {
      showCounter();
    }
    return () => {
      if (counterTimerRef.current) {
        clearTimeout(counterTimerRef.current);
      }
    };
  }, [playerMode, stepsLoaded, showCounter]);

  // While an arrow-triggered scroll animates, live onScroll tracking is
  // suppressed — otherwise it would report the still-current page and flicker
  // the counter back before the animation crosses the midpoint. Rapid taps
  // accumulate on the pending target (not the settled page).
  const programmaticTargetRef = useRef<number | null>(null);
  const lastOffsetRef = useRef(0);

  // Arrow taps drive the pager with a Reanimated spring on the UI thread
  // instead of the native animated scroll: fully interruptible, and each
  // retarget inherits the in-flight velocity, so rapid taps naturally speed
  // the slide up. This also sidesteps the iOS dead-ends around cancelling
  // setContentOffset animations.
  const driverX = useSharedValue(0);
  const driverActive = useSharedValue(false);
  useDerivedValue(() => {
    if (driverActive.value) {
      scrollTo(pagerRef, driverX.value, 0, false);
    }
  });

  const onDriverSettled = useCallback(
    (settledIndex: number) => {
      if (programmaticTargetRef.current === settledIndex) {
        programmaticTargetRef.current = null;
        driverActive.value = false;
      }
    },
    [driverActive],
  );

  const goToStep = useCallback(
    (direction: 1 | -1) => {
      const inFlight = programmaticTargetRef.current !== null;
      const base = programmaticTargetRef.current ?? index;
      const next = base + direction;
      if (next < 0 || next >= steps.length) {
        return;
      }
      programmaticTargetRef.current = next;
      if (!inFlight) {
        // Start the spring from wherever the pager actually sits; a retarget
        // mid-flight keeps the animated value (and its velocity) as-is.
        driverX.value = lastOffsetRef.current;
      }
      driverActive.value = true;
      driverX.value = withSpring(next * windowWidth, PAGE_SPRING, (finished) => {
        'worklet';
        if (finished) {
          runOnJS(onDriverSettled)(next);
        }
      });
      setPagerIndex(next);
      showCounter();
    },
    [index, steps.length, windowWidth, driverX, driverActive, onDriverSettled, showCounter],
  );

  const isLoading = taskQuery.isLoading || stepsQuery.isLoading;

  if (isLoading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!step || !taskQuery.data) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateText}>This step could not be found.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All steps"
          onPress={() => navigation.goBack()}
          style={styles.backPill}
        >
          <Ionicons name="arrow-back" size={18} color={colors.onPrimary} />
          <Text style={styles.backPillText}>All steps</Text>
        </Pressable>
      </View>
    );
  }

  const task = taskQuery.data;

  if (playerMode) {
    return (
      <View style={styles.root}>
        <View style={[styles.playerHeader, { paddingTop: insets.top + spacing.sm }]}>
          <BackButton onPress={() => navigation.goBack()} variant="dark" />
          <Text accessibilityRole="header" numberOfLines={1} style={styles.playerHeaderTitle}>
            {task.title}
          </Text>
        </View>

        <View style={styles.playerPager}>
          <Reanimated.FlatList
            ref={pagerRef}
            data={steps}
            keyExtractor={(item) => item.stepId}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({
              length: windowWidth,
              offset: windowWidth * i,
              index: i,
            })}
            onScrollToIndexFailed={() => {}}
            onScrollBeginDrag={() => {
              // A user drag takes over from any in-flight arrow spring.
              cancelAnimation(driverX);
              driverActive.value = false;
              programmaticTargetRef.current = null;
              showCounter();
            }}
            // Track the page live while scrolling (crossing a page's midpoint
            // counts as arriving), so fast successive swipes update the
            // counter and arrows immediately instead of waiting for the
            // paging animation to settle.
            scrollEventThrottle={16}
            onScroll={(event) => {
              lastOffsetRef.current = event.nativeEvent.contentOffset.x;
              if (programmaticTargetRef.current !== null) {
                // An arrow spring owns the pager; its completion callback
                // (or a user drag) releases it.
                return;
              }
              const next = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
              if (next >= 0 && next < steps.length && next !== index) {
                setPagerIndex(next);
                showCounter();
              }
            }}
            renderItem={({ item }) => (
              <PlayerStepPage taskId={taskId} step={item} width={windowWidth} />
            )}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.playerCounter, { opacity: counterOpacity }]}
          >
            <Text style={styles.playerCounterText}>
              {index + 1}/{steps.length}
            </Text>
          </Animated.View>
        </View>

        <View style={[styles.playerBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.playerBarSlot}>
            {index > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous step"
                onPress={() => goToStep(-1)}
                style={({ pressed }) => [styles.playerNavButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="chevron-back" size={30} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Stop' : 'Listen to this step'}
            accessibilityState={{ selected: isPlaying }}
            onPress={togglePlayback}
            style={({ pressed }) => [
              styles.playerSpeakerButton,
              isPlaying ? styles.playerSpeakerButtonActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons
              name={isPlaying ? (hasAudio ? 'pause' : 'stop') : 'volume-high'}
              size={26}
              color={isPlaying ? colors.onPrimary : colors.primary}
            />
          </Pressable>
          <View style={styles.playerBarSlot}>
            {index < steps.length - 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next step"
                onPress={() => goToStep(1)}
                style={({ pressed }) => [styles.playerNavButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="chevron-forward" size={30} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {visualUri ? (
            <CachedImage
              accessibilityLabel={`${step.text} photo`}
              uri={visualUri}
              cacheKey={visual?.assetId ?? ''}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={40} color={colors.disabled} />
            </View>
          )}
          <View style={[styles.heroTopRow, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="All steps"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backPill, pressed ? styles.pressed : null]}
            >
              <Ionicons name="arrow-back" size={18} color={colors.onPrimary} />
              <Text style={styles.backPillText}>All steps</Text>
            </Pressable>
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {index + 1} / {steps.length}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.taskCaption}>{task.title.toUpperCase()}</Text>
          <Text style={styles.stepHeading}>Step {index + 1}</Text>
          <Text style={styles.stepText}>{step.text}</Text>
          {step.description ? <Text style={styles.stepDescription}>{step.description}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Stop' : 'Listen to this step'}
            accessibilityState={{ selected: isPlaying }}
            onPress={togglePlayback}
            style={({ pressed }) => [styles.listenButton, pressed ? styles.pressed : null]}
          >
            <Ionicons name={isPlaying ? 'stop' : 'volume-high'} size={20} color={colors.primary} />
            <Text style={styles.listenText}>{isPlaying ? 'Stop' : 'Listen to this step'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {canToggle ? (
        <View
          style={[styles.doneArea, { marginBottom: insets.bottom + spacing.lg }]}
          pointerEvents="box-none"
        >
          {saveError ? (
            <Text accessibilityRole="alert" style={styles.saveError}>
              {saveError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={completed ? 'Mark step not done' : 'Mark step done'}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => void toggleCompleted()}
            style={({ pressed }) => [
              styles.doneButton,
              completed ? styles.undoButton : styles.markDoneButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons
              name={completed ? 'arrow-undo' : 'checkmark'}
              size={20}
              color={completed ? colors.danger : colors.onPrimary}
            />
            <Text style={[styles.doneText, completed ? styles.undoText : styles.markDoneText]}>
              {saving ? 'Saving…' : completed ? 'Undo — not done yet' : 'Mark as done'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centeredState: {
    flex: 1,
    gap: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
  },
  // ── Player layout ──────────────────────────────────────────────────────────
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  playerHeaderTitle: {
    flex: 1,
    ...typography.title,
    color: colors.text,
  },
  playerPager: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerPage: {
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  playerPagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  playerCounter: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(27,34,48,0.6)',
  },
  playerCounterText: {
    ...typography.bodyStrong,
    fontSize: 18,
    color: colors.onPrimary,
  },
  playerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 18, 26, 0.72)',
  },
  playerSheetHandle: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  playerSheetGrabber: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  playerSheetTitle: {
    ...typography.heading,
    fontSize: 24,
    color: colors.onPrimary,
    textAlign: 'center',
  },
  playerSheetBody: {
    height: PLAYER_DESC_HEIGHT,
    paddingHorizontal: spacing.xl,
  },
  playerSheetDescription: {
    ...typography.body,
    fontSize: 17,
    color: 'rgba(255,255,255,0.92)',
    paddingBottom: spacing.xl,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
  },
  playerBarSlot: {
    width: 56,
    alignItems: 'center',
  },
  playerNavButton: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  playerSpeakerButton: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDEDE8',
  },
  playerSpeakerButtonActive: {
    backgroundColor: colors.primary,
  },
  // ── Classic (instance runner) layout ──────────────────────────────────────
  hero: {
    width: '100%',
    height: 360,
    backgroundColor: '#000',
  },
  heroPlaceholder: {
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(27,34,48,0.55)',
  },
  backPillText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  counterPill: {
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27,34,48,0.55)',
  },
  counterText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  taskCaption: {
    ...typography.caption,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  stepHeading: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.sm,
  },
  stepText: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.sm,
  },
  stepDescription: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: '#FDEDE8',
    marginTop: spacing.xl,
  },
  listenText: {
    ...typography.button,
    color: colors.primary,
  },
  doneArea: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 0,
    gap: spacing.sm,
  },
  saveError: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  markDoneButton: {
    backgroundColor: colors.primary,
  },
  undoButton: {
    backgroundColor: '#FDE7E7',
  },
  doneText: {
    ...typography.button,
  },
  markDoneText: {
    color: colors.onPrimary,
  },
  undoText: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.72,
  },
});
