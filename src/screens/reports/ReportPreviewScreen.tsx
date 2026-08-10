import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ReportBody from '../../features/reports/components/ReportBody';
import { useSaveReport } from '../../features/reports/hooks/useReports';
import type { MainStackParamList } from '../../navigation/types';
import type {
  ReportDateRange,
  ReportStats,
  SaveReportInput,
} from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, spacing, typography } from '../../shared/theme/tokens';

type ReportPreviewRoute = RouteProp<MainStackParamList, 'ReportPreview'>;
type ReportPreviewNavigation = NativeStackNavigationProp<MainStackParamList, 'ReportPreview'>;

/** Safely decode one AWSJSON string; returns null on malformed content. */
function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export default function ReportPreviewScreen() {
  const navigation = useNavigation<ReportPreviewNavigation>();
  const route = useRoute<ReportPreviewRoute>();
  const insets = useSafeAreaInsets();
  const { userId, draft } = route.params;

  const saveMutation = useSaveReport();

  // The AWSJSON fields are kept as raw strings on `draft` so they can be handed
  // back to saveReport verbatim; parse copies here only for display.
  const stats = useMemo(() => parseJson<ReportStats>(draft.stats), [draft.stats]);
  const dateRange = useMemo(
    () => parseJson<ReportDateRange>(draft.dateRange),
    [draft.dateRange],
  );

  const handleSave = () => {
    const input: SaveReportInput = {
      draftToken: draft.draftToken,
      scope: draft.scope,
      dateRange: draft.dateRange,
      generatedAt: draft.generatedAt,
      narrative: draft.narrative,
      stats: draft.stats,
    };
    saveMutation.mutate(input, {
      // Replace so Back from the saved report returns to the report list, not
      // this now-consumed preview.
      onSuccess: (report) =>
        navigation.replace('ReportView', { userId, reportId: report.reportId }),
      onError: (error: unknown) =>
        Alert.alert(
          'Could not save the report',
          error instanceof Error ? error.message : 'Please try again.',
        ),
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Report preview</Text>
        <View style={styles.topSpacer} />
      </View>

      {!stats || !dateRange ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            This preview could not be displayed. Please generate the report again.
          </Text>
        </View>
      ) : (
        <ReportBody
          narrative={draft.narrative}
          stats={stats}
          dateRange={dateRange}
          contentPaddingBottom={insets.bottom + spacing.xxl}
          footer={
            <View style={styles.footer}>
              <Text style={styles.previewNote}>
                This preview isn’t saved yet. Save it to keep it in the report history.
              </Text>
              <PrimaryButton
                label="Save report"
                onPress={handleSave}
                loading={saveMutation.isPending}
              />
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  topTitle: {
    ...typography.heading,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 42,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    gap: spacing.md,
  },
  previewNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
