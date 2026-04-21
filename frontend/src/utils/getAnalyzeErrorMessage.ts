import type { AnalyzeErrorResponse } from "../types/analyze";

export function getAnalyzeErrorMessage(error: unknown): string {
  const err = error as AnalyzeErrorResponse | undefined;
  const code = err?.error?.code;

  switch (code) {
    case "INVALID_REQUEST":
      return "The request is invalid. Please review your input and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "The pasted git log is too large. Try a smaller range of commits.";
    case "NO_COMMITS_PARSED":
      return "No commits could be parsed. Make sure your git log matches the expected format.";
    case "NO_ANALYZABLE_COMMITS":
      return "No analyzable commits remain after filtering merge commits.";
    case "MULTIPLE_AUTHORS_REQUIRES_FOCUS_AUTHOR":
      return "Multiple authors were detected. Please provide a focus author.";
    case "FOCUS_AUTHOR_NOT_FOUND":
      return "The focus author was not found in the pasted git log.";
    case "INSIGHTS_GENERATION_FAILED":
      return "The commit data was parsed, but insight generation failed.";
    case "INTERNAL_ERROR":
      return "Something went wrong on the server.";
    default:
      return "Something went wrong while running the analysis.";
  }
}
