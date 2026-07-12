import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../navigation/types';
import BackButton from '../shared/components/BackButton';
import PercentSlider from '../shared/components/PercentSlider';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type AudioSpeechNavigation = NativeStackNavigationProp<MainStackParamList, 'AudioSpeech'>;

export default function AudioSpeechSettingsScreen() {
  const navigation = useNavigation<AudioSpeechNavigation>();
  const insets = useSafeAreaInsets();

  // UI-only for now — nothing is persisted yet.
  const [autoPlayStepSounds, setAutoPlayStepSounds] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState(50);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Audio & Speech
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
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Automatically Play Step Sounds</Text>
            <Switch
              accessibilityLabel="Automatically Play Step Sounds"
              value={autoPlayStepSounds}
              onValueChange={setAutoPlayStepSounds}
              trackColor={{ false: colors.disabled, true: colors.primary }}
              thumbColor={colors.onPrimary}
              ios_backgroundColor={colors.disabled}
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionSpacer]}>
          SPEECH SPEED — {speechSpeed}%
        </Text>

        <View style={styles.card}>
          <View style={styles.sliderCardContent}>
            <PercentSlider
              value={speechSpeed}
              onChange={setSpeechSpeed}
              accessibilityLabel="Speech speed"
            />
          </View>
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
    paddingTop: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  sectionSpacer: {
    marginTop: spacing.xl,
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
  rowLabel: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  sliderCardContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
});
