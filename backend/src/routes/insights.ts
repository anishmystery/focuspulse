import { Router } from "express";
import { z } from "zod";
import { OllamaClient } from "../services/llm/ollamaClient";
import { HttpError } from "../utils/httpError";
import { asyncHandler } from "../utils/asyncHandler";

export const insightsRouter = Router();

const TestBody = z.object({
  text: z.string().min(1),
});

const InsightResponseSchema = z.object({
  summary: z.string(),
  bullets: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

type InsightResponseSchema = z.infer<typeof InsightResponseSchema>;

const llm = new OllamaClient();

insightsRouter.post(
  "/insights/test",
  asyncHandler(async (req, res) => {
    const parsed = TestBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const { text } = parsed.data;
    const prompt = `
  You are FocusPulse, an assitant that produces concise productivity insights.
  
  Return ONLY valid JSON matching this schema:
  {
    "summary": string,
    "bullets": string[],
    "confidence": number // 0 to 1
  }

  Rules:
  - Output MUST be pure JSON (no markdonw, no extra text).
  - bullets should be short and actionable.

  Input:
  ${text}
  `.trim();

    const json = await llm.generateJson<InsightResponseSchema>(prompt);

    // Validate the LLM output so that the API stays stable
    const validated = InsightResponseSchema.safeParse(json);
    if (!validated.success) {
      throw new HttpError(
        502,
        "LLM returned invalid JSON shape",
        validated.error.flatten()
      );
    }

    res.json({ ok: true, data: validated.data });
  })
);
