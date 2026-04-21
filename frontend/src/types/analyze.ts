export type AnalyzeErrorCode =
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NO_COMMITS_PARSED"
  | "NO_ANALYZABLE_COMMITS"
  | "MULTIPLE_AUTHORS_REQUIRES_FOCUS_AUTHOR"
  | "FOCUS_AUTHOR_NOT_FOUND"
  | "INSIGHTS_GENERATION_FAILED"
  | "INTERNAL_ERROR";

export type AnalyzeRequestBody = {
  text: string;
  focusAuthor?: string;
  source?: "git-log";
  debug?: boolean;
};

export type AnalyzeTheme = {
  theme: string;
  evidenceSubjects: string[];
};

export type AnalyzeHypothesis = {
  statement: string;
  reason: string;
};

export type AnalyzeRecommendation = {
  action: string;
  why: string;
};

export type NormalizeWarning = {
  lineNumber: number;
  reason: string;
  line: string;
};

export type AnalyzeMeta = {
  focusAuthor: string;
  authorsDetected: string[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
  commitCount: number;
  activeDays: number;
  signal: "low" | "medium" | "high";
  warnings: string[];
  version: string;
  source: "git-log";
};

export type AnalyzeDebug = {
  normalization?: {
    authorCount: number;
    parsedCommitCount: number;
    excludedMergeCommitCount: number;
    analyzedCommitCount: number;
    droppedLineCount: number;
    warnings: NormalizeWarning[];
  };
  pipeline?: {
    route: "analyze";
    insightsVersion: "v3";
    usedFocusAuthor: string;
  };
  cache?: {
    hit: boolean;
    fingerprint: string;
  };
};

export type AnalyzeResult = {
  summary: string;
  themes: AnalyzeTheme[];
  hypotheses: AnalyzeHypothesis[];
  recommendations: AnalyzeRecommendation[];
  watchouts: string[];
  meta: AnalyzeMeta;
  debug?: AnalyzeDebug;
};

export type AnalyzeSuccessResponse = {
  ok: true;
  data: AnalyzeResult;
};

export type AnalyzeError = {
  code: AnalyzeErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type AnalyzeErrorResponse = {
  ok: false;
  error: AnalyzeError;
};
