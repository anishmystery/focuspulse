import { env } from "../config";
import { HttpError } from "../utils/httpError";
import { normalizeGitLogText } from "../routes/internal/normalize";
import { generateInsightsV3FromCommits } from "../routes/internal/insightsV3";
import {
  AnalyzeSuccessResponseSchema,
  type AnalyzeErrorCode,
  type AnalyzeSuccessResponse,
} from "../contracts/analyzeContracts";

type RunAnalyzeInput = {
  text: string;
  focusAuthor?: string;
  debug?: boolean;
  source?: "git-log";
};

function errorWithCode(
  status: number,
  code: AnalyzeErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new HttpError(status, message, {
    code,
    ...(details ? { details } : {}),
  });
}

function toSignal(dataQuality: string): "low" | "medium" | "high" {
  if (
    dataQuality === "low" ||
    dataQuality === "medium" ||
    dataQuality === "high"
  ) {
    return dataQuality;
  }

  errorWithCode(
    500,
    "INTERNAL_ERROR",
    "Unexpected dataQuality value from insights pipeline",
    { dataQuality },
  );
}

function isMergeCommitSubject(subject: string): boolean {
  return subject.trim().toLowerCase().startsWith("merge ");
}

function summarizeWarnings(warnings: Array<{ reason: string }>): string[] {
  const uniq = Array.from(
    new Set(warnings.map((w) => w.reason.trim()).filter(Boolean)),
  );
  return uniq.slice(0, 5);
}

function remapNormalizeError(err: unknown): never {
  if (err instanceof HttpError) {
    if (err.status === 400 || err.status === 422) {
      errorWithCode(
        400,
        "NO_COMMITS_PARSED",
        err.message,
        typeof err.details === "object" && err.details !== null
          ? (err.details as Record<string, unknown>)
          : undefined,
      );
    }
  }

  throw err;
}

function remapInsightsError(err: unknown): never {
  if (err instanceof HttpError) {
    errorWithCode(
      err.status >= 500 ? 502 : err.status,
      "INSIGHTS_GENERATION_FAILED",
      err.message,
      typeof err.details === "object" && err.details !== null
        ? (err.details as Record<string, unknown>)
        : undefined,
    );
  }

  throw err;
}

export async function runAnalyze(
  input: RunAnalyzeInput,
): Promise<AnalyzeSuccessResponse> {
  const { text, focusAuthor, debug = false, source = "git-log" } = input;

  if (text.trim().length === 0) {
    errorWithCode(400, "INVALID_REQUEST", "Text must not be empty");
  }

  if (text.length > env.INGEST_MAX_CHARS) {
    errorWithCode(413, "PAYLOAD_TOO_LARGE", "Payload too large", {
      maxChars: env.INGEST_MAX_CHARS,
      receivedChars: text.length,
    });
  }

  let normalized: ReturnType<typeof normalizeGitLogText>;
  try {
    normalized = normalizeGitLogText(text);
  } catch (err) {
    remapNormalizeError(err);
  }

  const authorsDetected = normalized.authors;
  const hasMultipleAuthors = authorsDetected.length > 1;

  if (hasMultipleAuthors && !focusAuthor) {
    errorWithCode(
      400,
      "MULTIPLE_AUTHORS_REQUIRES_FOCUS_AUTHOR",
      "Multiple authors were found in the git log. Provide focusAuthor to continue.",
      { authorsDetected },
    );
  }

  if (focusAuthor && !authorsDetected.includes(focusAuthor)) {
    errorWithCode(
      400,
      "FOCUS_AUTHOR_NOT_FOUND",
      "The provided focusAuthor was not found in parsed authors.",
      { focusAuthor, authorsDetected },
    );
  }

  const excludedMergeCommits = normalized.commits.filter((commit) =>
    isMergeCommitSubject(commit.subject),
  );

  const analyzableCommits = normalized.commits.filter(
    (commit) => !isMergeCommitSubject(commit.subject),
  );

  if (analyzableCommits.length === 0) {
    errorWithCode(
      400,
      "NO_ANALYZABLE_COMMITS",
      "No analyzable commits remain after filtering merge commits.",
      {
        parsedCommitCount: normalized.commits.length,
        excludedMergeCommitCount: excludedMergeCommits.length,
      },
    );
  }

  let insights: Awaited<ReturnType<typeof generateInsightsV3FromCommits>>;
  try {
    insights = await generateInsightsV3FromCommits({
      authors: authorsDetected,
      commits: analyzableCommits,
      focusAuthor,
    });
  } catch (err) {
    remapInsightsError(err);
  }

  const usedFocusAuthor =
    authorsDetected.length === 1 ? authorsDetected[0] : focusAuthor!;

  const response = {
    ok: true as const,
    data: {
      summary: insights.summary,
      themes: insights.themes,
      hypotheses: insights.hypotheses,
      recommendations: insights.recommendations,
      watchouts: insights.watchouts,
      meta: {
        focusAuthor: usedFocusAuthor,
        authorsDetected,
        dateRange: {
          from: normalized.stats.dateRange.from ?? null,
          to: normalized.stats.dateRange.to ?? null,
        },
        commitCount: analyzableCommits.length,
        activeDays: insights.modules.totals.activeDays,
        signal: toSignal(insights.dataQuality),
        warnings: [
          ...summarizeWarnings(normalized.warnings),
          ...(excludedMergeCommits.length > 0
            ? [
                `${excludedMergeCommits.length} merge commit(s) were excluded from analysis.`,
              ]
            : []),
        ],
        version: "v3",
        source,
      },
      ...(debug
        ? {
            debug: {
              normalization: {
                authorCount: normalized.stats.authorCount,
                parsedCommitCount: normalized.stats.commitCount,
                droppedLineCount: normalized.warnings.length,
                excludedMergeCommitCount: excludedMergeCommits.length,
                analyzedCommitCount: analyzableCommits.length,
                warnings: normalized.warnings,
              },
              pipeline: {
                route: "analyze" as const,
                insightsVersion: "v3" as const,
                usedFocusAuthor,
              },
            },
          }
        : {}),
    },
  };

  const validated = AnalyzeSuccessResponseSchema.safeParse(response);

  if (!validated.success) {
    errorWithCode(
      500,
      "INTERNAL_ERROR",
      "Analyze response failed contract validation",
      { zod: validated.error.flatten() },
    );
  }

  return validated.data;
}
