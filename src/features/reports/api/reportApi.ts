import { canPlanApi } from '../../../shared/api/canplanApi';
import { GraphQLRequestError } from '../../../shared/api/errors';
import type {
  GenerateReportInput,
  PageInput,
  Report,
  ReportDocument,
} from '../../../shared/api/canplanTypes';

export function listReports(userId: string, page?: PageInput) {
  return canPlanApi.listReports(userId, page);
}

/** Generate and persist a report in one call; returns the saved Report. */
export function generateReport(input: GenerateReportInput): Promise<Report> {
  return canPlanApi.generateReport(input);
}

/** Mints a fresh presigned URL, then downloads the full report JSON from S3. */
export async function fetchReportDocument(
  userId: string,
  reportId: string,
): Promise<ReportDocument> {
  const target = await canPlanApi.getReportDownloadUrl(userId, reportId);
  const response = await fetch(target.downloadUrl);
  if (!response.ok) {
    throw new GraphQLRequestError(
      `Report download failed (HTTP ${response.status}).`,
      { statusCode: response.status },
    );
  }
  return (await response.json()) as ReportDocument;
}
