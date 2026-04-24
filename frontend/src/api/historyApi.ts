import type {
  AnalysisHistoryDetailResponse,
  AnalysisHistoryListResponse,
} from "../types/history";
import { apiRequest } from "./client";

type GetAnalysisHistoryParams = {
  focusAuthor?: string;
  limit?: number;
};

export async function getAnalysisHistory(
  params: GetAnalysisHistoryParams = {},
): Promise<AnalysisHistoryListResponse> {
  const searchParams = new URLSearchParams();

  if (params.focusAuthor) {
    searchParams.set("focusAuthor", params.focusAuthor);
  }

  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const queryString = searchParams.toString();

  return apiRequest<AnalysisHistoryListResponse>(
    `analyses/history${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getAnalysisById(
  id: string,
): Promise<AnalysisHistoryDetailResponse> {
  return apiRequest<AnalysisHistoryDetailResponse>(`analyses/${id}`);
}
