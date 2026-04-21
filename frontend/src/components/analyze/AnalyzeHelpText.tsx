export default function AnalyzeHelpText() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold text-slate-100">
        Expected git log format
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Paste logs generated in the following format:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
        <code>git log --pretty=format:'%H|%an|%aI|%s'</code>
      </pre>
      <p className="mt-3 text-xs text-slate-500">
        Each line should contain commit hash, author, ISO date and subject
        separated by pipes.
      </p>
    </div>
  );
}
