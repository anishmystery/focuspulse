import { literal, z } from "zod";

export const AnalyzeErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "NO_COMMITS_PARSED",
  "NO_ANALYZABLE_COMMITS",
  "MULTIPLE_AUTHORS_REQUIRES_FOCUS_AUTHOR",
  "FOCUS_AUTHOR_NOT_FOUND",
  "INSIGHTS_GENERATION_FAILED",
  "INTERNAL_ERROR",
]);

export const AnalyzeRequestBodySchema = z.object({
  text: z.string().min(1),
  focusAuthor: z.string().min(1).optional(),
  source: z.literal("git-log").optional(),
  debug: z.boolean().optional(),
});

export const AnalyzeThemeSchema = z.object({
  theme: z.string(),
  evidenceSubjects: z.array(z.string()),
});

export const AnalyzeHypothesisSchema = z.object({
  statement: z.string(),
  reason: z.string(),
});

export const AnalyzeRecommendationSchema = z.object({
  action: z.string(),
  why: z.string(),
});

export const NormalizeWarningSchema = z.object({
  lineNumber: z.number().int().positive(),
  reason: z.string(),
  line: z.string(),
});

export const AnalyzeMetaSchema = z.object({
  focusAuthor: z.string(),
  authorsDetected: z.array(z.string()),
  dateRange: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  commitCount: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  signal: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string()),
  version: z.string(),
  source: z.literal("git-log"),
});

export const AnalyzeDebugSchema = z.object({
  normalization: z
    .object({
      authorCount: z.number().int().nonnegative(),
      parsedCommitCount: z.number().int().nonnegative(),
      excludedMergeCommitCount: z.number().int().nonnegative(),
      analyzedCommitCount: z.number().int().nonnegative(),
      droppedLineCount: z.number().int().nonnegative(),
      warnings: z.array(NormalizeWarningSchema),
    })
    .optional(),
  pipeline: z
    .object({
      route: z.literal("analyze"),
      insightsVersion: z.literal("v3"),
      usedFocusAuthor: z.string(),
    })
    .optional(),
  cache: z
    .object({
      hit: z.boolean(),
      fingerprint: z.string(),
    })
    .optional(),
});

export const AnalyzeResultSchema = z.object({
  summary: z.string(),
  themes: z.array(AnalyzeThemeSchema),
  hypotheses: z.array(AnalyzeHypothesisSchema),
  recommendations: z.array(AnalyzeRecommendationSchema),
  watchouts: z.array(z.string()),
  meta: AnalyzeMetaSchema,
  debug: AnalyzeDebugSchema.optional(),
});

export const AnalyzeSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: AnalyzeResultSchema,
});

export const AnalyzeErrorSchema = z.object({
  code: AnalyzeErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const AnalyzeErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: AnalyzeErrorSchema,
});

export const AnalysisHistoryItemSchema = z.object({
  id: z.string(),
  focusAuthor: z.string(),
  source: z.literal("git-log"),
  pipelineVersion: z.string(),
  insightsVersion: z.string(),
  model: z.string(),
  promptVersion: z.string().nullable(),
  dateRange: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  commitCount: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  signal: z.enum(["low", "medium", "high"]),
  createdAt: z.string(),
});

export const AnalysisHistoryListResponseSchema = z.object({
  ok: literal(true),
  data: z.array(AnalysisHistoryItemSchema),
});

export const AnalysisHistoryDetailResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    id: z.string(),
    createdAt: z.string(),
    response: AnalyzeSuccessResponseSchema,
  }),
});

export type AnalyzeErrorCode = z.infer<typeof AnalyzeErrorCodeSchema>;
export type AnalyzeRequestBody = z.infer<typeof AnalyzeRequestBodySchema>;
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;
export type AnalyzeSuccessResponse = z.infer<
  typeof AnalyzeSuccessResponseSchema
>;
export type AnalyzeError = z.infer<typeof AnalyzeErrorSchema>;
export type AnalyzeErrorResponse = z.infer<typeof AnalyzeErrorResponseSchema>;
export type AnalysisHistoryItem = z.infer<typeof AnalysisHistoryItemSchema>;
export type AnalysisHistoryListResponse = z.infer<
  typeof AnalysisHistoryListResponseSchema
>;
export type AnalysisHistoryDetailResponse = z.infer<
  typeof AnalysisHistoryDetailResponseSchema
>;
