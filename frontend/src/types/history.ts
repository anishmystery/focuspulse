import type { AnalyzeSuccessResponse } from "./analyze";

export type AnalysisHistoryItem = {
  id: string;
  focusAuthor: string;
  source: "git-log";
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion: string | null;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  commitCount: number;
  activeDays: number;
  signal: "low" | "medium" | "high";
  createdAt: string;
  summary: string;
  themeCount: number;
  hypothesisCount: number;
  recommendationCount: number;
};

export type AnalysisHistoryListResponse = {
  ok: true;
  data: AnalysisHistoryItem[];
};

export type AnalysisHistoryDetailResponse = {
  ok: true;
  data: {
    id: string;
    createdAt: string;
    response: AnalyzeSuccessResponse;
  };
};
