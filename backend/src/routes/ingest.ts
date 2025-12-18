import { Router } from "express";
import { z } from "zod";
import { env } from "../config";
import { HttpError } from "../utils/httpError";
import { asyncHandler } from "../utils/asyncHandler";

export const ingestRouter = Router();

const IngestGitLogBody = z.object({
  source: z.literal("git-log"),
  text: z.string().min(1),
});

ingestRouter.post(
  "/ingest/gitlog",
  asyncHandler(async (require, res) => {
    const parsed = IngestGitLogBody.safeParse(require.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const { source, text } = parsed.data;

    if (text.length > env.INGEST_MAX_CHARS) {
      throw new HttpError(413, "Payload too large", {
        maxChars: env.INGEST_MAX_CHARS,
        receivedChars: text.length,
      });
    }

    const lineCount = text.split("\n").length;
    const charCount = text.length;

    const id = `ing_${crypto.randomUUID()}`;
    const receivedAt = new Date().toISOString();

    // For v1 we’re not storing raw text yet — just acknowledging ingestion
    res.status(201).json({
      ok: true,
      data: {
        id,
        source,
        receivedAt,
        stats: {
          charCount,
          lineCount,
        },
      },
    });
  })
);
