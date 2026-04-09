import { prisma } from "../db/client";
import type { AnalysisTrendPoint } from "../contracts/analyzeContracts";

type TrendMetrics = {
  commitCount?: number;
  activeDays?: number;
  signal?: "low" | "medium" | "high";
  dateRange?: {
    from?: string | null;
    to?: string | null;
  };
  weekendPercent?: number;
  lateNightPercent?: number;
  longestStreakDays?: number;
  longestGapDays?: number;
  burstiness?: number;
  conventionalPercent?: number;
  ticketPercent?: number;
  workTypeMix?: Array<{ type: string; percent: number }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTrendMetrics(value: unknown): TrendMetrics | null {
  return isObject(value) ? (value as TrendMetrics) : null;
}

export async function listTrendPoints(input: {
  focusAuthor?: string;
  limit?: number;
}): Promise<AnalysisTrendPoint[]> {
  const runs = await prisma.analysisRun.findMany({
    where: {
      ...(input?.focusAuthor ? { focusAuthor: input.focusAuthor } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 20,
  });

  // Deduplicate by contentFingerprint so reruns with the same underlying git snapshot
  // do not create fake trend changes
  const latestByContent = new Map<string, (typeof runs)[number]>();

  for (const run of runs) {
    if (!latestByContent.has(run.contentFingerprint)) {
      latestByContent.set(run.contentFingerprint, run);
    }
  }

  const dedupedRuns = Array.from(latestByContent.values());

  const points: AnalysisTrendPoint[] = dedupedRuns
    .map((run) => {
      const metrics = toTrendMetrics(run.metricsJson);
      if (!metrics) return null;

      const dateFrom =
        metrics.dateRange?.from ??
        (run.dateFrom ? run.dateFrom.toISOString() : null);
      const dateTo =
        metrics.dateRange?.to ?? (run.dateTo ? run.dateTo.toISOString() : null);
      const timeAnchor = dateTo ?? run.createdAt.toISOString();

      if (
        typeof metrics.commitCount !== "number" ||
        typeof metrics.activeDays !== "number" ||
        (metrics.signal !== "low" &&
          metrics.signal !== "medium" &&
          metrics.signal !== "high") ||
        typeof metrics.weekendPercent !== "number" ||
        typeof metrics.lateNightPercent !== "number" ||
        typeof metrics.longestStreakDays !== "number" ||
        typeof metrics.longestGapDays !== "number" ||
        typeof metrics.burstiness !== "number" ||
        typeof metrics.conventionalPercent !== "number" ||
        typeof metrics.ticketPercent !== "number" ||
        !Array.isArray(metrics.workTypeMix)
      ) {
        return null;
      }

      return {
        runId: run.id,
        focusAuthor: run.focusAuthor,
        source: "git-log",
        createdAt: run.createdAt.toISOString(),
        dateRange: {
          from: dateFrom,
          to: dateTo,
        },
        timeAnchor,
        commitCount: metrics.commitCount,
        activeDays: metrics.activeDays,
        signal: metrics.signal,
        weekendPercent: metrics.weekendPercent,
        lateNightPercent: metrics.lateNightPercent,
        longestStreakDays: metrics.longestStreakDays,
        longestGapDays: metrics.longestGapDays,
        burstiness: metrics.burstiness,
        conventionalPercent: metrics.conventionalPercent,
        ticketPercent: metrics.ticketPercent,
        workTypeMix: metrics.workTypeMix
          .filter(
            (item) =>
              item &&
              typeof item.type === "string" &&
              typeof item.percent === "number",
          )
          .map((item) => ({
            type: item.type,
            percent: item.percent,
          })),
      };
    })
    .filter((point): point is AnalysisTrendPoint => point !== null)
    .sort((a, b) => a.timeAnchor.localeCompare(b.timeAnchor));

  return points;
}
