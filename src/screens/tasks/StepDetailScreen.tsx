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

/** Done-state teal, matching the step list's completed circles (TaskViewScreen). */
const TEAL = '#3DB8AD';
/** How long the swipe counter stays visible after the last interaction. */
const COUNTER_HIDE_DELAY_MS = 2500;
/**
 * How long a page must stay visible before its backend timer starts. Rapid
 * consecutive check-offs skim pages faster than this, so skimmed pages never
 * fire a start/pause pair — only the page the user settles on is timed.
 */
const TIMING_SETTLE_MS = 700;
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
  completed,
}: {
  taskId: string;
  step: TaskStep;
  width: number;
  /** Shows the done badge next to the title (instance pages with check data). */
  completed?: boolean;
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
          <View style={styles.playerSheetTitleRow}>
            {completed ? (
              <View accessibilityLabel="Step done" style={styles.playerSheetCheck}>
                <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
              </View>
            ) : null}
            <Text style={styles.playerSheetTitle}>{step.text}</Text>
          </View>
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
  // Display-only variants use the swipeable "player" layout: template mode,
  // skipped occurrences, and unmaterialized (not yet started) to do/overdue
  // occurrences. Materialized to do/overdue occurrences (canToggle) use the
  // same player chrome but check-driven: swiping is disabled and completing a
  // step is the only way forward, so the visible page always equals the step
  // being worked on (keeps the timing attribution clean). Done occurrences
  // keep the classic read-only layout.
  const displayPlayer = !isInstance || !instanceId || status === 'SKIPPED';
  const runnerPlayer = canToggle;
  const playerLayout = displayPlayer || runnerPlayer;

  // Cloud-first completion state, same as TaskViewScreen: the instance's step
  // snapshot is the source of truth. The runner player pages through steps in
  // place, so optimistic flips are kept per step id rather than for a single
  // route-pinned step.
  const [ownerId, setOwnerId] = useState('');
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string>();
  const savingStepsRef = useRef<Set<string>>(new Set());
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
  const serverCompletedByStep = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const page of instanceStepsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        map[item.stepId] = item.completed;
      }
    }
    return map;
  }, [instanceStepsQuery.data]);

  // Drop optimistic overrides once the refetched server state agrees.
  useEffect(() => {
    setOverrides((current) => {
      const settled = Object.keys(current).filter(
        (id) => serverCompletedByStep[id] === current[id],
      );
      if (settled.length === 0) {
        return current;
      }
      const next = { ...current };
      for (const id of settled) {
        delete next[id];
      }
      return next;
    });
  }, [serverCompletedByStep]);

  const taskQuery = useTask(taskId);
  const stepsQuery = useTaskSteps(taskId);

  const steps = useMemo(
    () =>
      [...(stepsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => a.order - b.order,
      ),
    [stepsQuery.data],
  );
  // Player layouts page through steps in place; the classic layout stays
  // pinned to the step the route opened.
  const routeIndex = steps.findIndex((s) => s.stepId === stepId);
  const [pagerIndex, setPagerIndex] = useState<number | null>(null);
  const index = playerLayout && pagerIndex !== null ? pagerIndex : routeIndex;
  const step = index >= 0 ? steps[index] : undefined;

  const activeStepId = step?.stepId;
  const stepCompleted = activeStepId
    ? (overrides[activeStepId] ?? serverCompletedByStep[activeStepId] ?? false)
    : false;

  // ── Server-side step timing ──────────────────────────────────────────────
  // The current page's step (not the route's) is the one being timed, and only
  // while it is not completed on a started occurrence. A page must stay
  // visible for TIMING_SETTLE_MS before its timer starts, so pages skimmed by
  // rapid check-offs never produce timing calls. Leaving the screen or
  // backgrounding/locking pauses a running timer; returning resumes it (after
  // the same settle delay). Undoing a completed step restarts it. Both
  // mutations are idempotent and the timing is best-effort telemetry, so calls
  // are fire-and-forget (no invalidation).
  useEffect(() => {
    if (!canToggle || !ownerId || !instanceId || !activeStepId || stepCompleted) {
      return;
    }
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let started = false;
    const beginTiming = () => {
      if (settleTimer !== null || started) {
        return;
      }
      settleTimer = setTimeout(() => {
        settleTimer = null;
        started = true;
        void startTaskInstanceStep({ userId: ownerId, instanceId, stepId: activeStepId }).catch(
          (error: unknown) => {
            if (__DEV__) {
              console.warn('[step-timing] startTaskInstanceStep failed', error);
            }
          },
        );
      }, TIMING_SETTLE_MS);
    };
    const cancelOrPause = () => {
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (started) {
        started = false;
        void pauseTaskInstanceTimer({ userId: ownerId, instanceId }).catch((error: unknown) => {
          if (__DEV__) {
            console.warn('[step-timing] pauseTaskInstanceTimer failed', error);
          }
        });
      }
    };
    beginTiming();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        beginTiming();
      } else {
        cancelOrPause();
      }
    });
    return () => {
      subscription.remove();
      cancelOrPause();
    };
  }, [canToggle, ownerId, instanceId, activeStepId, stepCompleted]);

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
    if (!playerLayout || !step) {
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
  }, [playerLayout, step, navigation]);

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
    if (playerLayout && stepsLoaded) {
      showCounter();
    }
    return () => {
      if (counterTimerRef.current) {
        clearTimeout(counterTimerRef.current);
      }
    };
  }, [playerLayout, stepsLoaded, showCounter]);

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

  // In the runner player, the check button completes the current step and
  // advances to the next page (or back to the step list after the last step,
  // where TaskView's "All steps done!" prompt takes over). The flip is
  // optimistic: on failure we stay on the advanced page, surface the error,
  // and the step stays incomplete on the server. On an already-completed page
  // the button is an undo instead — it stays put and restarts the timer.
  const checkCurrentStep = useCallback(async () => {
    if (!canToggle || !instanceId || !ownerId || !activeStepId) {
      return;
    }
    // Re-entry guard: blocks a double-tap on the same page while its mutation
    // is in flight. Checks on subsequent pages are separate steps and pass.
    if (savingStepsRef.current.has(activeStepId)) {
      return;
    }
    savingStepsRef.current.add(activeStepId);
    const nextCompleted = !stepCompleted;
    setSaveError(undefined);
    setOverrides((current) => ({ ...current, [activeStepId]: nextCompleted }));
    if (nextCompleted) {
      if (index < steps.length - 1) {
        goToStep(1);
      } else {
        navigation.goBack();
      }
    }
    try {
      await stepToggle.mutateAsync({
        userId: ownerId,
        instanceId,
        stepId: activeStepId,
        completed: nextCompleted,
      });
    } catch (error) {
      // Roll the optimistic flip back and surface the failure.
      setOverrides((current) => {
        const next = { ...current };
        delete next[activeStepId];
        return next;
      });
      setSaveError(
        error instanceof Error ? error.message : 'Could not save this step. Please try again.',
      );
    } finally {
      savingStepsRef.current.delete(activeStepId);
    }
  }, [
    canToggle,
    instanceId,
    ownerId,
    activeStepId,
    stepCompleted,
    index,
    steps.length,
    goToStep,
    navigation,
    stepToggle,
  ]);

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

  if (playerLayout) {
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
            // The runner player is check-driven: the visible page must always
            // be the step being worked on, so free swiping is disabled.
            scrollEnabled={displayPlayer}
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
              <PlayerStepPage
                taskId={taskId}
                step={item}
                width={windowWidth}
                completed={overrides[item.stepId] ?? serverCompletedByStep[item.stepId] ?? false}
              />
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

        {runnerPlayer && saveError ? (
          <Text accessibilityRole="alert" style={styles.playerSaveError}>
            {saveError}
          </Text>
        ) : null}
        <View style={[styles.playerBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.playerBarSlot}>
            {displayPlayer && index > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous step"
                onPress={() => goToStep(-1)}
                style={({ pressed }) => [styles.playerNavButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="chevron-back" size={30} color={colors.text} />
              </Pressable>
            ) : null}
            {runnerPlayer && stepCompleted ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo — mark step not done"
                onPress={() => void checkCurrentStep()}
                style={({ pressed }) => [
                  styles.playerCheckButton,
                  styles.playerUndoButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Ionicons name="arrow-undo" size={26} color={colors.danger} />
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
            {displayPlayer && index < steps.length - 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next step"
                onPress={() => goToStep(1)}
                style={({ pressed }) => [styles.playerNavButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="chevron-forward" size={30} color={colors.text} />
              </Pressable>
            ) : null}
            {runnerPlayer && !stepCompleted ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark step done and go to next"
                onPress={() => void checkCurrentStep()}
                style={({ pressed }) => [styles.playerCheckButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="checkmark" size={30} color={colors.onPrimary} />
              </Pressable>
            ) : null}
            {runnerPlayer && stepCompleted && index < steps.length - 1 ? (
              // A page can already be checked (done out of order from the
              // list); with swiping disabled, this is the way past it.
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
  playerSheetTitleRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  playerSheetCheck: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEAL,
  },
  playerSheetTitle: {
    ...typography.heading,
    fontSize: 24,
    color: colors.onPrimary,
    flexShrink: 1,
    textAlign: 'left',
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
  playerCheckButton: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  playerUndoButton: {
    backgroundColor: '#FDE7E7',
  },
  playerSaveError: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
    backgroundColor: colors.bg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
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
  pressed: {
    opacity: 0.72,
  },
});
