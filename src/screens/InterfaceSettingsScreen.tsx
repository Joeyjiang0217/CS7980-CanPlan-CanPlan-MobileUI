import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StartingPage } from '../features/settings/interfaceSettings';
import {
  updateInterfaceSettings,
  useInterfaceSettings,
} from '../features/settings/interfaceSettings';
import type { MainStackParamList } from '../navigation/types';
import BackButton from '../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type InterfaceSettingsNavigation = NativeStackNavigationProp<MainStackParamList, 'Interface'>;

const STARTING_PAGE_OPTIONS: Array<{ value: StartingPage; label: string }> = [
  { value: 'CALENDAR', label: 'Calendar' },
  { value: 'ALL_TASKS', label: 'All Tasks' },
  { value: 'CATEGORIES', label: 'Categories' },
];

/** Toggle options in display order; values live in the persisted settings. */
type ToggleKey =
  | 'simpleMode'
  | 'allowChangingDate'
  | 'useCategories'
  | 'showOverdue'
  | 'onlyToday';

const TOGGLE_OPTIONS: Array<{ key: ToggleKey; label: string }> = [
  { key: 'simpleMode', label: "Enable 'Simple Mode'" },
  { key: 'allowChangingDate', label: 'Allow Changing Date in Calendar' },
  { key: 'useCategories', label: 'Use Categories to Manage Tasks' },
  { key: 'showOverdue', label: 'Show Overdue Tasks on Launch' },
  { key: 'onlyToday', label: "Only Show Today's Tasks" },
];

export default function InterfaceSettingsScreen() {
  const navigation = useNavigation<InterfaceSettingsNavigation>();
  const insets = useSafeAreaInsets();

  // Persisted locally (AsyncStorage) — survives leaving and re-entering this
  // screen and app restarts. Wiring these values into app behavior is the
  // next pass.
  const settings = useInterfaceSettings();

  // Categories can't be a starting page while categories are disabled.
  const startingPageOptions = settings.useCategories
    ? STARTING_PAGE_OPTIONS
    : STARTING_PAGE_OPTIONS.filter((option) => option.value !== 'CATEGORIES');

  const setToggleValue = (key: ToggleKey, next: boolean) => {
    // Turning categories off while Categories is the chosen starting page
    // would leave a hidden ("ghost") selection — fall back to the default.
    if (key === 'useCategories' && !next && settings.startingPage === 'CATEGORIES') {
      updateInterfaceSettings({ useCategories: false, startingPage: 'CALENDAR' });
      return;
    }
    updateInterfaceSettings({ [key]: next });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Interface
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {settings.simpleMode ? (
          <>
            <Text style={styles.sectionLabel}>STARTING PAGE</Text>
            <Text style={styles.sectionSubtitle}>
              Only visible when Simple Mode is enabled
            </Text>

            <View style={styles.card}>
              {startingPageOptions.map((option, index) => {
                const isSelected = settings.startingPage === option.value;
                return (
                  <Fragment key={option.value}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => updateInterfaceSettings({ startingPage: option.value })}
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
          </>
        ) : null}

        <Text
          style={[styles.sectionLabel, settings.simpleMode ? styles.sectionSpacer : null]}
        >
          OPTIONS
        </Text>

        <View style={styles.card}>
          {TOGGLE_OPTIONS.map((option, index) => (
            <Fragment key={option.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{option.label}</Text>
                <Switch
                  accessibilityLabel={option.label}
                  value={settings[option.key]}
                  onValueChange={(next) => setToggleValue(option.key, next)}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                  ios_backgroundColor={colors.disabled}
                />
              </View>
            </Fragment>
          ))}
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
  },
  sectionSpacer: {
    marginTop: spacing.xl,
  },
  sectionSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.md,
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
});
