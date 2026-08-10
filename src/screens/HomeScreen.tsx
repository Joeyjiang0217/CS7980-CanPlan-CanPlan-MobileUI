import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../app/SessionContext';
import { useCurrentUser, useSignOut } from '../features/auth';
import { useInterfaceSettings } from '../features/settings/interfaceSettings';
import { useMyProfile } from '../features/users/hooks/useMyProfile';
import type { MainStackParamList } from '../navigation/types';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

interface DestinationCardProps {
  title: string;
  subtitle: string;
  onPress: () => void;
}

type HomeNavigation = NativeStackNavigationProp<MainStackParamList, 'Home'>;

function DestinationCard({ title, subtitle, onPress }: DestinationCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={26} color={colors.onPrimary} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const insets = useSafeAreaInsets();
  const { isGuest, exitGuestMode } = useSession();
  const { data: currentUser } = useCurrentUser();
  // In guest mode there is no profile to fetch — skip the query.
  const { data: profile } = useMyProfile({ enabled: !!currentUser && !isGuest });
  // Interface setting: hide the Categories entry point when categories aren't
  // used to manage tasks.
  const { useCategories } = useInterfaceSettings();
  const signOutMutation = useSignOut();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );

  // Prefer the profile's displayName (real, user-provided). Fall back to
  // a friendly placeholder when in guest mode or while the profile loads.
  const greetingName =
    profile?.displayName?.trim() || (isGuest ? 'there' : 'there');

  const handleSignOut = () => setConfirmVisible(true);
  const handleStaySignedIn = () => setConfirmVisible(false);
  const handleConfirmSignOut = () => {
    setConfirmVisible(false);
    // Defer the auth-state change so the modal's close animation finishes
    // before this screen unmounts. Tearing down the screen mid-animation
    // can crash the native modal controller on iOS.
    setTimeout(() => {
      // Always clear BOTH bits of session state so we land on SignIn no
      // matter how we got here. (Earlier the if/else made sign-out a no-op
      // for one when the other was set — e.g. guest mode lingering after a
      // real sign-in would skip the Cognito signOut call.)
      exitGuestMode();
      if (currentUser) {
        signOutMutation.mutate();
      }
    }, 250);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={styles.date}>{dateLabel}</Text>

          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => navigation.navigate('Settings')}
              style={({ pressed }) => [styles.iconBtn, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              style={({ pressed }) => [styles.signOutChip, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.greeting}>Hi {greetingName}!</Text>
        <Text style={styles.prompt}>What would you like to do today?</Text>

        <View style={styles.cardList}>
          <DestinationCard
            title="All Tasks"
            subtitle="View and manage all your tasks"
            onPress={() => navigation.navigate('AllTasks')}
          />
          {useCategories ? (
            <DestinationCard
              title="Categories"
              subtitle="Browse tasks by category"
              onPress={() => navigation.navigate('Categories')}
            />
          ) : null}
          <DestinationCard
            title="Calendar"
            subtitle="See your scheduled tasks"
            onPress={() => navigation.navigate('Calendar')}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmVisible}
        title="Sign out?"
        message="You will need to sign in again next time."
        confirmLabel="Yes, sign out"
        cancelLabel="Stay signed in"
        destructive
        onConfirm={handleConfirmSignOut}
        onCancel={handleStaySignedIn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  date: {
    ...typography.body,
    color: colors.textMuted,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutChip: {
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {
    backgroundColor: colors.border,
  },
  signOutText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  greeting: {
    ...typography.display,
    color: colors.text,
  },
  prompt: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  cardList: {
    gap: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    minHeight: 110,
    ...shadow.cardStrong,
  },
  cardPressed: {
    backgroundColor: colors.primaryDark,
  },
  cardTextWrap: {
    flex: 1,
    paddingRight: spacing.md,
  },
  cardTitle: {
    ...typography.title,
    color: colors.onPrimary,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.onPrimary,
    opacity: 0.92,
    marginTop: spacing.xs,
  },
});
