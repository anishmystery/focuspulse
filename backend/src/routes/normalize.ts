import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { asyncHandler } from "../utils/asyncHandler";

export const normalizeRouter = Router();

const NormalizeGitLogBody = z.object({
  source: z.literal("git-log-v1"),
  text: z.string().min(1),
});

type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "docs"
  | "chore"
  | "test"
  | "ci"
  | "perf"
  | "style"
  | "build"
  | "other";

function classifySubject(subject: string): {
  type: CommitType;
  tags: string[];
  ticketIds: string[];
} {
  const s = subject.trim();
  const lower = s.toLowerCase();

  // Ticket patterns: ABC-123, DEV-9, etc.
  const ticketIds = Array.from(new Set(s.match(/[A-Z][A-Z0-9]+-\d+/g) ?? []));

  // Conventional commits like: feat(auth): ...
  const conventional = s.match(
    /^(feat|fix|refactor|docs|chore|test\ci\perf\style\build)(\(.+\))?:\s+/i
  );
  const tags: string[] = [];

  let type: CommitType = "other";
  if (conventional?.[1]) type = conventional[1].toLowerCase() as CommitType;

  if (ticketIds.length) tags.push("ticket");
  if (/\bwip\b/i.test(s)) tags.push("wip");
  if (/\brevert\b/i.test(s)) tags.push("revert");
  if (/\bmerge\b/i.test(s)) tags.push("merge");
  if (/\bhotfix\b/i.test(s)) tags.push("hotfix");
  if (/\bcleanup\b/i.test(s)) tags.push("cleanup");

  // If not conventional, infer from keywords (light heuristics)
  if (type === "other") {
    if (lower.startsWith("fix") || lower.includes("bug")) type = "fix";
    else if (lower.startsWith("refactor")) type = "refactor";
    else if (lower.startsWith("docs") || lower.includes("readme"))
      type = "docs";
    else if (lower.startsWith("chore")) type = "chore";
    else if (lower.startsWith("test")) type = "test";
    else if (lower.startsWith("perf") || lower.includes("optimiz"))
      type = "perf";
    else if (lower.startsWith("build")) type = "build";
    else if (lower.startsWith("ci")) type = "ci";
    else if (lower.startsWith("style")) type = "style";
    else if (lower.startsWith("feat") || lower.startsWith("feature"))
      type = "feat";
  }

  return { type, tags: Array.from(new Set(tags)), ticketIds };
}

function parseGitLogLine(line: string, lineNumber: number) {
  // We only split on the first 3 pipes so subjects containing "|" don’t break parsing
  const i1 = line.indexOf("|");
  const i2 = i1 === -1 ? -1 : line.indexOf("|", i1 + 1);
  const i3 = i2 === -1 ? -1 : line.indexOf("|", i2 + 1);

  if (i1 === -1 || i2 === -1 || i3 === -1) {
    return {
      ok: false as const,
      warning: {
        lineNumber,
        reason: "Missing delimiter(s) '|'",
        line: line.slice(0, 200),
      },
    };
  }

  const hash = line.slice(0, i1).trim();
  const authorName = line.slice(i1 + 1, i2).trim();
  const dateRaw = line.slice(i2 + 1, i3).trim();
  const subject = line.slice(i3 + 1).trim();

  if (hash.length < 7) {
    return {
      ok: false as const,
      warning: {
        lineNumber,
        reason: "Invalid commit hash",
        line: line.slice(0, 200),
      },
    };
  }
  if (!authorName) {
    return {
      ok: false as const,
      warning: {
        lineNumber,
        reason: "Missing author name",
        line: line.slice(0, 200),
      },
    };
  }
  if (!subject) {
    return {
      ok: false as const,
      warning: {
        lineNumber,
        reason: "Missing commit subject",
        line: line.slice(0, 200),
      },
    };
  }

  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      warning: { lineNumber, reason: "Invalid date", line: line.slice(0, 200) },
    };
  }

  const dayOfWeek = date.toLocaleString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const hourOfDayUtc = date.getUTCHours();

  const { type, tags, ticketIds } = classifySubject(subject);

  return {
    ok: true as const,
    commit: {
      hash,
      authorName,
      dateIso: date.toISOString(),
      subject,
      derived: {
        dayOfWeekUtc: dayOfWeek,
        hourOfDayUtc,
        type,
        tags,
        ticketIds,
      },
    },
  };
}

normalizeRouter.post(
  "/normalize/gitlog",
  asyncHandler(async (require, res) => {
    const parsed = NormalizeGitLogBody.safeParse(require.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request body", parsed.error.flatten());
    }

    const rawText = parsed.data.text;

    // Simple normalization: trime and drop empty lines
    const lines = rawText
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new HttpError(400, "No parsable lines found");
    }

    const warnings: Array<{
      lineNumber: number;
      reason: string;
      line: string;
    }> = [];
    const commits: any[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNumber = idx + 1;
      const result = parseGitLogLine(lines[idx], lineNumber);
      if (!result.ok) warnings.push(result.warning);
      else commits.push(result.commit);
    }

    if (commits.length === 0) {
      throw new HttpError(422, "Unalbe to parse any commits", {
        warnings: warnings.slice(0, 20),
      });
    }

    const dates = commits
      .map((c) => new Date(c.dateIso).getTime())
      .sort((a, b) => a - b);
    const authors = new Set(commits.map((c) => c.authorName));

    res.json({
      ok: true,
      data: {
        stats: {
          commitCount: commits.length,
          authorCount: authors.size,
          dateRange: {
            from: new Date(dates[0]).toISOString(),
            to: new Date(dates[dates.length - 1]).toISOString(),
          },
        },
        commits,
        warnings,
      },
    });
  })
);
