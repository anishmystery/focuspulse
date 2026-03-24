import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AnalyzeRequestBodySchema } from "../contracts/analyzeContracts";
import { HttpError } from "../utils/httpError";
import { runAnalyze } from "../services/analyzeService";

export const analyzeRouter = Router();

analyzeRouter.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const parsed = AnalyzeRequestBodySchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", {
        code: "INVALID_REQUEST",
        details: { zod: parsed.error.flatten() },
      });
    }

    const response = await runAnalyze(parsed.data);
    res.json(response);
  }),
);
