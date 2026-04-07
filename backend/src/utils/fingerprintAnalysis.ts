import crypto from "node:crypto";

type CommitFingerprintInput = Array<{
  sha: string;
  author: string;
  authoredAt: string;
  subject: string;
}>;

type FingerprintInput = {
  commits: CommitFingerprintInput;
  focusAuthor: string;
  source: "git-log";
  pipelineVersion: string;
  insightsVersion: string;
  model: string;
  promptVersion?: string;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalizeCommits(commits: CommitFingerprintInput) {
  return commits.map((commit) => ({
    sha: commit.sha,
    author: commit.author,
    authoredAt: commit.authoredAt,
    subject: commit.subject,
  }));
}

export function fingerprintAnalysis(input: FingerprintInput): string {
  const canonical = {
    source: input.source,
    focusAuthor: input.focusAuthor,
    pipelineVersion: input.pipelineVersion,
    insightsVersion: input.insightsVersion,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    commits: canonicalizeCommits(input.commits),
  };

  return sha256(JSON.stringify(canonical));
}

export function fingerprintAnalysisContent(input: {
  commits: CommitFingerprintInput;
  focusAuthor: string;
  source: "git-log";
}): string {
  const canonical = {
    source: input.source,
    focusAuthor: input.focusAuthor,
    commits: canonicalizeCommits(input.commits),
  };

  return sha256(JSON.stringify(canonical));
}
