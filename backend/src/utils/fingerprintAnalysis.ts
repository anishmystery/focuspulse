import crypto from "node:crypto";

type FingerprintInput = {
  commits: Array<{
    sha: string;
    author: string;
    authoredAt: string;
    subject: string;
  }>;
  focusAuthor: string;
  source: "git-log";
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion?: string;
};

export function fingerprintAnalysis(input: FingerprintInput): string {
  const canonical = {
    source: input.source,
    focusAuthor: input.focusAuthor,
    pipelineVersion: input.pipelineVersion,
    insightsVersion: input.insightsVersion,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    commits: input.commits.map((commit) => ({
      sha: commit.sha,
      author: commit.author,
      authoredAt: commit.authoredAt,
      subject: commit.subject,
    })),
  };

  const serialized = JSON.stringify(canonical);

  return crypto.createHash("sha256").update(serialized).digest("hex");
}
