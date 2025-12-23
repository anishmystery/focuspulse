import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import { OllamaClient } from "../services/llm/ollamaClient";

export const insightsV1Router = Router();

const CommitSchema = z.object({
  hash: z.string(),
  authorName: z.string(),
  dateIso: z.string(),
  subject: z.string(),
  derived: z.object({
    dayOfWeekUtc: z.string(),
    hourOfDayUtc: z.number(),
    type: z.string(),
    tags: z.array(z.string()),
    ticketIds: z.array(z.string()),
  }),
});

type Commit = z.infer<typeof CommitSchema>;

const BodySchema = z.object({
  authors: z.array(z.string()).min(1),
  commits: z.array(CommitSchema).min(1),
  focusAuthor: z.string().optional(),
});

function dateKeyUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function computeInsights(
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

  // --- Rhythm ---
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

  // --- Consistency ---
  const perDay: Record<string, number> = {};
  for (const c of commits) {
    const k = dateKeyUTC(c.dateIso);
    perDay[k] = (perDay[k] ?? 0) + 1;
  }
  const dayKeys = Object.keys(perDay)
    .filter((k) => k !== "invalid")
    .sort();
  const counts = dayKeys.map((k) => perDay[k]).sort((a, b) => a - b);

  const maxDay = counts.length ? counts[counts.length - 1] : 0;
  const median = percentile(counts, 0.5) || 1;
  const burstiness = Number((maxDay / median).toFixed(2));

  // longest streak and gap
  let longestStreak = 1;
  let currentStreak = 1;
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

  // --- Work type mix ---
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

  // --- Message quality ---
  const messageQuality = {
    conventionalPercent: Number(((conventionalCount / total) * 100).toFixed(1)),
    ticketPercent: Number(((ticketCount / total) * 100).toFixed(1)),
    tags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({
        tag,
        count,
      })),
  };

  // --- Team context (optional) ---
  let teamContext: any = undefined;
  if (allAuthors.length > 1) {
    const repoTotal = commitsAll.length;
    const focusShare = Number(((commits.length / repoTotal) * 100).toFixed(1));

    // simple concentration: top author percent
    const byAuthor: Record<string, number> = {};
    for (const c of commitsAll) {
      byAuthor[c.authorName] = (byAuthor[c.authorName] ?? 0) + 1;
    }
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

  return {
    focusAuthor,
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

const LlmNarrativeSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).min(1),
  recommendations: z.array(z.string()).min(1),
  watchouts: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

const llm = new OllamaClient();

insightsV1Router.post(
  "/insights/from-commits",
  asyncHandler(async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const { authors, commits, focusAuthor } = parsed.data;

    const uniqueAuthors = Array.from(new Set(authors)).sort((a, b) =>
      a.localeCompare(b)
    );
    const focus =
      uniqueAuthors.length === 1 ? uniqueAuthors[0] : focusAuthor?.trim();

    if (uniqueAuthors.length > 1 && !focus) {
      throw new HttpError(
        400,
        "focusAuthor is requred when multiple authors are present",
        { authors: uniqueAuthors }
      );
    }

    const computed = computeInsights(commits, focus!, uniqueAuthors);

    // LLM: narrative + recommendations (must not invent facts)
    const prompt = `
    You are FocusPulse. You must ONLY use the JSON data provided.
    Return ONLY valid JSON with this schema:
    {
        "summary": string,
        "highlights": string[],
        "recommendations": string[],
        "watchouts": string[],
        "confidence"?: number  
    }
    
    Guidelines:
    - Be concise and specific.
    - Highlights should reference real numbers from the data.
    - Recommendations must be actionable and realistic.
    - If data is limited, say so. Do NOT invent metrics.

    Data:
    ${JSON.stringify(computed)}
    `.trim();

    const narrativeRaw = await llm.generateJson<unknown>(prompt);
    const narrativeParsed = LlmNarrativeSchema.safeParse(narrativeRaw);
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
        ...narrativeParsed.data,
        modules: computed,
      },
    });
  })
);
