import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInterfaceSettings } from '../features/settings/interfaceSettings';
import { useMyProfile } from '../features/users/hooks/useMyProfile';
import type { MainStackParamList } from '../navigation/types';
import { rootRouteName } from '../navigation/rootRoute';
import BackButton from '../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type SettingsNavigation = NativeStackNavigationProp<MainStackParamList, 'Settings'>;

const APP_VERSION = '2.0.0';

interface SettingsItem {
  label: string;
  /** Where tapping the row navigates. Omit for sections not built yet. */
  route?: 'Interface' | 'Notifications' | 'AudioSpeech' | 'Statistics' | 'PrivacyPolicy';
}

// The settings hub. Only the rows with a `route` are wired up so far; the
// others are placeholders for screens that don't exist yet.
const ITEMS: SettingsItem[] = [
  { label: 'Notifications', route: 'Notifications' },
  { label: 'Interface', route: 'Interface' },
  { label: 'Audio & Speech', route: 'AudioSpeech' },
  { label: 'iCloud Settings' },
  { label: 'Statistics', route: 'Statistics' },
  { label: 'Privacy Policy', route: 'PrivacyPolicy' },
];

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const insets = useSafeAreaInsets();
  const { simpleMode, startingPage } = useInterfaceSettings();
  // Cached by the navigation root's own fetch — read here so the back target
  // respects the caregiver role (see rootRouteName).
  const { data: profile } = useMyProfile();

  // Leaving Settings lands on the currently effective root. Two cases:
  //  - root unchanged (the common one — user tweaked ordinary settings):
  //    plain pop back to it, with the normal right-slide back animation;
  //  - root changed (Simple Mode flipped in this visit, Home ↔ simple start
  //    page): the stack bottom is stale, so rebuild it — reset's forward
  //    animation reads fine here because the destination genuinely is a new
  //    screen.
  const handleBack = () => {
    const targetRoot = rootRouteName({ role: profile?.role, simpleMode, startingPage });
    const stackRoot = navigation.getState()?.routes[0]?.name;
    if (stackRoot === targetRoot) {
      navigation.popToTop();
    } else {
      navigation.reset({ index: 0, routes: [{ name: targetRoot }] });
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={handleBack} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {ITEMS.map((item, index) => {
            const disabled = item.route == null;
            return (
              <Fragment key={item.label}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => {
                    if (item.route) {
                      navigation.navigate(item.route);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && !disabled ? styles.rowPressed : null,
                  ]}
                >
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              </Fragment>
            );
          })}
        </View>

        <Text style={styles.version}>App Version: {APP_VERSION}</Text>
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
  version: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
