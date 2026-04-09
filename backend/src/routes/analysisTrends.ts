import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import { listTrendPoints } from "../repositories/analysisTrendRepository";

export const analysisTrendsRouter = Router();

const TrendsQuerySchema = z.object({
  focusAuthor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

analysisTrendsRouter.get(
  "/analyses/trends",
  asyncHandler(async (req, res) => {
    const parsed = TrendsQuerySchema.safeParse({
      focusAuthor: req.query.focusAuthor,
      limit: req.query.limit,
    });

    if (!parsed.success) {
      throw new HttpError(400, "Invalid query params", {
        code: "INVALID_REQUEST",
        details: { zod: parsed.error.flatten() },
      });
    }

    const points = await listTrendPoints({
      focusAuthor: parsed.data.focusAuthor,
      limit: parsed.data.limit,
    });

    res.json({
      ok: true,
      data: {
        focusAuthor: parsed.data.focusAuthor,
        points,
      },
    });
  }),
);
