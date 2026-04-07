import type { AnalyzeSuccessResponse } from "../contracts/analyzeContracts";
import { prisma } from "../db/client";
import { AnalysisRun } from "../generated/prisma/client";

export type AnalysisRunRecord = {
  id: string;
  cacheFingerprint: string;
  contentFingerprint: string;
  focusAuthor: string;
  source: string;
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  commitCount: number;
  activeDays: number;
  signal: string;
  response: AnalyzeSuccessResponse;
  metrics: Record<string, unknown> | null;
  createdAt: Date;
};

function mapRecord(record: AnalysisRun): AnalysisRunRecord {
  return {
    id: record.id,
    cacheFingerprint: record.cacheFingerprint,
    contentFingerprint: record.contentFingerprint,
    focusAuthor: record.focusAuthor,
    source: record.source,
    pipelineVersion: record.pipelineVersion,
    insightsVersion: record.insightsVersion,
    model: record.model,
    promptVersion: record.promptVersion,
    dateFrom: record.dateFrom,
    dateTo: record.dateTo,
    commitCount: record.commitCount,
    activeDays: record.activeDays,
    signal: record.signal,
    response: record.responseJson as AnalyzeSuccessResponse,
    metrics:
      record.metricsJson && typeof record.metricsJson === "object"
        ? (record.metricsJson as Record<string, unknown>)
        : null,
    createdAt: record.createdAt,
  };
}

export async function saveAnalysisRun(input: {
  cacheFingerprint: string;
  contentFingerprint: string;
  focusAuthor: string;
  source: "git-log";
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  commitCount: number;
  activeDays: number;
  signal: "low" | "medium" | "high";
  response: AnalyzeSuccessResponse;
  metrics?: Record<string, unknown>;
}): Promise<AnalysisRunRecord> {
  const record = await prisma.analysisRun.create({
    data: {
      cacheFingerprint: input.cacheFingerprint,
      contentFingerprint: input.contentFingerprint,
      focusAuthor: input.focusAuthor,
      source: input.source,
      pipelineVersion: input.pipelineVersion,
      insightsVersion: input.insightsVersion,
      model: input.model,
      promptVersion: input.promptVersion ?? null,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : null,
      dateTo: input.dateTo ? new Date(input.dateTo) : null,
      commitCount: input.commitCount,
      activeDays: input.activeDays,
      signal: input.signal,
      responseJson: input.response,
      metricsJson: input.metrics ? (input.metrics as any) : null,
    },
  });

  return mapRecord(record);
}

export async function listAnalysisRuns(input?: {
  focusAuthor?: string;
  limit?: number;
}): Promise<AnalysisRunRecord[]> {
  const records = await prisma.analysisRun.findMany({
    where: {
      ...(input?.focusAuthor ? { focusAuthor: input.focusAuthor } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 20,
  });

  return records.map(mapRecord);
}

export async function findAnalysisRunById(
  id: string,
): Promise<AnalysisRunRecord | null> {
  const record = await prisma.analysisRun.findUnique({
    where: { id },
  });

  return record ? mapRecord(record) : null;
}
