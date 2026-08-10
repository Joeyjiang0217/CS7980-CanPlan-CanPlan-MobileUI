import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ReportBody from '../../features/reports/components/ReportBody';
import { useReportDocument } from '../../features/reports/hooks/useReports';
import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, spacing, typography } from '../../shared/theme/tokens';

type ReportViewRoute = RouteProp<MainStackParamList, 'ReportView'>;
type ReportViewNavigation = NativeStackNavigationProp<MainStackParamList, 'ReportView'>;

export default function ReportViewScreen() {
  const navigation = useNavigation<ReportViewNavigation>();
  const route = useRoute<ReportViewRoute>();
  const insets = useSafeAreaInsets();
  const { userId, reportId } = route.params;

  const documentQuery = useReportDocument(userId, reportId);
  const doc = documentQuery.data;

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Progress Report</Text>
        <View style={styles.topSpacer} />
      </View>

      {documentQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : documentQuery.isError || !doc ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load this report. Please try again.</Text>
          <PrimaryButton
            label="Retry"
            onPress={() => void documentQuery.refetch()}
            style={styles.retryBtn}
          />
        </View>
      ) : (
        <ReportBody
          narrative={doc.narrative}
          stats={doc.stats}
          dateRange={doc.dateRange}
          contentPaddingBottom={insets.bottom + spacing.xxl}
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
  retryBtn: {
    alignSelf: 'stretch',
  },
});
