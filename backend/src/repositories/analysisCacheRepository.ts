import type { AnalyzeSuccessResponse } from "../contracts/analyzeContracts";
import { prisma } from "../db/client";
import { AnalysisCache } from "../generated/prisma/client";

export type CachedAnalysisRecord = {
  id: string;
  fingerprint: string;
  focusAuthor: string;
  source: string;
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion: string | null;
  response: AnalyzeSuccessResponse;
  metrics: Record<string, unknown> | null;
  createdAt: Date;
  lastAccessedAt: Date;
};

function mapRecord(record: AnalysisCache): CachedAnalysisRecord {
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    focusAuthor: record.focusAuthor,
    source: record.source,
    pipelineVersion: record.pipelineVersion,
    insightsVersion: record.insightsVersion,
    model: record.model,
    promptVersion: record.promptVersion,
    response: record.responseJson as AnalyzeSuccessResponse,
    metrics:
      record.metricsJson && typeof record.metricsJson === "object"
        ? (record.metricsJson as Record<string, unknown>)
        : null,
    createdAt: record.createdAt,
    lastAccessedAt: record.lastAccessedAt,
  };
}

export async function findCachedAnalysisByFingerprint(
  fingerprint: string,
): Promise<CachedAnalysisRecord | null> {
  const record = await prisma.analysisCache.findUnique({
    where: { fingerprint },
  });

  return record ? mapRecord(record) : null;
}

export async function saveCachedAnalysis(input: {
  fingerprint: string;
  focusAuthor: string;
  source: "git-log";
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion?: string | null;
  response: AnalyzeSuccessResponse;
  metrics?: Record<string, unknown>;
}): Promise<CachedAnalysisRecord> {
  const record = await prisma.analysisCache.create({
    data: {
      fingerprint: input.fingerprint,
      focusAuthor: input.focusAuthor,
      source: input.source,
      pipelineVersion: input.pipelineVersion,
      insightsVersion: input.insightsVersion,
      model: input.model,
      promptVersion: input.promptVersion ?? null,
      responseJson: input.response,
      metricsJson: input.metrics ? (input.metrics as any) : null,
    },
  });

  return mapRecord(record);
}

export async function touchCachedAnalysisAccess(id: string): Promise<void> {
  await prisma.analysisCache.update({
    where: { id },
    data: {
      lastAccessedAt: new Date(),
    },
  });
}
