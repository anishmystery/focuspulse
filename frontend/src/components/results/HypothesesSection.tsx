import type { AnalyzeHypothesis } from "../../types/analyze";

type HypothesesSectionProps = {
  hypotheses: AnalyzeHypothesis[];
};

export default function HypothesesSection({
  hypotheses,
}: HypothesesSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Hypotheses</h2>
      <p className="mt-1 text-sm text-slate-400">
        Pattern interpretations inferred from the available metrics.
      </p>
      {hypotheses.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No strong hypotheses were generated for this analysis.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {hypotheses.map((item, index) => (
            <article
              key={`${item.statement}-${index}`}
              className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                {item.statement}
              </h3>
              <p className="mt-2 text-sm text-slate-300">{item.reason}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
