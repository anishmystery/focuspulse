import { z } from "zod";
import { Router } from "express";
import { OllamaClient } from "../services/llm/ollamaClient";
import { HttpError } from "../utils/httpError";
import { CommitSchema, dateKeyUTC, percentile } from "./insightsV1";
import { asyncHandler } from "../utils/asyncHandler";

export const ThemeSchema = z.object({
  theme: z.string().min(2),
  evidenceSubjects: z.array(z.string().min(1)).min(1).max(6),
});

export const HypothesisSchema = z.object({
  statement: z.string().min(10), // must start with "Might ..."
  reason: z.string().min(10),
});

export const RecommendationSchema = z.object({
  action: z.string().min(10),
  why: z.string().min(10),
});

export const InsightsV2NarrativeSchema = z
  .object({
    summary: z.string().min(10),
    themes: z.array(ThemeSchema).min(0).max(6).optional().default([]),
    hypotheses: z.array(HypothesisSchema).min(0).max(6).optional().default([]),
    recommendations: z
      .array(RecommendationSchema)
      .min(0)
      .max(8)
      .optional()
      .default([]),
    watchouts: z.array(z.string().min(5)).max(6).optional().default([]),
  })
  .transform((val) => ({
    ...val,
    themes: val.themes.map((t) => ({
      ...t,
    })),
    hypotheses: val.hypotheses.map((h) => ({
      ...h,
    })),
    recommendations: val.recommendations.map((r) => ({
      ...r,
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
  commitCount: number,
): DataQuality {
  if (activeDays < 7 || commitCount < 20) return "low";
  if (activeDays < 21 || commitCount < 75) return "medium";
  return "high";
}

/**
 * Deterministic facts module (same idea as v1), plus dateRange.
 * Keep this as facts-only.
 */

export function computeFacts(
  commitsAll: Commit[],
  focusAuthor: string,
  allAuthors: string[],
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

export function pickSubjects(
  commitsAll: Commit[],
  focusAuthor: string,
  maxSubjects: number,
) {
  return commitsAll
    .filter((c) => c.authorName === focusAuthor)
    .slice()
    .sort(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime(),
    )
    .slice(0, maxSubjects)
    .map((c) => c.subject);
}

export function buildDeterministicWatchouts(keyMetrics: any): string[] {
  const out: string[] = [];

  // thresholds
  const LATE_NIGHT_THRESHOLD = 25; // %
  const WEEKEND_THRESHOLD = 25; // %
  const BURSTINESS_THRESHOLD = 2; // ratio
  const GAP_THRESHOLD = 3; // days

  if (
    typeof keyMetrics.lateNightPercent === "number" &&
    keyMetrics.lateNightPercent >= LATE_NIGHT_THRESHOLD
  ) {
    out.push(`keyMetrics.lateNightPercent is ${keyMetrics.lateNightPercent}%.`);
  }

  if (
    typeof keyMetrics.weekendPercent === "number" &&
    keyMetrics.weekendPercent >= WEEKEND_THRESHOLD
  ) {
    out.push(`keyMetrics.weekendPercent is ${keyMetrics.weekendPercent}%.`);
  }

  if (
    typeof keyMetrics.burstiness === "number" &&
    keyMetrics.burstiness >= BURSTINESS_THRESHOLD
  ) {
    out.push(`keyMetrics.burstiness is ${keyMetrics.burstiness}.`);
  }

  if (
    typeof keyMetrics.longestGapDays === "number" &&
    keyMetrics.longestGapDays >= GAP_THRESHOLD
  ) {
    out.push(`keyMetrics.longestGapDays is ${keyMetrics.longestGapDays}.`);
  }

  // Ticket IDs note is useful + deterministic
  if (
    typeof keyMetrics.ticketPercent === "number" &&
    keyMetrics.ticketPercent === 0
  ) {
    out.push("No ticket IDs were detected in commit subjects.");
  }

  return out.slice(0, 4);
}

export function buildLowSignalNarrative(facts: any) {
  const commits = facts.totals.commits;
  const activeDays = facts.totals.activeDays;
  const from = String(facts.dateRange.from).slice(0, 10);
  const to = String(facts.dateRange.to).slice(0, 10);
  const sameDay = from === to;

  return {
    summary: `Limited data: ${commits} commit${commits === 1 ? "" : "s"} across ${activeDays} active day${activeDays === 1 ? "" : "s"} (${sameDay ? from : `${from} to ${to}`})`,
    themes: [],
    hypotheses: [],
    recommendations: [
      {
        action: "Collect 2-4 weeks of git log data",
        why: "More history improves reliability of themes and hypotheses.",
      },
      {
        action: "Optional: paste unfiltered logs for repo context",
        why: "Including multiple authors enables repo-wide comparisons.",
      },
    ],
    watchouts: [
      `lateNightPercent is ${facts.rhythm.lateNightPercent}% (based on commit timestamps).`,
      `activeDays is ${facts.totals.activeDays}.`,
      `commits is ${facts.totals.commits}.`,
    ],
  };
}

export function buildDeterministicSummary(
  dateRange: { from: string; to: string },
  keyMetrics: any,
  focusAuthor: string,
) {
  const from = String(dateRange.from).slice(0, 10);
  const to = String(dateRange.to).slice(0, 10);
  return `FocusPulse analysis for ${focusAuthor} from ${from} to ${to}. commits=${keyMetrics.commitCount}, activeDays=${keyMetrics.activeDays}, conventionalPercent=${keyMetrics.conventionalPercent}, ticketPercent=${keyMetrics.ticketPercent}.`;
}

export function clamp01(x: unknown): number | undefined {
  if (typeof x !== "number" || Number.isNaN(x)) return undefined;
  if (x < 0 || x > 1) return undefined;
  return x;
}

export function sanitizeNarrative(raw: any) {
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

type Narrative = {
  summary: string;
  themes: Array<{ theme: string; evidenceSubjects: string[] }>;
  hypotheses: Array<{ statement: string; reason: string }>;
  recommendations: Array<{ action: string; why: string }>;
  watchouts: string[];
};

type KeyMetrics = {
  commitCount: number;
  activeDays: number;
  weekendPercent: number;
  lateNightPercent: number;
  conventionalPercent: number;
  ticketPercent: number;
  burstiness?: number;
  longestGapDays?: number;
  longestStreakDays?: number;
  workTypeMix: Array<{ type: string; percent: number; count?: number }>;
};

function enforceNarrativeRules(
  narrative: Narrative,
  keyMetrics: KeyMetrics,
): Narrative {
  const out: Narrative = {
    ...narrative,
    themes: Array.isArray(narrative.themes) ? narrative.themes : [],
    hypotheses: Array.isArray(narrative.hypotheses) ? narrative.hypotheses : [],
    recommendations: Array.isArray(narrative.recommendations)
      ? narrative.recommendations
      : [],
    watchouts: [],
  };

  const maxWorkTypePercent = Math.max(
    0,
    ...((keyMetrics.workTypeMix ?? []).map((x) => x.percent) as number[]),
  );

  // --- Hypotheses: must cite keyMetrics.<field> ---
  out.hypotheses = out.hypotheses.filter((h) => {
    if (!h || typeof h.statement !== "string" || typeof h.reason !== "string")
      return false;
    if (!h.reason.includes("keyMetrics.")) return false;

    // Optional: light alignment check based on which metric is referenced
    const r = h.reason;
    const s = h.statement.toLowerCase();

    const citesWeekend = r.includes("keyMetrics.weekendPercent");
    const citesLate = r.includes("keyMetrics.lateNightPercent");
    const citesWorkType = r.includes("keyMetrics.workTypeMix");
    const citesMsg =
      r.includes("keyMetrics.conventionalPercent") ||
      r.includes("keyMetrics.ticketPercent");
    const citesConsistency =
      r.includes("keyMetrics.longestGapDays") ||
      r.includes("keyMetrics.longestStreakDays") ||
      r.includes("keyMetrics.burstiness");

    if (citesWeekend && !s.includes("weekend")) return false;
    if (citesLate && !s.includes("late")) return false;
    if (citesWorkType && !(s.includes("mix") || s.includes("balance")))
      return false;
    if (
      citesMsg &&
      !(s.includes("message") || s.includes("ticket") || s.includes("hygiene"))
    )
      return false;
    if (
      citesConsistency &&
      !(
        s.includes("gap") ||
        s.includes("streak") ||
        s.includes("burst") ||
        s.includes("consisten")
      )
    )
      return false;

    return true;
  });

  // --- Recommendations: enforce triggers deterministically ---
  out.recommendations = out.recommendations.filter((rec) => {
    if (!rec || typeof rec.action !== "string" || typeof rec.why !== "string")
      return false;

    // Must cite keyMetrics. (prevents "conventionalPercent is 100" missing prefix)
    if (!rec.why.includes("keyMetrics.")) return false;

    const a = rec.action.toLowerCase();

    const looksLikeTicket = a.includes("ticket");
    const looksLikeClarity =
      a.includes("clarity") ||
      a.includes("message") ||
      a.includes("conventional");
    const looksLikeBalance = a.includes("balance") || a.includes("mix");
    const looksLikeCadence =
      a.includes("cadence") || a.includes("weekend") || a.includes("late");

    if (looksLikeTicket) return keyMetrics.ticketPercent === 0;
    if (looksLikeClarity) return keyMetrics.conventionalPercent < 95;
    if (looksLikeBalance) return maxWorkTypePercent >= 60;
    if (looksLikeCadence)
      return (
        keyMetrics.weekendPercent >= 25 || keyMetrics.lateNightPercent >= 20
      );

    // If we can't categorize it, drop it (prevents random advice like “Improve API documentation”)
    return false;
  });

  // Hard cap in case model rambles
  out.themes = out.themes.slice(0, 4);
  out.hypotheses = out.hypotheses.slice(0, 3);
  out.recommendations = out.recommendations.slice(0, 4);

  // Always empty here; server will overwrite deterministically later
  out.watchouts = [];

  return out;
}

function addDeterministicFallbacks(
  narrative: Narrative,
  keyMetrics: KeyMetrics,
): Narrative {
  const out: Narrative = {
    ...narrative,
    themes: Array.isArray(narrative.themes) ? narrative.themes : [],
    hypotheses: Array.isArray(narrative.hypotheses) ? narrative.hypotheses : [],
    recommendations: Array.isArray(narrative.recommendations)
      ? narrative.recommendations
      : [],
    watchouts: Array.isArray(narrative.watchouts) ? narrative.watchouts : [],
  };

  const maxType = (keyMetrics.workTypeMix ?? []).reduce(
    (best, x) => (x.percent > best.percent ? x : best),
    { type: "unknown", percent: 0 },
  );

  const triggerTicket = keyMetrics.ticketPercent === 0;
  const triggerClarity = keyMetrics.conventionalPercent < 95;
  const triggerBalance = maxType.percent >= 60;
  const triggerCadence =
    keyMetrics.weekendPercent >= 25 || keyMetrics.lateNightPercent >= 20;

  const hasRec = (needle: string) =>
    out.recommendations.some(
      (r) =>
        typeof r?.action === "string" &&
        r.action.toLowerCase().includes(needle),
    );

  // --- Deterministic recommendations (only add if triggers hold) ---
  // Add up to 2 fallback recs to keep output useful but not spammy.
  if (out.recommendations.length === 0) {
    if (triggerTicket && !hasRec("ticket")) {
      out.recommendations.push({
        action: "Add ticket IDs to commit subjects",
        why: `keyMetrics.ticketPercent is ${keyMetrics.ticketPercent}`,
      });
    }

    if (triggerCadence && !hasRec("late") && !hasRec("weekend")) {
      // Prefer late-night if it is the bigger driver
      if (keyMetrics.lateNightPercent >= 20) {
        out.recommendations.push({
          action: "Reduce late-night commit concentration",
          why: `keyMetrics.lateNightPercent is ${keyMetrics.lateNightPercent}%`,
        });
      } else {
        out.recommendations.push({
          action: "Reduce weekend commit concentration",
          why: `keyMetrics.weekendPercent is ${keyMetrics.weekendPercent}%`,
        });
      }
    }

    // If still empty and a different trigger applies, add one more (max 2 total)
    if (
      out.recommendations.length === 0 &&
      triggerClarity &&
      !hasRec("message")
    ) {
      out.recommendations.push({
        action: "Improve commit message clarity",
        why: `keyMetrics.conventionalPercent is ${keyMetrics.conventionalPercent}`,
      });
    }

    if (
      out.recommendations.length < 2 &&
      triggerBalance &&
      !hasRec("balance")
    ) {
      out.recommendations.push({
        action: "Balance work types across commits",
        why: `keyMetrics.workTypeMix includes {type:'${maxType.type}', percent:${maxType.percent}}`,
      });
    }

    // Hard cap
    out.recommendations = out.recommendations.slice(0, 2);
  }

  // --- Deterministic hypotheses (only if LLM gave none usable) ---
  if (out.hypotheses.length === 0) {
    // Pick the strongest, most defensible single hypothesis.
    if (keyMetrics.lateNightPercent >= 20) {
      out.hypotheses.push({
        statement: "Might suggest a meaningful share of late-night commits.",
        reason: `keyMetrics.lateNightPercent is ${keyMetrics.lateNightPercent}%`,
      });
    } else if (keyMetrics.weekendPercent >= 25) {
      out.hypotheses.push({
        statement: "Might indicate some weekend activity in commit timing.",
        reason: `keyMetrics.weekendPercent is ${keyMetrics.weekendPercent}%`,
      });
    } else {
      // Use consistency if available; otherwise fall back to workTypeMix diversity.
      if (typeof keyMetrics.longestGapDays === "number") {
        out.hypotheses.push({
          statement: "Might suggest a steady day-to-day commit cadence.",
          reason: `keyMetrics.longestGapDays is ${keyMetrics.longestGapDays}`,
        });
      } else if (maxType.percent > 0) {
        out.hypotheses.push({
          statement: "Might reflect a varied work-type mix across commits.",
          reason: `keyMetrics.workTypeMix includes {type:'${maxType.type}', percent:${maxType.percent}}`,
        });
      }
    }
  }

  // Keep things bounded
  out.hypotheses = out.hypotheses.slice(0, 3);
  out.recommendations = out.recommendations.slice(0, 4);

  return out;
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
      a.localeCompare(b),
    );

    const focus =
      uniqueAuthors.length === 1 ? uniqueAuthors[0] : focusAuthor?.trim();

    if (uniqueAuthors.length > 1 && !focus) {
      throw new HttpError(
        400,
        "focusAuthor is required when multiple authors are present",
        {
          authors: uniqueAuthors,
        },
      );
    }

    const facts = computeFacts(commits, focus!, uniqueAuthors);
    const maxForLLM = facts.dataQuality === "high" ? 60 : 30;
    const subjects = pickSubjects(
      commits,
      focus!,
      Math.min(maxSubjects ?? 60, maxForLLM),
    );
    const lowSignal = subjects.length < 5;

    const keyMetrics = {
      commitCount: facts.totals.commits,
      activeDays: facts.totals.activeDays,
      weekendPercent: facts.rhythm.weekendPercent,
      lateNightPercent: facts.rhythm.lateNightPercent,
      longestStreakDays: facts.consistency.longestStreakDays,
      longestGapDays: facts.consistency.longestGapDays,
      burstiness: facts.consistency.burstiness,
      workTypeMix: facts.workTypeMix.map((t) => ({
        type: t.type,
        percent: t.percent,
      })),
      conventionalPercent: facts.messageQuality.conventionalPercent,
      ticketPercent: facts.messageQuality.ticketPercent,
    };

    const llmInput = {
      authorCount: uniqueAuthors.length,
      focusAuthor: facts.focusAuthor,
      dateRange: facts.dateRange,
      keyMetrics,
      subjects,
      teamContext: facts.teamContext,
    };

    const prompt = `
    You are FocusPulse.

    You will receive a JSON object named "Data". Use ONLY what is in Data.
    Do not invent facts. Do not add extra keys. Do not add confidence fields.
    Return ONLY valid JSON (no markdown, no commentary).

    OUTPUT SCHEMA (exact keys):
    {
      "summary": string,
      "themes": [{ "theme": string, "evidenceSubjects": string[] }],
      "hypotheses": [{ "statement": string, "reason": string }],
      "recommendations": [{ "action": string, "why": string }],
      "watchouts": []
    }

    HARD RULES:
    1) "watchouts" MUST always be [].
    2) Do not include "confidence" fields anywhere.
    3) Do not add any keys beyon the schema above.
    4) Evidence subjects MUST be copied verbatim from Data.subjects (no edits).
    5) Do not cite numbers unless they come from Data.keyMetrics or Data.dateRange.
    6) Never use relative time ("last week"). If mentioning dates, use Data.dateRange.from/to.

    SUMMARY RULES:
    - 1-2 sentences, neutral, factual.
    - Must include: Data.keyMetrics.commitCount, Data.keyMetrics.activeDays, and Data.dateRange.from/to.

    THEMES RULES:
    - 1-4 themes (use fewer if Data.subjects is small).
    - Each theme:
      - theme: 2-5 words, topic-oriented (e.g., "API changes", "UI improvements")
      - evidenceSubjects: 2-6 UNIQUE subjects, copied verbatim from Data.subjects.
    - Do NOT mention numeric metrics inside themes.

    HYPOTHESES RULES (metric-only, global patterns only):
    - 0-3 hypotheses.
    - statement MUST start with exactly one of:
      - "Might indicate ..."
      - "Might reflect ..."
      - "Might suggest ..."
    - statement must talk ONLY about global patterns (cadence, consistency, work type mix, message hygiene).
    - statement must NOT mention any topic words/scopes like "API", "UI", "auth", "build", or any scope-like words from subjects.
    - reason must cite at least ONE metric using exact key names, e.g.:
      "keyMetrics.weekendPercent is 23.1%"
    - The metric cited in "reason" must match the statement:
      - weekendPercent -> weekend work pattern
      - lateNightPercent -> late-night work pattern
      - longestGapDays/longestStreakDays/burstiness -> gaps/streaks/bursts/consistence
      - workTypeMix -> balance/mix of feat/fix/refactor/ci/build
      - conventionalPercent/ticketPercent -> message hygiene/tickets

    RECOMMENDATIONS RULES (global only, metric-triggered):
    - 2-4 recommendations.
    - Only include a recommendation if its trigger is true.
    - Each "why" must cite at least ONE metric VALUE from Data using the exact pattern:
      "keyMetrics.<field> is <value>"
      Examples:
      - "keyMetrics.conventionalPercent is 100"
      - "keyMetrics.ticketPercent is 0"
      - "keyMetrics.weekendPercent is 22.2%"
      - "keyMetrics.workTypeMix includes {type:'fix', percent:44.4}"
    - Do NOT output trigger conditions like "< 95" or ">= 60" in "why".

    Triggers:
    - Ticket IDs: only if keyMetrics.ticketPercent == 0.
    - Commit message clarity: only if keyMetrics.conventionalPercent < 95.
    - Work-type balance: only if any entry in keyMetrics.workTypeMix has percent >= 60.
    - Cadence smoothing: only if keyMetrics.weekendPercent >= 25 OR keyMetrics.lateNightPercent >= 20.

    FINAL CHECK (must follow):
    - If you cannot satisfy a section's rules, return [] for that section only.
    - Always return valid JSON with all top-level keys present.

    Data:
    ${JSON.stringify(llmInput)}
    `.trim();

    let narrativeCandidate: any;

    if (lowSignal) {
      narrativeCandidate = buildLowSignalNarrative(facts);
    } else {
      const narrativeRaw = await llm.generateJson<unknown>(prompt);

      const maybeWrapped =
        narrativeRaw && typeof narrativeRaw === "object"
          ? (narrativeRaw as any)
          : null;
      const unwrapped =
        maybeWrapped &&
        typeof maybeWrapped === "object" &&
        "data" in maybeWrapped
          ? maybeWrapped.data
          : narrativeRaw;

      narrativeCandidate =
        unwrapped && typeof unwrapped === "object" ? unwrapped : {};
    }

    if (!Array.isArray(narrativeCandidate.themes))
      narrativeCandidate.themes = [];
    if (!Array.isArray(narrativeCandidate.hypotheses))
      narrativeCandidate.hypotheses = [];
    if (!Array.isArray(narrativeCandidate.recommendations))
      narrativeCandidate.recommendations = [];
    if (!Array.isArray(narrativeCandidate.watchouts))
      narrativeCandidate.watchouts = [];

    // If lowSignal, enforce empty themes/hypotheses even if something slipped in
    if (lowSignal) {
      narrativeCandidate.themes = [];
      narrativeCandidate.hypotheses = [];
    }

    narrativeCandidate = enforceNarrativeRules(narrativeCandidate, keyMetrics);
    narrativeCandidate = addDeterministicFallbacks(
      narrativeCandidate,
      keyMetrics,
    );
    narrativeCandidate.watchouts = buildDeterministicWatchouts(keyMetrics);
    narrativeCandidate.summary = buildDeterministicSummary(
      facts.dateRange,
      keyMetrics,
      focusAuthor,
    );
    narrativeCandidate.hypotheses = (narrativeCandidate.hypotheses ?? []).map(
      (h: { reason: string | string[] }) => {
        if (h?.reason?.includes("keyMetrics.workTypeMix")) {
          return {
            statement: "Might reflect a varied work-type mix across commits.",
            reason: h.reason,
          };
        }
        return h;
      },
    );
    narrativeCandidate.themes = (narrativeCandidate.themes ?? []).filter(
      (t: { evidenceSubjects: string | any[] }) =>
        (t?.evidenceSubjects.length ?? 0) >= 2,
    );

    const narrativeSafe = sanitizeNarrative(narrativeCandidate);

    // Deduplicate evidenceSubjects per theme
    if (Array.isArray(narrativeSafe?.themes)) {
      narrativeSafe.themes = narrativeSafe.themes.map((t: any) => {
        if (!Array.isArray(t?.evidenceSubjects)) return t;
        const uniq = Array.from(new Set(t.evidenceSubjects));
        return { ...t, evidenceSubjects: uniq.slice(0, 6) };
      });
    }

    const narrativeParsed = InsightsV2NarrativeSchema.safeParse(narrativeSafe);

    if (!narrativeParsed.success) {
      throw new HttpError(
        502,
        "Narrative JSON failed validation",
        narrativeParsed.error.flatten(),
      );
    }

    res.json({
      ok: true,
      data: {
        ...narrativeParsed.data,
        modules: facts,
        dataQuality: facts.dataQuality,
      },
    });
  }),
);
