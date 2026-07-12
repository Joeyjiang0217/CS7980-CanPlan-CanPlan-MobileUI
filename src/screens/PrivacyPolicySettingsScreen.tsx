import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../navigation/types';
import BackButton from '../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type PrivacyPolicyNavigation = NativeStackNavigationProp<MainStackParamList, 'PrivacyPolicy'>;

const LINK_COLOR = '#3E6EE8';
const PRIVACY_POLICY_URL =
  'https://www.uvic.ca/general-counsel/privacy-access/policies-and-procedures/index.php';

export default function PrivacyPolicySettingsScreen() {
  const navigation = useNavigation<PrivacyPolicyNavigation>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Privacy Policy
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
          <Text style={styles.cardLabel}>Privacy Policy</Text>
          {/* UI-only for now — opening the link will be wired up later. */}
          <Text style={styles.link}>{PRIVACY_POLICY_URL}</Text>
        </View>

        {/* UI-only for now — copying to the clipboard will be wired up later. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy link"
          style={({ pressed }) => [styles.copyButton, pressed ? styles.copyButtonPressed : null]}
        >
          <Text style={styles.copyText}>Copy link</Text>
        </Pressable>
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
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  cardLabel: {
    ...typography.bodyStrong,
    color: colors.textMuted,
  },
  link: {
    ...typography.heading,
    fontWeight: '400',
    color: LINK_COLOR,
  },
  copyButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  copyButtonPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  copyText: {
    ...typography.heading,
    color: LINK_COLOR,
  },
});
