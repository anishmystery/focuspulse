import type { AnalyzeDebug } from "../../types/analyze";

type DebugPanelProps = {
  debug?: AnalyzeDebug;
};

export default function DebugPanel({ debug }: DebugPanelProps) {
  if (!debug) return null;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Debug</h2>
      <p className="mt-1 text-sm text-slate-400">
        Additional pipeline and normalization information returned on request.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
        <code>{JSON.stringify(debug, null, 2)}</code>
      </pre>
    </section>
  );
}
