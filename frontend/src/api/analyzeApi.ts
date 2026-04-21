import type {
  AnalyzeRequestBody,
  AnalyzeSuccessResponse,
} from "../types/analyze";
import { apiRequest } from "./client";

export async function runAnalyze(
  body: AnalyzeRequestBody,
): Promise<AnalyzeSuccessResponse> {
  return apiRequest<AnalyzeSuccessResponse>("analyze", {
    method: "POST",
    bodyJson: body,
  });
}
