import { z } from "zod";
import { Router } from "express";
import { OllamaClient } from "../services/llm/ollamaClient";
import { HttpError } from "../utils/httpError";
import { CommitSchema, dateKeyUTC, percentile } from "./insightsV1";
import { asyncHandler } from "../utils/asyncHandler";

export const ThemeSchema = z.object({
  theme: z.string().min(2),
  confidence: z.number().min(0).max(1).optional().nullable(),
  evidenceSubjects: z.array(z.string().min(1)).min(1).max(6),
});

export const HypothesisSchema = z.object({
  statement: z.string().min(10), // must start with "Might ..."
  reason: z.string().min(10),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const RecommendationSchema = z.object({
  action: z.string().min(10),
  why: z.string().min(10),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const InsightsV2NarrativeSchema = z
  .object({
    summary: z.string().min(10),
    themes: z.array(ThemeSchema).min(0).max(6).optional().default([]),
    hypotheses: z.array(HypothesisSchema).min(0).max(6).optional().default([]),
    recommendations: z
      .array(RecommendationSchema)
      .min(1)
      .max(8)
      .optional()
      .default([]),
    watchouts: z.array(z.string().min(5)).max(6).optional().default([]),
    confidence: z.number().min(0).max(1).optional().nullable(),
  })
  .transform((val) => ({
    ...val,
    confidence: val.confidence ?? undefined,
    themes: val.themes.map((t) => ({
      ...t,
      confidence: t.confidence ?? undefined,
    })),
    hypotheses: val.hypotheses.map((h) => ({
      ...h,
      confidence: h.confidence ?? undefined,
    })),
    recommendations: val.recommendations.map((r) => ({
      ...r,
      confidence: r.confidence ?? undefined,
    })),
  }));

type Commit = z.infer<typeof CommitSchema>;

const BodySchema = z.object({
  authors: z.array(z.string()).min(1),
  commits: z.array(CommitSchema).min(1),
  focusAuthor: z.string().optional(),
  maxSubjects: z.number().int().min(10).max(120).optional(), // optional override
});

type DataQuality = "low" | "medium" | "high";

function computeDataQuality(
  activeDays: number,
  commitCount: number
): DataQuality {
  if (activeDays < 7 || commitCount < 20) return "low";
  if (activeDays < 21 || commitCount < 75) return "medium";
  return "high";
}

/**
 * Deterministic facts module (same idea as v1), plus dateRange.
 * Keep this as facts-only.
 */

function computeFacts(
  commitsAll: Commit[],
  focusAuthor: string,
  allAuthors: string[]
) {
  const commits = commitsAll.filter((c) => c.authorName === focusAuthor);
  if (commits.length === 0) {
    throw new HttpError(422, "No commits found for focusAuthor", {
      focusAuthor,
    });
  }

  // dates
  const times = commits
    .map((c) => new Date(c.dateIso).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const dateRange = {
    from: new Date(times[0]).toISOString(),
    to: new Date(times[times.length - 1]).toISOString(),
  };

  // rhythm
  const byDow: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  let weekend = 0;
  let lateNight = 0;

  for (const c of commits) {
    const dow = c.derived.dayOfWeekUtc;
    byDow[dow] = (byDow[dow] ?? 0) + 1;

    const hr = c.derived.hourOfDayUtc;
    byHour[String(hr)] = (byHour[String(hr)] ?? 0) + 1;

    if (dow === "Sat" || dow === "Sun") weekend++;
    if (hr >= 22 || hr <= 5) lateNight++;
  }

  const topDays = Object.entries(byDow)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topHours = Object.entries(byHour)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // consistency
  const perDay: Record<string, number> = {};
  for (const c of commits) {
    const k = dateKeyUTC(c.dateIso);
    if (k !== "invalid") perDay[k] = (perDay[k] ?? 0) + 1;
  }
  const dayKeys = Object.keys(perDay).sort();
  const counts = dayKeys.map((k) => perDay[k]).sort((a, b) => a - b);

  const maxDay = counts.length ? counts[counts.length - 1] : 0;
  const median = percentile(counts, 0.5) || 1;
  const burstiness = Number((maxDay / median).toFixed(2));

  let longestStreak = dayKeys.length ? 1 : 0;
  let currentStreak = dayKeys.length ? 1 : 0;
  let longestGapDays = 0;

  for (let i = 1; i < dayKeys.length; i++) {
    const prev = new Date(dayKeys[i - 1] + "T00:00:00Z").getTime();
    const curr = new Date(dayKeys[i] + "T00:00:00Z").getTime();
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestGapDays = Math.max(longestGapDays, diffDays - 1);
    }
  }

  const spikeDays = Object.entries(perDay)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // work type mix + message quality
  const typeCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let conventionalCount = 0;
  let ticketCount = 0;

  const conventionalTypes = new Set([
    "feat",
    "fix",
    "refactor",
    "docs",
    "chore",
    "test",
    "ci",
    "perf",
    "style",
    "build",
  ]);

  for (const c of commits) {
    const t = c.derived.type;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;

    for (const tag of c.derived.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }

    if (conventionalTypes.has(String(t))) conventionalCount++;
    if (c.derived.ticketIds.length > 0) ticketCount++;
  }

  const total = commits.length;
  const workTypeMix = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      percent: Number(((count / total) * 100).toFixed(1)),
    }));

  const messageQuality = {
    conventionalPercent: Number(((conventionalCount / total) * 100).toFixed(1)),
    ticketPercent: Number(((ticketCount / total) * 100).toFixed(1)),
    tags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count })),
  };

  // optional team context
  let teamContext: any = null;
  if (allAuthors.length > 1) {
    const repoTotal = commitsAll.length;
    const byAuthor: Record<string, number> = {};
    for (const c of commitsAll)
      byAuthor[c.authorName] = (byAuthor[c.authorName] ?? 0) + 1;

    const focusShare = Number(((commits.length / repoTotal) * 100).toFixed(1));
    const topAuthor = Object.entries(byAuthor).sort((a, b) => b[1] - a[1])[0];
    const topAuthorPercent = topAuthor
      ? Number(((topAuthor[1] / repoTotal) * 100).toFixed(1))
      : 0;

    teamContext = {
      focusSharePercent: focusShare,
      topAuthor: topAuthor?.[0] ?? null,
      topAuthorSharePercent: topAuthorPercent,
      authorCommitCounts: Object.entries(byAuthor)
        .sort((a, b) => b[1] - a[1])
        .map(([author, count]) => ({ author, count })),
    };
  }

  const dataQuality = computeDataQuality(dayKeys.length, total);

  return {
    focusAuthor,
    dataQuality,
    dateRange,
    totals: { commits: total, activeDays: dayKeys.length },
    rhythm: {
      topDays,
      topHours,
      weekendPercent: Number(((weekend / total) * 100).toFixed(1)),
      lateNightPercent: Number(((lateNight / total) * 100).toFixed(1)),
    },
    consistency: {
      longestStreakDays: longestStreak,
      longestGapDays,
      burstiness,
      spikeDays,
    },
    workTypeMix,
    messageQuality,
    teamContext,
  };
}

function pickSubjects(
  commitsAll: Commit[],
  focusAuthor: string,
  maxSubjects: number
) {
  return commitsAll
    .filter((c) => c.authorName === focusAuthor)
    .slice()
    .sort(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime()
    )
    .slice(0, maxSubjects)
    .map((c) => c.subject);
}

export const insightsV2Router = Router();
const llm = new OllamaClient();

insightsV2Router.post(
  "/insights/v2/from-commits",
  asyncHandler(async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const { authors, commits, focusAuthor, maxSubjects } = parsed.data;
    const uniqueAuthors = Array.from(new Set(authors)).sort((a, b) =>
      a.localeCompare(b)
    );

    const focus =
      uniqueAuthors.length === 1 ? uniqueAuthors[0] : focusAuthor.trim();

    if (uniqueAuthors.length > 1 && !focus) {
      throw new HttpError(
        400,
        "focusAuthor is required when multiple authors are present",
        {
          authors: uniqueAuthors,
        }
      );
    }

    const facts = computeFacts(commits, focus!, uniqueAuthors);
    const subjects = pickSubjects(commits, focus!, maxSubjects ?? 60);

    const llmInput = {
      authorCount: uniqueAuthors.length,
      facts,
      subjects,
    };

    const strictRules =
      facts.dataQuality === "low"
        ? `
        Data quality is LOW.
        Rules:
        - Keep tone neutral and observational; do NOT judge productivity, focus, effort, or work ethic.
        - Do NOT mention health, well-being, burnout, stress, or lifestyle advice.
        - Do NOT mention time windows like "last week" or "out of 7 days". You may reference facts.dateRange explicitly.
        - Do NOT use the word "team" unless authorCount > 1 AND facts.teamContext is not null.
        - Tickets: you may only say "No ticket IDs detected in commit messages" when facts.messageQuality.ticketPercent == 0.
        - Provide 1-3 hypotheses max; phrase each hypothesis starting with "Might be ...".
        `
        : `
        Rules:
        - Do NOT mention time windows like "last week". You may reference facts.dateRange explicitly.
        - Do NOT infer commit size/complexity/impact (not provided in v2).
        - Do NOT use the word "team" unless authorCount > 1 AND facts.teamContext is not null.
        - Each theme MUST include 2-6 evidenceSubjects copied verbatim from the provided subjects list.
        - Each hypothesis MUST start with "Might be ..." and cite at least one numeric fact in the reason.
        - Recommendations must be technical/process actions tied to facts or themes (no lifestyle advice).
        - Tickets: only mention ticket IDs if facts.messageQuality.ticketPercent > 0, otherwise use the exact phrasing above.
        `;

    const prompt = `
        You are FocusPulse. Use ONLY the JSON provided. Do not invent facts.

        Return ONLY valid JSON with this schema:
        {
        "summary": string,
        "themes": [{ "theme": string, "confidence"?: number, "evidenceSubjects": string[] }],
        "hypotheses": [{ "statement": string, "reason": string, "confidence"?: number }],
        "recommendations": [{ "action": string, "why": string, "confidence"?: number }],
        "watchouts": string[],
        "confidence"?: number
        }

        Hard requirements:
        - evidenceSubjects MUST be exact strings from the provided subjects array.
        - If facts.dataQuality is "low", emphasize limited conclusions and keep hypotheses cautious.
        - Never mention "last week" or "7 days". If you mention dates, use facts.dateRange.
        - Output must ALWAYS include these keys: themes (array), hypotheses (array), recommendations (array), watchouts (array). If unsure, use empty arrays.
        - If you include any confidence field, it MUST be a number between 0 and 1. Otherwise omit it.


        ${strictRules}

        Data:
        ${JSON.stringify(llmInput)}
        `.trim();

    const narrativeRaw = await llm.generateJson<unknown>(prompt);

    function clamp01(x: unknown): number | undefined {
      if (typeof x !== "number" || Number.isNaN(x)) return undefined;
      if (x < 0 || x > 1) return undefined;
      return x;
    }

    function sanitizeNarrative(raw: any) {
      if (!raw || typeof raw !== "object") return raw;

      if ("confidence" in raw) raw.confidence = clamp01(raw.confidence);

      for (const key of ["themes", "hypotheses", "recommendations"] as const) {
        if (Array.isArray(raw[key])) {
          raw[key] = raw[key].map((item: any) => {
            if (item && typeof item === "object" && "confidence" in item) {
              item.confidence = clamp01(item.confidence);
            }
            return item;
          });
        }
      }
      return raw;
    }

    const narrativeSafe = sanitizeNarrative(narrativeRaw);
    const narrativeParsed = InsightsV2NarrativeSchema.safeParse(narrativeSafe);

    if (!narrativeParsed.success) {
      throw new HttpError(
        502,
        "LLM returned invalid narrative JSON",
        narrativeParsed.error.flatten()
      );
    }

    res.json({
      ok: true,
      data: {
        ...narrativeParsed,
        modules: facts,
        dataQuality: facts.dataQuality,
      },
    });
  })
);
