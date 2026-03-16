import { z } from "zod";
import { Router } from "express";
import { OllamaClient } from "../services/llm/ollamaClient";
import { HttpError } from "../utils/httpError";
import { CommitSchema, dateKeyUTC, percentile } from "./insightsV1";
import { asyncHandler } from "../utils/asyncHandler";
import {
  InsightsV2NarrativeSchema,
  computeFacts,
  pickSubjects,
  buildDeterministicWatchouts,
  buildDeterministicSummary,
  buildLowSignalNarrative,
  clamp01,
} from "./insightsV2";

const BodySchema = z.object({
  authors: z.array(z.string()).min(1),
  commits: z.array(CommitSchema).min(1),
  focusAuthor: z.string().optional(),
  maxSubjects: z.number().int().min(10).max(120).optional(), // optional override
});

type Theme = { theme: string; evidenceSubjects: string[] };
type Hypothesis = { statement: string; reason: string };
type Recommendation = { action: string; why: string };

const isTheme = (x: any): x is Theme =>
  x &&
  typeof x === "object" &&
  typeof x.theme === "string" &&
  Array.isArray(x.evidenceSubjects) &&
  x.evidenceSubjects.every((s: any) => typeof s === "string");

const isHypothesis = (x: any): x is Hypothesis =>
  x &&
  typeof x === "object" &&
  typeof x.statement === "string" &&
  typeof x.reason === "string";

const isRecommendation = (x: any): x is Recommendation =>
  x &&
  typeof x === "object" &&
  typeof x.action === "string" &&
  typeof x.why === "string";

// Optional: normalize strings, trim, and sanitize arrays
const coerceTheme = (t: Theme): Theme => ({
  theme: t.theme.trim(),
  evidenceSubjects: [
    ...new Set(t.evidenceSubjects.map((s) => s.trim()).filter(Boolean)),
  ],
});

const coerceHypothesis = (h: Hypothesis): Hypothesis => ({
  statement: h.statement.trim(),
  reason: h.reason.trim(),
});

const coerceRecommendation = (r: Recommendation): Recommendation => ({
  action: r.action.trim(),
  why: r.why.trim(),
});

type AnyObj = Record<string, any>;

function flattenNestedArrayItems<T>(
  input: any,
  nestedKey: string,
  isItem: (x: any) => x is T,
  coerce?: (x: T) => T,
): T[] {
  const out: T[] = [];

  const visit = (node: any) => {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (typeof node === "object") {
      // collect valid items
      if (isItem(node)) {
        out.push(coerce ? coerce(node) : node);
      }

      // unwrap nestedKey recursion: { [nestedKey]: [...] }
      const maybeNested = (node as AnyObj)[nestedKey];
      if (Array.isArray(maybeNested)) visit(maybeNested);

      return;
    }
  };

  visit(input);

  // de-dupe by stable JSON (good enough for small lists)
  const seen = new Set<string>();
  return out.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeNarrative(raw: any) {
  if (!raw || typeof raw !== "object") return raw;

  // keep your confidence clamping if you still use it elsewhere
  if ("confidence" in raw) raw.confidence = clamp01(raw.confidence);

  // your existing shallow clamp for nested confidence fields can stay
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

  // ✅ enforce flat, validated shapes
  raw.themes = flattenNestedArrayItems(
    raw.themes,
    "themes",
    isTheme,
    coerceTheme,
  );
  raw.hypotheses = flattenNestedArrayItems(
    raw.hypotheses,
    "hypotheses",
    isHypothesis,
    coerceHypothesis,
  );
  raw.recommendations = flattenNestedArrayItems(
    raw.recommendations,
    "recommendations",
    isRecommendation,
    coerceRecommendation,
  );

  return raw;
}

function enforceRecommendationRules(recs, keyMetrics) {
  const allowed = new Set([
    "Add ticket IDs to commits",
    "Reduce late-night commit concentration",
    "Reduce weekend commit concentration",
    "Balance work types across commits",
    "Improve commit message conventions",
  ]);

  const arr = Array.isArray(recs) ? recs : [];

  const topWorkType = (() => {
    const mix = Array.isArray(keyMetrics.workTypeMix)
      ? keyMetrics.workTypeMix
      : [];
    if (mix.length === 0) return { type: "unknown", percent: 0 };
    return mix.reduce(
      (best, cur) => (Number(cur.percent) > Number(best.percent) ? cur : best),
      mix[0],
    );
  })();

  const eligible = (action) => {
    switch (action) {
      case "Add ticket IDs to commits":
        return keyMetrics.ticketPercent === 0;
      case "Reduce late-night commit concentration":
        return keyMetrics.lateNightPercent >= 20;
      case "Reduce weekend commit concentration":
        return keyMetrics.weekendPercent >= 25;
      case "Balance work types across commits":
        return Number(topWorkType.percent) >= 60;
      case "Improve commit message conventions":
        return keyMetrics.conventionalPercent < 95;
      default:
        return false;
    }
  };

  // Canonicalize WHY so the model can't drift/contradict
  const canonicalWhy = (action) => {
    switch (action) {
      case "Add ticket IDs to commits":
        return `keyMetrics.ticketPercent is ${keyMetrics.ticketPercent}`;
      case "Reduce late-night commit concentration":
        return `keyMetrics.lateNightPercent is ${keyMetrics.lateNightPercent}`;
      case "Reduce weekend commit concentration":
        return `keyMetrics.weekendPercent is ${keyMetrics.weekendPercent}`;
      case "Balance work types across commits":
        return `keyMetrics.workTypeMix has topType=${topWorkType.type} percent=${topWorkType.percent}`;
      case "Improve commit message conventions":
        return `keyMetrics.conventionalPercent is ${keyMetrics.conventionalPercent}`;
      default:
        return "";
    }
  };

  // Filter unknown actions + ineligible ones; rewrite why; dedupe; cap to 3
  const seen = new Set();
  const out = [];

  for (const r of arr) {
    if (!r || typeof r !== "object") continue;

    const action = typeof r.action === "string" ? r.action.trim() : "";
    if (!allowed.has(action)) continue;
    if (!eligible(action)) continue;

    if (seen.has(action)) continue;
    seen.add(action);

    out.push({
      action,
      why: canonicalWhy(action),
    });

    if (out.length >= 3) break;
  }

  return out;
}

function enforceHypothesisRules(hypotheses, keyMetrics) {
  const arr = Array.isArray(hypotheses) ? hypotheses : [];

  const prefixes = ["Might indicate ", "Might reflect ", "Might suggest "];
  const topicWordRe = /\b(api|ui|auth|build|ci|deploy|frontend|backend)\b/i;

  const allowedMetrics = new Set([
    "weekendPercent",
    "lateNightPercent",
    "longestGapDays",
    "longestStreakDays",
    "burstiness",
    "workTypeMix",
    "conventionalPercent",
    "ticketPercent",
    "activeDays",
    "commitCount",
  ]);

  const extractMetrics = (reason) => {
    const matches = [...reason.matchAll(/keyMetrics\.([a-zA-Z0-9_]+)/g)];
    return matches.map((m) => m[1]);
  };

  const canonicalWorkTypeMixReason = () => {
    const mix = Array.isArray(keyMetrics.workTypeMix)
      ? keyMetrics.workTypeMix
      : [];
    if (mix.length === 0) {
      return "keyMetrics.workTypeMix has topType=unknown percent=0";
    }
    const top = mix.reduce(
      (best, cur) => (Number(cur.percent) > Number(best.percent) ? cur : best),
      mix[0],
    );
    return `keyMetrics.workTypeMix has topType=${top.type} percent=${top.percent}`;
  };

  const normalizeStatement = (statement, metrics) => {
    const s = statement.trim().replace(/\s+/g, " ");

    // If the statement talks about message hygiene but the reason only cites ticketPercent,
    // rewrite to avoid overclaiming conventionalPercent too.
    if (
      /message hygiene/i.test(s) &&
      metrics.includes("ticketPercent") &&
      !metrics.includes("conventionalPercent")
    ) {
      const prefix = prefixes.find((p) => s.startsWith(p)) ?? "Might reflect ";
      return `${prefix}a need for better ticket linkage hygiene due to ticketPercent being 0%.`;
    }

    // If the statement talks about message hygiene but the reason only cites conventionalPercent
    if (
      /message hygiene/i.test(s) &&
      metrics.includes("conventionalPercent") &&
      !metrics.includes("ticketPercent")
    ) {
      const prefix = prefixes.find((p) => s.startsWith(p)) ?? "Might reflect ";
      return `${prefix}consistent commit message conventions due to conventionalPercent being ${keyMetrics.conventionalPercent}%.`;
    }

    // If work-type statement is messy, normalize it to a stable phrasing
    if (
      /work type|work-type|workTypeMix|balance|mix/i.test(s) &&
      metrics.includes("workTypeMix")
    ) {
      const prefix = prefixes.find((p) => s.startsWith(p)) ?? "Might suggest ";
      return `${prefix}a balanced work-type mix across commits.`;
    }

    return s;
  };

  const statementReasonCompatible = (statement, metrics) => {
    const s = statement.toLowerCase();

    const mentionsWeekend = s.includes("weekend");
    const mentionsLateNight =
      s.includes("late-night") || s.includes("late night");
    const mentionsCadence =
      s.includes("cadence") ||
      s.includes("consistent") ||
      s.includes("consistency") ||
      s.includes("gap") ||
      s.includes("streak");
    const mentionsBurst =
      s.includes("burst") || s.includes("variable work pattern");
    const mentionsWorkType =
      s.includes("work type") ||
      s.includes("work-type") ||
      s.includes("mix") ||
      s.includes("balance");
    const mentionsMessageHygiene =
      s.includes("message hygiene") ||
      s.includes("ticket") ||
      s.includes("convention");

    if (mentionsWeekend && !metrics.includes("weekendPercent")) return false;
    if (mentionsLateNight && !metrics.includes("lateNightPercent"))
      return false;

    if (
      mentionsCadence &&
      !(
        metrics.includes("longestGapDays") ||
        metrics.includes("longestStreakDays") ||
        metrics.includes("activeDays")
      )
    ) {
      return false;
    }

    if (mentionsBurst && !metrics.includes("burstiness")) return false;
    if (mentionsWorkType && !metrics.includes("workTypeMix")) return false;

    if (
      mentionsMessageHygiene &&
      !(
        metrics.includes("ticketPercent") ||
        metrics.includes("conventionalPercent")
      )
    ) {
      return false;
    }

    return true;
  };

  const seen = new Set();
  const out = [];

  for (const h of arr) {
    let statement =
      typeof h.statement === "string"
        ? h.statement.trim().replace(/\s+/g, " ")
        : "";
    let reason = typeof h.reason === "string" ? h.reason.trim() : "";

    if (!statement || !reason) continue;

    if (!prefixes.some((p) => statement.startsWith(p))) continue;
    if (topicWordRe.test(statement)) continue;

    if (!reason.includes("keyMetrics.")) continue;
    if (reason.includes("workTypeMix.conventionalPercent")) continue;

    const metrics = extractMetrics(reason);
    if (metrics.length === 0) continue;
    if (metrics.some((m) => !allowedMetrics.has(m))) continue;

    if (!statementReasonCompatible(statement, metrics)) continue;

    // Gate burstiness hypothesis so low values don't create noisy claims
    if (metrics.includes("burstiness") && Number(keyMetrics.burstiness) < 3) {
      continue;
    }

    if (metrics.includes("workTypeMix")) {
      reason = canonicalWorkTypeMixReason();
    }

    statement = normalizeStatement(statement, metrics);

    const key = `${statement}||${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ statement, reason });
    if (out.length >= 3) break;
  }

  return out;
}

export const insightsV3Router = Router();
const llm = new OllamaClient();

export async function generateInsightsV3FromCommits(input: z.infer<typeof BodySchema>) {
  const { authors, commits, focusAuthor, maxSubjects } = input;
  const uniqueAuthors = Array.from(new Set(authors)).sort((a, b) =>
    a.localeCompare(b),
  );

  const focus = uniqueAuthors.length === 1 ? uniqueAuthors[0] : focusAuthor?.trim();

  if (uniqueAuthors.length > 1 && !focus) {
    throw new HttpError(
      400,
      "focusAuthor is required when multiple authors are present",
      { authors: uniqueAuthors },
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

  const system = `
  You are FocusPulse.
  Return ONLY valid JSON. No markdown. No explanations. No extra keys.
  Use double quotes for all JSON strings.
  If you cannot comply, return an empty array for the requested list.
  `.trim();

  const themesPrompt = `
  ${system}

  Task: Group the commit subjects into 1-4 themes.

  Return JSON exactly:
  {"themes":[{"theme":"...","evidenceSubjects":["..."]}]}

  Rules:
  - Use ONLY the provided subjects.
  - theme: 2-5 words, Title Case, topic-oriented.
  - evidenceSubjects: 2-6 UNIQUE subjects copied verbatim from the subjects list.
  - Do not invent subjects. Do not include numbers. Do not include confidence.

  Subjects:
  ${JSON.stringify(subjects)}
  `.trim();

  const hypothesesPrompt = `
  ${system}

  Task: Write 0-3 hypotheses about global work patterns using ONLY keyMetrics.

  Return JSON exactly:
  {"hypotheses":[{"statement":"...","reason":"..."}]}

  Rules (metric-only, global patterns only):
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

  keyMetrics:
  ${JSON.stringify(keyMetrics)}
  `.trim();

  const recommendationsPrompt = `
  ${system}

  Task: Write 0-3 actionable recommendations based ONLY on keyMetrics.

  Return JSON exactly:
  {"recommendations":[{"action":"...","why":"..."}]}

  Hard rules:
  - Global only (no repo topics like API/UI/auth/build).
  - action must be concise (3-10 words), imperative verb first.
  - why MUST cite EXACTLY ONE metric in this format:
    "keyMetrics.<field> is <value>"
  - why must NOT contain operators or logic words: no ">", "<", ">=", "<=", "OR", "AND".
  - Do not invent values. Copy values from keyMetrics.

  Allowed recommendation types (choose from these only):
  1) "Add ticket IDs to commits" (only if keyMetrics.ticketPercent is 0)
  2) "Reduce late-night commit concentration" (only if keyMetrics.lateNightPercent is 20 or higher)
  3) "Reduce weekend commit concentration" (only if keyMetrics.weekendPercent is 25 or higher)
  4) "Balance work types across commits" (only if the top workTypeMix percent is 60 or higher)
  5) "Improve commit message conventions" (only if keyMetrics.conventionalPercent is below 95)

  If none apply, return {"recommendations":[]}.

  keyMetrics:
  ${JSON.stringify(keyMetrics)}
  `.trim();

  let narrativeCandidate: any;

  if (lowSignal) {
    narrativeCandidate = buildLowSignalNarrative(facts);
  } else {
    const unwrap = (x: any) =>
      x && typeof x === "object" && "data" in x ? (x as any).data : x;

    const themesRaw = unwrap(await llm.generateJson<unknown>(themesPrompt));
    const hypothesesRaw = unwrap(await llm.generateJson<unknown>(hypothesesPrompt));
    const recommendationsRaw = unwrap(await llm.generateJson<unknown>(recommendationsPrompt));

    narrativeCandidate = {
      themes:
        themesRaw && typeof themesRaw === "object" && "themes" in themesRaw
          ? (themesRaw as any).themes
          : [],
      hypotheses:
        hypothesesRaw && typeof hypothesesRaw === "object" && "hypotheses" in hypothesesRaw
          ? (hypothesesRaw as any).hypotheses
          : [],
      recommendations:
        recommendationsRaw && typeof recommendationsRaw === "object" && "recommendations" in recommendationsRaw
          ? (recommendationsRaw as any).recommendations
          : [],
      watchouts: [],
      summary: "",
    };
  }

  if (!Array.isArray(narrativeCandidate.themes)) narrativeCandidate.themes = [];
  if (!Array.isArray(narrativeCandidate.hypotheses)) narrativeCandidate.hypotheses = [];
  if (!Array.isArray(narrativeCandidate.recommendations)) narrativeCandidate.recommendations = [];
  if (!Array.isArray(narrativeCandidate.watchouts)) narrativeCandidate.watchouts = [];

  if (lowSignal) {
    narrativeCandidate.themes = [];
    narrativeCandidate.hypotheses = [];
  }

  narrativeCandidate.watchouts = buildDeterministicWatchouts(keyMetrics);
  narrativeCandidate.summary = buildDeterministicSummary(
    facts.dateRange,
    keyMetrics,
    focus!,
  );

  const narrativeSafe = sanitizeNarrative(narrativeCandidate);
  narrativeSafe.recommendations = enforceRecommendationRules(
    narrativeSafe.recommendations,
    keyMetrics,
  );
  narrativeSafe.hypotheses = enforceHypothesisRules(
    narrativeSafe.hypotheses,
    keyMetrics,
  );

  if (Array.isArray(narrativeSafe?.themes)) {
    narrativeSafe.themes = narrativeSafe.themes.map((t: any) => {
      if (!Array.isArray(t?.evidenceSubjects)) return t;
      const uniq = Array.from(new Set(t.evidenceSubjects));
      return { ...t, evidenceSubjects: uniq.slice(0, 6) };
    });
  }

  if (Array.isArray(narrativeSafe.themes)) {
    narrativeSafe.themes = narrativeSafe.themes
      .map((t: any) => ({
        ...t,
        evidenceSubjects: Array.isArray(t.evidenceSubjects)
          ? t.evidenceSubjects
          : [],
      }))
      .sort(
        (a: any, b: any) =>
          (b.evidenceSubjects.length ?? 0) - (a.evidenceSubjects.length ?? 0),
      )
      .slice(0, 6);
  }

  const narrativeParsed = InsightsV2NarrativeSchema.safeParse(narrativeSafe);
  if (!narrativeParsed.success) {
    throw new HttpError(
      502,
      "Narrative JSON failed validation",
      narrativeParsed.error.flatten(),
    );
  }

  return {
    ...narrativeParsed.data,
    modules: facts,
    dataQuality: facts.dataQuality,
  };
}

insightsV3Router.post(
  "/insights/v3/from-commits",
  asyncHandler(async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const data = await generateInsightsV3FromCommits(parsed.data);

    res.json({
      ok: true,
      data,
    });
  }),
);
