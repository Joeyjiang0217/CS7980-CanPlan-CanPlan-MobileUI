import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NotificationAlertPreference } from '../features/notifications/alertPreference';
import {
  setNotificationAlertPreference,
  useNotificationAlertPreference,
} from '../features/notifications/alertPreference';
import {
  ensureNotificationPermission,
  hasNotificationPermission,
} from '../features/notifications/permissions';
import { requestTaskReminderResync } from '../features/notifications/taskReminders';
import type { MainStackParamList } from '../navigation/types';
import BackButton from '../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type NotificationsNavigation = NativeStackNavigationProp<MainStackParamList, 'Notifications'>;

const ALERT_OPTIONS: Array<{ value: NotificationAlertPreference; label: string }> = [
  { value: 'NONE', label: 'None' },
  { value: 'FIFTEEN_MINUTES_BEFORE', label: '15 Minutes Before Event' },
  { value: 'AT_TIME', label: 'At Time of Event' },
];

export default function NotificationsSettingsScreen() {
  const navigation = useNavigation<NotificationsNavigation>();
  const insets = useSafeAreaInsets();

  const selected = useNotificationAlertPreference();
  // Shown when reminders are on (or were just requested) but the OS permission
  // is denied — the iOS dialog only appears once, so we link to Settings.
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  useEffect(() => {
    // Granted always clears the banner (e.g. returning from system settings);
    // a missing permission only raises it when reminders are actually on —
    // never lowers it, so the deny flow's banner survives the revert to NONE.
    let stale = false;
    const check = () => {
      void hasNotificationPermission().then((granted) => {
        if (stale) {
          return;
        }
        if (granted) {
          setPermissionBlocked(false);
        } else if (selected !== 'NONE') {
          setPermissionBlocked(true);
        }
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => {
      stale = true;
      subscription.remove();
    };
  }, [selected]);

  const choose = useCallback(async (value: NotificationAlertPreference) => {
    if (value !== 'NONE') {
      const permission = await ensureNotificationPermission();
      if (permission !== 'granted') {
        // Stay on None rather than silently arming reminders that can't fire.
        setPermissionBlocked(true);
        await setNotificationAlertPreference('NONE');
        requestTaskReminderResync();
        return;
      }
    }
    setPermissionBlocked(false);
    await setNotificationAlertPreference(value);
    requestTaskReminderResync(0);
  }, []);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Notifications
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>NOTIFICATIONS ALERT</Text>

        <View style={styles.card}>
          {ALERT_OPTIONS.map((option, index) => {
            const isSelected = selected === option.value;
            return (
              <Fragment key={option.value}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => void choose(option.value)}
                  style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                >
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={24} color={colors.primary} />
                  ) : null}
                </Pressable>
              </Fragment>
            );
          })}
        </View>

        {permissionBlocked ? (
          <View style={styles.permissionBanner}>
            <Ionicons name="notifications-off-outline" size={22} color={colors.textMuted} />
            <View style={styles.permissionBody}>
              <Text style={styles.permissionText}>
                Notifications are turned off for CanPlan. Allow them in system
                settings to get task reminders.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open system settings"
                onPress={() => void Linking.openSettings()}
              >
                <Text style={styles.permissionLink}>Open Settings</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
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
    minHeight: 64,
  },
  rowPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  rowLabel: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  permissionBody: {
    flex: 1,
    gap: spacing.sm,
  },
  permissionText: {
    ...typography.body,
    color: colors.textMuted,
  },
  permissionLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});
