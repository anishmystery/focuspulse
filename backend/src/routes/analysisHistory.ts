import { Router } from "express";
import z from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import {
  findAnalysisRunById,
  listAnalysisRuns,
} from "../repositories/analysisRunRepository";

export const analysisHistoryRouter = Router();

const HistoryListQuerySchema = z.object({
  focusAuthor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

analysisHistoryRouter.get(
  "/analyses/history",
  asyncHandler(async (req, res) => {
    const parsed = HistoryListQuerySchema.safeParse({
      focusAuthor: req.query.focusAuthor,
      limit: req.query.limit,
    });

    if (!parsed.success) {
      throw new HttpError(400, "Invalid query params", {
        code: "INVALID_REQUEST",
        details: { zod: parsed.error.flatten() },
      });
    }

    const runs = await listAnalysisRuns({
      focusAuthor: parsed.data.focusAuthor,
      limit: parsed.data.limit,
    });

    res.json({
      ok: true,
      data: runs.map((run) => {
        const result = run.response?.data;
        return {
          id: run.id,
          focusAuthor: run.focusAuthor,
          source: run.source,
          pipelineVersion: run.pipelineVersion,
          insightsVersion: run.insightsVersion,
          model: run.model,
          promptVersion: run.promptVersion,
          dateRange: {
            from: run.dateFrom ? run.dateFrom.toISOString() : null,
            to: run.dateTo ? run.dateTo.toISOString() : null,
          },
          commitCount: run.commitCount,
          activeDays: run.activeDays,
          signal: run.signal as "low" | "medium" | "high",
          createdAt: run.createdAt.toISOString(),

          // NEW preview fields
          summary: result?.summary ?? "",
          themeCount: result?.themes?.length ?? 0,
          hypothesisCount: result?.hypotheses?.length ?? 0,
          recommendationsCount: result?.recommendations?.length ?? 0,
        };
      }),
    });
  }),
);

analysisHistoryRouter.get(
  "/analyses/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const run = await findAnalysisRunById(id);

    if (!run) {
      throw new HttpError(404, "Analysis history record not found", {
        code: "INVALID_REQUEST",
      });
    }

    res.json({
      ok: true,
      data: {
        id: run.id,
        createdAt: run.createdAt.toISOString(),
        response: run.response,
      },
    });
  }),
);
