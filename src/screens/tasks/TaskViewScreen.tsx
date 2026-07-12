import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  occurrenceKey,
  setOccurrenceInstanceId,
  setOccurrenceStatus,
  useOccurrenceStatuses,
} from '../../features/assignments/occurrenceCompletion';
import {
  useInstanceSteps,
  useSetInstanceStepCompletion,
  useStartTaskInstance,
  useUpdateInstanceStatus,
} from '../../features/assignments/hooks/useAssignments';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { PersistedTaskInstanceStatus } from '../../shared/api/canplanTypes';
import { useCachedMediaUri } from '../../features/media/hooks/useCachedMedia';
import { useSimpleMode } from '../../features/users/hooks/useSimpleMode';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { useTask } from '../../features/tasks/hooks/useTask';
import { useTaskSteps } from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import type { TaskStep } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import CachedImage from '../../shared/components/CachedImage';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type TaskViewNavigation = NativeStackNavigationProp<MainStackParamList, 'TaskView'>;
type TaskViewRoute = RouteProp<MainStackParamList, 'TaskView'>;

const TEAL = '#3DB8AD';
const TEAL_DARK = '#2E9C92';
const TEAL_LIGHT = '#EBF9F8';

// "List time isn't tracked" reminder: shown at most once per this interval,
// across all task views (module-level, so it resets on app restart).
const TIMING_HINT_COOLDOWN_MS = 30 * 60 * 1000;
const TIMING_HINT_AUTO_HIDE_MS = 8 * 1000;
let timingHintLastShownAt = 0;

function scheduledOccurrenceMs(
  scheduledFor: string | undefined,
  scheduledDate: string | undefined,
  scheduledTime: string | undefined,
) {
  if (scheduledFor) {
    const fromScheduledFor = new Date(scheduledFor).getTime();
    if (Number.isFinite(fromScheduledFor)) {
      return fromScheduledFor;
    }
  }

  if (!scheduledDate || !scheduledTime) {
    return Number.NaN;
  }

  const normalizedTime =
    scheduledTime.split(':').length === 2 ? `${scheduledTime}:00` : scheduledTime;
  return new Date(`${scheduledDate}T${normalizedTime}`).getTime();
}

// ── Full-screen photo viewer ─────────────────────────────────────────────────

function PhotoViewer({
  uri,
  cacheKey,
  visible,
  onClose,
}: {
  uri: string;
  cacheKey: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {/* Tapping the photo itself also closes the viewer. The Pressable must
            fill the screen so the percentage-sized image has a box to size to. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.viewerCenter]}
        >
          <CachedImage
            accessibilityLabel="Full step photo"
            uri={uri}
            cacheKey={cacheKey}
            style={styles.viewerImage}
            contentFit="contain"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          style={[styles.viewerClose, { top: insets.top + spacing.md }]}
        >
          <Ionicons name="close" size={26} color={colors.onPrimary} />
        </Pressable>
      </View>
    </Modal>
  );
}

// ── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  taskId: string;
  step: TaskStep;
  index: number;
  /** Whether this step currently holds the (single) playback slot. */
  isActive: boolean;
  /** Claim the playback slot — stops whatever other step was playing. */
  onActivate: (stepId: string) => void;
  /** Release the slot, but only if this step still owns it. */
  onDeactivate: (stepId: string) => void;
  /** Instance-runner mode: show the done/undo control. */
  isInstance: boolean;
  completed: boolean;
  showCompletionControl?: boolean;
  onToggleComplete: () => void;
  /** Open the single-step focus view (tapping the title area). */
  onOpenDetail: () => void;
}

function StepCard({
  taskId,
  step,
  index,
  isActive,
  onActivate,
  onDeactivate,
  isInstance,
  completed,
  showCompletionControl = true,
  onToggleComplete,
  onOpenDetail,
}: StepCardProps) {
  // A step can carry one visual (IMAGE or VIDEO) and, independently, one AUDIO
  // recording — so resolve each slot on its own rather than just taking [0].
  const visual = useMemo(
    () => step.mediaAssets.find((a) => a.type === 'IMAGE' || a.type === 'VIDEO'),
    [step.mediaAssets],
  );
  const audio = useMemo(
    () => step.mediaAssets.find((a) => a.type === 'AUDIO'),
    [step.mediaAssets],
  );

  // Cached URIs: images keep the (rotating) remote URL — expo-image caches their
  // bytes by cacheKey; video/audio resolve to a local file path once downloaded.
  const visualUri = useCachedMediaUri(taskId, visual);
  const audioUri = useCachedMediaUri(taskId, audio);

  const isImage = visual?.type === 'IMAGE';
  const isVideo = visual?.type === 'VIDEO';
  const hasAudio = Boolean(audio);

  const videoPlayer = useVideoPlayer(isVideo ? visualUri : null, (player) => {
    player.loop = false;
  });
  const [videoStarted, setVideoStarted] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);

  // One audio player per step, shared by the row speaker, the photo overlay and
  // the audio bar so every control reflects the exact same playback state.
  const audioPlayer = useAudioPlayer(audioUri);
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // Text-to-speech fallback for steps that have no recording.
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Single source of truth both speaker controls render from.
  const isPlaying = hasAudio ? audioStatus.playing : isSpeaking;
  const audioProgress =
    audioStatus.duration > 0 ? Math.min(audioStatus.currentTime / audioStatus.duration, 1) : 0;
  // The audio bar (progress UI) is only useful when there's no photo to host the
  // overlay control — i.e. audio-only steps or audio paired with a video.
  const showAudioBar = hasAudio && !isImage;

  // Loop a finished recording back to the start and release the playback slot.
  useEffect(() => {
    if (!audioStatus.didJustFinish) return;
    try {
      void audioPlayer.seekTo(0);
    } catch {
      // Player released between the status update and this effect — safe to ignore.
    }
    onDeactivate(step.stepId);
  }, [audioStatus.didJustFinish, audioPlayer, onDeactivate, step.stepId]);

  // When another step takes the slot, make sure this one falls silent.
  useEffect(() => {
    if (isActive) return;
    if (hasAudio) {
      audioPlayer.pause();
    } else if (isSpeaking) {
      void Speech.stop();
      setIsSpeaking(false);
    }
  }, [isActive, hasAudio, isSpeaking, audioPlayer]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      if (hasAudio) audioPlayer.pause();
      else {
        void Speech.stop();
        setIsSpeaking(false);
      }
      onDeactivate(step.stepId);
      return;
    }
    // Claim the slot first so any other playing step stops.
    onActivate(step.stepId);
    if (hasAudio) {
      if (!audioUri) return; // recording URL still loading
      audioPlayer.play();
    } else {
      void Speech.stop();
      setIsSpeaking(true);
      Speech.speak(`Step ${index + 1}. ${step.text}`, {
        onDone: () => {
          setIsSpeaking(false);
          onDeactivate(step.stepId);
        },
        onStopped: () => setIsSpeaking(false),
        onError: () => {
          setIsSpeaking(false);
          onDeactivate(step.stepId);
        },
      });
    }
  }, [isPlaying, hasAudio, audioPlayer, audioUri, onActivate, onDeactivate, step.stepId, step.text, index]);

  return (
    <View style={styles.stepCard}>
      {/* Media preview */}
      {isImage ? (
        visualUri ? (
          <View style={styles.mediaWrap}>
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`View ${step.text} photo full screen`}
              onPress={() => setPhotoVisible(true)}
            >
              <CachedImage
                accessibilityLabel={`${step.text} photo`}
                uri={visualUri}
                cacheKey={visual?.assetId ?? ''}
                style={styles.stepMedia}
                contentFit="cover"
              />
              {isInstance && completed ? (
                <View style={styles.completedOverlay}>
                  <View style={styles.completedCheck}>
                    <Ionicons name="checkmark" size={32} color={colors.onPrimary} />
                  </View>
                </View>
              ) : null}
            </Pressable>
            {/* Overlay speaker — same playback + state as the row speaker. */}
            {hasAudio ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Stop step audio' : 'Play step audio'}
                accessibilityState={{ selected: isPlaying }}
                onPress={togglePlayback}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.audioOverlay,
                  isPlaying ? styles.audioOverlayActive : styles.audioOverlayIdle,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Ionicons name="volume-high" size={16} color={colors.onPrimary} />
                {isPlaying ? <Text style={styles.audioOverlayText}>Playing</Text> : null}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={[styles.stepMedia, styles.mediaPlaceholder]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : null}

      {isImage && visualUri ? (
        <PhotoViewer
          uri={visualUri}
          cacheKey={visual?.assetId ?? ''}
          visible={photoVisible}
          onClose={() => setPhotoVisible(false)}
        />
      ) : null}

      {isVideo ? (
        visualUri ? (
          <View style={styles.stepMedia}>
            <VideoView
              accessibilityLabel={`${step.text} video`}
              player={videoPlayer}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls
            />
            {videoStarted ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${step.text} video`}
                onPress={() => {
                  videoPlayer.play();
                  setVideoStarted(true);
                }}
                style={styles.videoPlayOverlay}
              >
                <View style={styles.videoPlayCircle}>
                  <Ionicons name="play" size={30} color={colors.onPrimary} style={{ marginLeft: 4 }} />
                </View>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={[styles.stepMedia, styles.mediaPlaceholder]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : null}

      {showAudioBar ? (
        <View style={styles.audioWrap}>
          <View style={styles.audioBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
              disabled={!audioUri}
              onPress={togglePlayback}
              style={({ pressed }) => [styles.audioPlayBtn, pressed ? styles.pressed : null]}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={18}
                color={colors.onPrimary}
                style={isPlaying ? undefined : { marginLeft: 2 }}
              />
            </Pressable>
            <View style={styles.audioBarInfo}>
              <Text style={styles.audioBarLabel}>Audio note</Text>
              <View style={styles.audioTrack}>
                <View style={[styles.audioTrackFill, { width: `${audioProgress * 100}%` }]} />
              </View>
            </View>
            <Ionicons name="mic" size={18} color={TEAL} />
          </View>
        </View>
      ) : null}

      {/* Title row */}
      <View style={styles.stepRow}>
        {/* Tapping the title area opens the single-step focus view. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open step ${index + 1}: ${step.text}`}
          onPress={onOpenDetail}
          style={styles.stepRowMain}
        >
          {/* Completed styling is display-only and independent of whether the
              toggle control is offered (skipped views show state, no actions). */}
          <View style={[styles.stepNumber, isInstance && completed ? styles.stepNumberDone : null]}>
            {isInstance && completed ? (
              <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
            ) : (
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            )}
          </View>
          <Text
            style={[styles.stepTitle, isInstance && completed ? styles.stepTitleDone : null]}
          >
            {step.text}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isPlaying
              ? hasAudio
                ? 'Stop step audio'
                : 'Stop reading step'
              : hasAudio
                ? 'Play step audio'
                : 'Listen to step'
          }
          accessibilityState={{ selected: isPlaying }}
          onPress={togglePlayback}
          style={({ pressed }) => [
            styles.listenButton,
            isPlaying ? styles.listenButtonActive : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Ionicons
            name={isPlaying ? (hasAudio ? 'pause' : 'stop') : 'volume-high'}
            size={18}
            color={isPlaying ? colors.onPrimary : colors.primary}
          />
        </Pressable>
        {isInstance && showCompletionControl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={completed ? 'Mark step not done' : 'Mark step done'}
            accessibilityState={{ selected: completed }}
            onPress={onToggleComplete}
            style={({ pressed }) => [
              styles.checkButton,
              completed ? styles.checkButtonDone : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons
              name={completed ? 'arrow-undo' : 'checkmark'}
              size={18}
              color={completed ? colors.danger : TEAL}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ── Hold-to-skip button ───────────────────────────────────────────────────────

const SKIP_HOLD_DURATION_MS = 1100;

function HoldToSkipButton({ onComplete }: { onComplete: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const startHold = useCallback(() => {
    animationRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: SKIP_HOLD_DURATION_MS,
      useNativeDriver: false,
    });
    animationRef.current.start(({ finished }: Animated.EndResult) => {
      if (finished) {
        progress.setValue(0);
        onComplete();
      }
    });
  }, [onComplete, progress]);

  const cancelHold = useCallback(() => {
    animationRef.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }, [progress]);

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to skip this task"
      onPressIn={startHold}
      onPressOut={cancelHold}
      style={styles.skipButton}
    >
      <Animated.View style={[styles.skipFill, { width: fillWidth }]} />
      <Ionicons name="play-skip-forward" size={20} color={colors.textMuted} />
      <Text style={styles.skipText}>Skip this task</Text>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

/** Local (not UTC) YYYY-MM-DD, comparable with the feed's scheduledDate. */
const localISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

export default function TaskViewScreen() {
  const navigation = useNavigation<TaskViewNavigation>();
  const route = useRoute<TaskViewRoute>();
  const insets = useSafeAreaInsets();
  const simpleMode = useSimpleMode();
  const { taskId, assignmentId, scheduledDate, scheduledTime, scheduledFor } = route.params;

  // Instance "runner" mode: opened from a calendar occurrence, so steps can be
  // checked off and a progress bar is shown.
  const isInstance = Boolean(assignmentId && scheduledDate && scheduledTime);
  const occKey =
    assignmentId && scheduledDate && scheduledTime
      ? occurrenceKey(assignmentId, scheduledDate, scheduledTime)
      : '';

  // Effective occurrence status: an in-memory override (just marked done/skipped
  // this session) wins over the status the calendar passed in. Drives the
  // done↛skip guard, the skipped state, and the overdue banner.
  const occStatuses = useOccurrenceStatuses();
  const occStatus = (occKey ? occStatuses.get(occKey) : undefined) ?? route.params.status;
  const isCompletedOcc = occStatus === 'COMPLETED';
  const isSkippedOcc = occStatus === 'SKIPPED';
  const isOverdueOcc = occStatus === 'OVERDUE';

  const taskQuery = useTask(taskId);
  const stepsQuery = useTaskSteps(taskId);

  // The single step allowed to play at a time (audio recording or TTS).
  const [activeStepId, setActiveStepId] = useState<string>();
  const [skipConfirmVisible, setSkipConfirmVisible] = useState(false);
  const [unskipConfirmVisible, setUnskipConfirmVisible] = useState(false);
  const [startConfirmVisible, setStartConfirmVisible] = useState(false);
  // "Mark as done now or later?" prompt. Tracks what opened it so "Later" can
  // still navigate back when the prompt was triggered by the back button.
  const [allDonePrompt, setAllDonePrompt] = useState<'auto' | 'back' | null>(null);

  // Completing/skipping the whole occurrence is persisted: the virtual occurrence
  // is materialized (startTaskInstance) and then given its final status. That
  // backend status is what drives the calendar (Done/Skipped bucket), the
  // "earliest-uncompleted = active" highlight, and the delete rules.
  const [ownerId, setOwnerId] = useState('');
  const [instanceId, setInstanceId] = useState<string | undefined>(route.params.instanceId);
  const [finishError, setFinishError] = useState<string>();
  const startInstance = useStartTaskInstance();
  const updateStatus = useUpdateInstanceStatus();
  const setStepCompletion = useSetInstanceStepCompletion();
  // Separate mutation instance for per-step check-offs so a step sync doesn't
  // flip the finish controls into their "Saving…" state.
  const stepToggle = useSetInstanceStepCompletion();
  const isFinishing =
    startInstance.isPending || updateStatus.isPending || setStepCompletion.isPending;

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

  // Cloud-first step completion: the materialized instance's step snapshots are
  // the source of truth; an optimistic overlay keeps taps instant while each
  // write syncs to the backend.
  const instanceStepsQuery = useInstanceSteps(ownerId, instanceId ?? '');
  const serverCompletedSteps = useMemo(() => {
    const set = new Set<string>();
    for (const page of instanceStepsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (item.completed) {
          set.add(item.stepId);
        }
      }
    }
    return set;
  }, [instanceStepsQuery.data]);
  const [stepOverrides, setStepOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [pendingSteps, setPendingSteps] = useState<ReadonlySet<string>>(new Set());
  const completedSteps = useMemo(() => {
    const set = new Set(serverCompletedSteps);
    stepOverrides.forEach((completed, stepId) => {
      if (completed) {
        set.add(stepId);
      } else {
        set.delete(stepId);
      }
    });
    return set;
  }, [serverCompletedSteps, stepOverrides]);

  // Drop an optimistic override once the refetched server state agrees with it.
  useEffect(() => {
    setStepOverrides((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Map(current);
      let changed = false;
      current.forEach((completed, stepId) => {
        if (serverCompletedSteps.has(stepId) === completed) {
          next.delete(stepId);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [serverCompletedSteps]);

  // Resolve (materializing on demand) the real instance id for this occurrence.
  // Concurrent callers (the open-effect plus a fast first tap) share one
  // in-flight startTaskInstance call.
  const instancePromiseRef = useRef<Promise<string> | null>(null);
  const ensureInstance = useCallback(() => {
    if (instanceId) {
      return Promise.resolve(instanceId);
    }
    if (!instancePromiseRef.current) {
      instancePromiseRef.current = startInstance
        .mutateAsync({
          userId: ownerId,
          assignmentId: assignmentId as string,
          scheduledDate: scheduledDate as string,
          scheduledTime: scheduledTime as string,
        })
        .then((created) => {
          setInstanceId(created.instanceId);
          return created.instanceId;
        })
        .catch((error: unknown) => {
          instancePromiseRef.current = null;
          throw error;
        });
    }
    return instancePromiseRef.current;
  }, [instanceId, ownerId, assignmentId, scheduledDate, scheduledTime, startInstance]);

  // Materializing is an explicit calendar action (the card's To Do / "Start
  // now" button). An occurrence without an instance renders read-only here:
  // steps are visible but there is no progress bar, check-off, or skip.
  const isMaterialized = Boolean(instanceId);

  // In-page start: same rule as the calendar card — today or earlier and not
  // resolved. Gray (not-active-yet) occurrences never reach this screen; the
  // calendar blocks them with its "Not active yet" alert.
  const canStartOccurrence =
    isInstance &&
    !isMaterialized &&
    !isCompletedOcc &&
    !isSkippedOcc &&
    (scheduledDate as string) <= localISODate(new Date());

  const handleStartOccurrence = useCallback(async () => {
    setStartConfirmVisible(false);
    setFinishError(undefined);
    try {
      const id = await ensureInstance();
      // Mirror into the in-memory store so the calendar reflects the start
      // instantly (same derivation as the calendar's own start button:
      // past-due occurrences stay OVERDUE, future-of-now becomes IN_PROGRESS).
      if (occKey) {
        setOccurrenceInstanceId(occKey, id);
        const scheduledMs = scheduledFor ? new Date(scheduledFor).getTime() : NaN;
        setOccurrenceStatus(
          occKey,
          Number.isFinite(scheduledMs) && Date.now() > scheduledMs
            ? 'OVERDUE'
            : 'IN_PROGRESS',
        );
      }
    } catch (error) {
      setFinishError(
        error instanceof Error ? error.message : 'Could not start this task. Please try again.',
      );
    }
  }, [ensureInstance, occKey, scheduledFor]);

  // Remind the user that time on this list isn't tracked — only opened steps
  // are. Auto-hides, and stays quiet for a while once shown.
  const [timingHintVisible, setTimingHintVisible] = useState(false);
  useEffect(() => {
    if (!isInstance || !isMaterialized || isCompletedOcc || isSkippedOcc) {
      return;
    }
    if (Date.now() - timingHintLastShownAt < TIMING_HINT_COOLDOWN_MS) {
      return;
    }
    timingHintLastShownAt = Date.now();
    setTimingHintVisible(true);
  }, [isInstance, isMaterialized, isCompletedOcc, isSkippedOcc]);
  useEffect(() => {
    if (!timingHintVisible) {
      return;
    }
    const timer = setTimeout(() => setTimingHintVisible(false), TIMING_HINT_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [timingHintVisible]);

  // One step check-off: optimistic flip, then persist to the backend.
  const toggleStep = useCallback(
    async (stepId: string) => {
      if (!isInstance || !ownerId || pendingSteps.has(stepId)) {
        return;
      }
      const nextCompleted = !completedSteps.has(stepId);
      setFinishError(undefined);
      setPendingSteps((current) => new Set(current).add(stepId));
      setStepOverrides((current) => new Map(current).set(stepId, nextCompleted));
      try {
        const id = await ensureInstance();
        await stepToggle.mutateAsync({
          userId: ownerId,
          instanceId: id,
          stepId,
          completed: nextCompleted,
        });
      } catch (error) {
        // Roll the optimistic flip back and surface the failure.
        setStepOverrides((current) => {
          const next = new Map(current);
          next.delete(stepId);
          return next;
        });
        setFinishError(
          error instanceof Error ? error.message : 'Could not save this step. Please try again.',
        );
      } finally {
        setPendingSteps((current) => {
          const next = new Set(current);
          next.delete(stepId);
          return next;
        });
      }
    },
    [isInstance, ownerId, pendingSteps, completedSteps, ensureInstance, stepToggle],
  );

  const finishOccurrence = useCallback(
    async (status: PersistedTaskInstanceStatus) => {
      if (!isInstance || !ownerId) {
        return;
      }
      setFinishError(undefined);
      const resolvedAt = new Date().toISOString();
      try {
        const id = await ensureInstance();
        // The backend rejects COMPLETED unless every step is marked complete on
        // the instance, but step check-off is UI-only — so persist all steps as
        // complete first. (SKIPPED has no such requirement.)
        if (status === 'COMPLETED') {
          const stepList = stepsQuery.data?.pages.flatMap((page) => page.items) ?? [];
          await Promise.all(
            stepList.map((step) =>
              setStepCompletion.mutateAsync({
                userId: ownerId,
                instanceId: id,
                stepId: step.stepId,
                completed: true,
              }),
            ),
          );
        }
        await updateStatus.mutateAsync({ userId: ownerId, instanceId: id, status });
        // Mirror into the in-memory store so the calendar reflects it instantly
        // even before the invalidated feed refetches.
        if (occKey && (status === 'COMPLETED' || status === 'SKIPPED')) {
          setOccurrenceStatus(occKey, status, resolvedAt);
        }
        navigation.goBack();
      } catch (error) {
        setFinishError(error instanceof Error ? error.message : 'Could not save. Please try again.');
      }
    },
    [isInstance, ownerId, ensureInstance, updateStatus, setStepCompletion, stepsQuery.data, occKey, navigation],
  );

  const unskipOccurrence = useCallback(async () => {
    if (!isInstance || !ownerId) {
      return;
    }
    setFinishError(undefined);
    const now = new Date();
    try {
      const id = await ensureInstance();
      await updateStatus.mutateAsync({ userId: ownerId, instanceId: id, status: 'IN_PROGRESS' });
      if (occKey && scheduledDate && scheduledTime) {
        const scheduledMs = scheduledOccurrenceMs(scheduledFor, scheduledDate, scheduledTime);
        setOccurrenceStatus(
          occKey,
          Number.isFinite(scheduledMs) && now.getTime() > scheduledMs
            ? 'OVERDUE'
            : 'IN_PROGRESS',
        );
      }
      navigation.goBack();
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Could not un-skip. Please try again.');
    }
  }, [
    isInstance,
    ownerId,
    ensureInstance,
    updateStatus,
    occKey,
    scheduledDate,
    scheduledTime,
    scheduledFor,
    navigation,
  ]);


  const steps = useMemo(
    () =>
      [...(stepsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => a.order - b.order,
      ),
    [stepsQuery.data],
  );
  const doneCount = useMemo(
    () => steps.filter((step) => completedSteps.has(step.stepId)).length,
    [steps, completedSteps],
  );

  // Allow playback through the iOS silent switch, and stop any in-flight speech
  // when leaving the screen.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => {
      void Speech.stop();
    };
  }, []);

  const activateStep = useCallback((stepId: string) => setActiveStepId(stepId), []);
  const deactivateStep = useCallback(
    (stepId: string) => setActiveStepId((current) => (current === stepId ? undefined : current)),
    [],
  );

  // The step player (StepDetail) reports the step it's showing via
  // `focusStepId` as the user pages, so this list re-centres on that card
  // before they navigate back. Layouts are captured per card wrapper.
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeightRef = useRef(0);
  const stepListYRef = useRef(0);
  const stepLayoutsRef = useRef(new Map<string, { y: number; height: number }>());
  const focusStepId = route.params.focusStepId;
  useEffect(() => {
    if (!focusStepId) {
      return;
    }
    const item = stepLayoutsRef.current.get(focusStepId);
    if (!item) {
      return;
    }
    const centeredY = Math.max(
      0,
      stepListYRef.current + item.y - Math.max(0, (viewportHeightRef.current - item.height) / 2),
    );
    // No animation: this runs while the player is still on top, so the list
    // is already in place the moment the user returns.
    scrollRef.current?.scrollTo({ y: centeredY, animated: false });
  }, [focusStepId]);

  const stepCount = steps.length;
  const allDone = isInstance && stepCount > 0 && doneCount === stepCount;
  const isLoading =
    taskQuery.isLoading ||
    stepsQuery.isLoading ||
    (isInstance && Boolean(instanceId) && instanceStepsQuery.isLoading);
  const error = taskQuery.error?.message;

  // Offer to mark the occurrence done the moment the last step is checked off
  // (transition only — entering the screen with everything already checked, or
  // the server state still loading in, stays quiet).
  const canPromptAllDone = allDone && isMaterialized && !isCompletedOcc && !isSkippedOcc;
  const stepsReady = !isInstance || !instanceId || instanceStepsQuery.data !== undefined;
  const prevAllDoneRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!stepsReady) {
      prevAllDoneRef.current = undefined;
      return;
    }
    const prev = prevAllDoneRef.current;
    prevAllDoneRef.current = allDone;
    if (prev === false && canPromptAllDone) {
      setAllDonePrompt('auto');
    }
  }, [stepsReady, allDone, canPromptAllDone]);

  // Leaving with every step checked but the task not marked done? Ask first.
  const handleBack = useCallback(() => {
    if (canPromptAllDone) {
      setAllDonePrompt('back');
      return;
    }
    navigation.goBack();
  }, [canPromptAllDone, navigation]);

  if (isLoading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.stateText}>Loading task…</Text>
      </View>
    );
  }

  if (error || !taskQuery.data) {
    return (
      <View style={styles.centeredState}>
        <Ionicons name="alert-circle" size={36} color={colors.danger} />
        <Text accessibilityRole="alert" style={styles.stateText}>
          {error ?? 'This task could not be found.'}
        </Text>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
      </View>
    );
  }

  const task = taskQuery.data;
  const startControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isFinishing }}
      accessibilityLabel={isOverdueOcc ? `Start ${task.title} now` : `Start ${task.title}`}
      disabled={isFinishing}
      onPress={() => setStartConfirmVisible(true)}
      style={({ pressed }) => [
        styles.statusNotice,
        styles.statusNoticeUnskip,
        pressed ? styles.pressed : null,
        isFinishing ? styles.statusNoticeDisabled : null,
      ]}
    >
      <Ionicons
        name="play"
        size={20}
        color={isFinishing ? colors.disabled : colors.onPrimary}
      />
      <Text
        style={[
          styles.statusNoticeText,
          { color: isFinishing ? colors.disabled : colors.onPrimary },
        ]}
      >
        {isFinishing ? 'Starting…' : isOverdueOcc ? 'Start now' : 'Start'}
      </Text>
    </Pressable>
  );
  const unskipControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isFinishing }}
      accessibilityLabel="Un-skip this task"
      disabled={isFinishing}
      onPress={() => setUnskipConfirmVisible(true)}
      style={({ pressed }) => [
        styles.statusNotice,
        styles.statusNoticeUnskip,
        pressed ? styles.pressed : null,
        isFinishing ? styles.statusNoticeDisabled : null,
      ]}
    >
      <Ionicons
        name="arrow-undo"
        size={20}
        color={isFinishing ? colors.disabled : colors.onPrimary}
      />
      <Text
        style={[
          styles.statusNoticeText,
          { color: isFinishing ? colors.disabled : colors.onPrimary },
        ]}
      >
        {isFinishing ? 'Saving…' : 'Un-skip'}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={handleBack} variant="dark" />
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={styles.headerTitle}
        >
          {task.title}
        </Text>
        {/* Instance mode → occurrence detail; template mode → task details/edit
            (Simple Mode hides the menu entirely). */}
        {isInstance ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open occurrence details"
            onPress={() =>
              navigation.navigate('OccurrenceDetail', {
                assignmentId: assignmentId as string,
                taskId,
                taskTitle: task.title,
                scheduledDate: scheduledDate as string,
                scheduledTime: scheduledTime as string,
                status: 'TO_DO',
                isVirtual: !instanceId,
              })
            }
            style={({ pressed }) => [styles.menuButton, pressed ? styles.pressed : null]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        ) : simpleMode ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open task details"
            onPress={() => navigation.navigate('TaskDetail', { taskId })}
            style={({ pressed }) => [styles.menuButton, pressed ? styles.pressed : null]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        )}
      </View>

      {/* Skipped occurrence: un-skip is the only action offered; the progress
          bar and list below are a read-only record of what was done. */}
      {isSkippedOcc ? <View style={styles.unskipBar}>{unskipControl}</View> : null}

      {/* Not-yet-started occurrence: in-page start, mirroring the calendar
          card's To Do / "Start now" button. Starting flips this same screen
          into the live runner (progress bar + check-offs) in place. */}
      {canStartOccurrence ? (
        <View style={[styles.unskipBar, styles.startBar]}>{startControl}</View>
      ) : null}

      {isInstance && stepCount > 0 && isMaterialized ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>
              {doneCount} of {stepCount} steps done
            </Text>
            {isCompletedOcc ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            ) : allDone ? (
              <Ionicons name="checkmark-circle" size={22} color={TEAL_DARK} />
            ) : null}
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${stepCount ? (doneCount / stepCount) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.scrollArea}>
        <ScrollView
          ref={scrollRef}
          onLayout={(event) => {
            viewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isOverdueOcc ? (
            <View style={styles.overdueBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.overdueBannerText}>
                Overdue — you can still finish or skip this.
              </Text>
            </View>
          ) : null}

          {stepCount === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={40} color={colors.primary} />
              <Text style={styles.emptyTitle}>No steps yet</Text>
              <Text style={styles.emptyText}>This task doesn’t have any steps.</Text>
            </View>
          ) : (
            <View
              style={styles.stepList}
              onLayout={(event) => {
                stepListYRef.current = event.nativeEvent.layout.y;
              }}
            >
              {steps.map((step, index) => (
                <View
                  key={step.stepId}
                  onLayout={(event) => {
                    stepLayoutsRef.current.set(step.stepId, {
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    });
                  }}
                >
                <StepCard
                  taskId={taskId}
                  step={step}
                  index={index}
                  isActive={activeStepId === step.stepId}
                  onActivate={activateStep}
                  onDeactivate={deactivateStep}
                  isInstance={isInstance}
                  completed={completedSteps.has(step.stepId)}
                  // Settled occurrences (done/skipped) show state, no actions.
                  showCompletionControl={!isSkippedOcc && !isCompletedOcc && isMaterialized}
                  onToggleComplete={() => void toggleStep(step.stepId)}
                  onOpenDetail={() =>
                    navigation.navigate('StepDetail', {
                      taskId,
                      stepId: step.stepId,
                      ...(isInstance
                        ? {
                            assignmentId,
                            scheduledDate,
                            scheduledTime,
                            instanceId,
                            status: occStatus,
                          }
                        : {}),
                    })
                  }
                />
                </View>
              ))}
            </View>
          )}

          {isInstance && stepCount > 0 && isMaterialized ? (
            isCompletedOcc ? (
              // A done occurrence can't be skipped (req: done ↛ skipped).
              <View style={[styles.statusNotice, styles.statusNoticeDone]}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <Text style={[styles.statusNoticeText, { color: colors.success }]}>Completed</Text>
              </View>
            ) : isSkippedOcc ? null : allDone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Great job, mark this task done"
                accessibilityState={{ disabled: isFinishing }}
                disabled={isFinishing}
                onPress={() => void finishOccurrence('COMPLETED')}
                style={({ pressed }) => [styles.completeButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.completeTitle}>Great job!</Text>
                <Text style={styles.completeSubtitle}>
                  {isFinishing ? 'Saving…' : 'You finished all the steps — tap to mark done.'}
                </Text>
              </Pressable>
            ) : (
              <HoldToSkipButton onComplete={() => setSkipConfirmVisible(true)} />
            )
          ) : null}

          {finishError ? (
            <Text accessibilityRole="alert" style={styles.finishError}>
              {finishError}
            </Text>
          ) : null}
        </ScrollView>

      </View>

      {/* Timing reminder (dialog with a dimmed backdrop, still auto-hides):
          list browsing isn't timed, opened steps are. Backdrop tap dismisses. */}
      {timingHintVisible ? (
        <Pressable
          style={styles.timingHintOverlay}
          onPress={() => setTimingHintVisible(false)}
        >
          {/* No-op press handler so taps on the dialog body don't fall
              through to the dismissing backdrop (same trick as ConfirmDialog). */}
          <Pressable style={styles.timingHintDialog} onPress={() => {}}>
            <Ionicons name="time-outline" size={28} color={colors.text} />
            <Text style={styles.timingHintTitle}>Step timing</Text>
            <Text style={styles.timingHintMessage}>
              Time on this list isn’t counted — open a step to track your active time.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss timing reminder"
              onPress={() => setTimingHintVisible(false)}
              style={({ pressed }) => [
                styles.timingHintButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.timingHintButtonText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={startConfirmVisible}
        title="Start this task?"
        message="Once you start, this task can't be deleted anymore — it can only be skipped."
        confirmLabel="Start"
        cancelLabel="Cancel"
        onConfirm={() => {
          void handleStartOccurrence();
        }}
        onCancel={() => setStartConfirmVisible(false)}
      />
      <ConfirmDialog
        visible={skipConfirmVisible}
        title="Skip this task?"
        message="This will mark the whole task as skipped for this occurrence."
        confirmLabel="Skip"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setSkipConfirmVisible(false);
          void finishOccurrence('SKIPPED');
        }}
        onCancel={() => setSkipConfirmVisible(false)}
      />
      <ConfirmDialog
        visible={unskipConfirmVisible}
        title="Un-skip this task?"
        message="This task will return to To Do if it is before the scheduled time, or Overdue if it is after."
        confirmLabel="Un-skip"
        cancelLabel="Cancel"
        onConfirm={() => {
          setUnskipConfirmVisible(false);
          void unskipOccurrence();
        }}
        onCancel={() => setUnskipConfirmVisible(false)}
      />
      <ConfirmDialog
        visible={allDonePrompt !== null}
        title="All steps done!"
        message="Great work — do you want to mark this task as done now?"
        confirmLabel="Mark as done"
        cancelLabel="Later"
        onConfirm={() => {
          setAllDonePrompt(null);
          void finishOccurrence('COMPLETED');
        }}
        onCancel={() => {
          const source = allDonePrompt;
          setAllDonePrompt(null);
          if (source === 'back') {
            navigation.goBack();
          }
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
  centeredState: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    ...typography.title,
    color: colors.text,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  scrollArea: {
    flex: 1,
  },
  // Floating un-skip pill pinned over the top of the scrolling step list.
  // Skipped occurrence: un-skip sits statically between the header and the
  // progress bar, above the scrolling read-only step record.
  unskipBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  // The start bar sits directly above the step list / overdue banner, so give
  // it extra breathing room (the un-skip bar is followed by the progress bar,
  // which brings its own spacing).
  startBar: {
    paddingBottom: spacing.lg,
  },
  // Dialog-shaped "list time isn't tracked" reminder. Dimmed backdrop matching
  // ConfirmDialog's so it reads as a real prompt; still auto-hides.
  timingHintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(20, 14, 6, 0.45)',
  },
  timingHintDialog: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    ...shadow.cardStrong,
  },
  timingHintTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  timingHintMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  timingHintButton: {
    minHeight: 56,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  timingHintButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  emptyState: {
    minHeight: 220,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  stepList: {
    gap: spacing.lg,
  },
  stepCard: {
    overflow: 'hidden',
    borderRadius: radius.lg + spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  mediaWrap: {
    position: 'relative',
  },
  stepMedia: {
    width: '100%',
    height: 190,
    backgroundColor: '#000',
  },
  // Translucent speaker pill over a step photo (top-left). Two states keep it in
  // sync with the row speaker: idle (dark, icon only) vs playing (accent + label).
  audioOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    opacity: 0.8,
  },
  audioOverlayIdle: {
    backgroundColor: 'rgba(27,34,48,0.65)',
  },
  audioOverlayActive: {
    backgroundColor: colors.primary,
  },
  audioOverlayText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 12,
    color: colors.onPrimary,
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  videoPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  audioWrap: {
    padding: spacing.lg,
    paddingBottom: 0,
  },
  audioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: TEAL_LIGHT,
  },
  audioPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioBarInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  audioBarLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: TEAL,
  },
  audioTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: `${TEAL}33`,
    overflow: 'hidden',
  },
  audioTrackFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: TEAL,
  },
  progressWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressLabel: {
    ...typography.bodyStrong,
    color: TEAL,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  completedCheck: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEAL,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  stepRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stepNumberDone: {
    backgroundColor: TEAL,
  },
  stepTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  checkButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEAL_LIGHT,
  },
  checkButtonDone: {
    backgroundColor: '#FDE7E7',
  },
  stepNumberText: {
    ...typography.bodyStrong,
    fontSize: 18,
    color: colors.onPrimary,
  },
  stepTitle: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  listenButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDEDE8',
  },
  listenButtonActive: {
    backgroundColor: colors.primary,
  },
  completeButton: {
    minHeight: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: TEAL,
    ...shadow.cardStrong,
  },
  completeTitle: {
    ...typography.title,
    fontSize: 22,
    color: colors.onPrimary,
  },
  completeSubtitle: {
    ...typography.body,
    color: colors.onPrimary,
    opacity: 0.95,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  skipButton: {
    overflow: 'hidden',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  skipFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.45,
  },
  skipText: {
    ...typography.button,
    color: colors.textMuted,
  },
  finishError: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FEE8E8',
  },
  overdueBannerText: {
    ...typography.bodyStrong,
    color: colors.danger,
    flexShrink: 1,
  },
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusNoticeDone: {
    backgroundColor: '#EAF7EF',
    borderColor: '#BFE6CE',
  },
  statusNoticeUnskip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    ...shadow.cardStrong,
  },
  statusNoticeDisabled: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.border,
  },
  statusNoticeText: {
    ...typography.button,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
