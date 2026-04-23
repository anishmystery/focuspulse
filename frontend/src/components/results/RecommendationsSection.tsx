import type { AnalyzeRecommendation } from "../../types/analyze";

type RecommendationsSectionProps = {
  recommendations: AnalyzeRecommendation[];
};

export default function RecommendationsSection({
  recommendations,
}: RecommendationsSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Recommendations</h2>
      <p className="mt-1 text-sm text-slate-400">
        Actionable suggestions derived from the current metrics.
      </p>
      {recommendations.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No strong hypotheses were generated for this analysis.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {recommendations.map((item, index) => (
            <article
              key={`${item.action}-${index}`}
              className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                {item.action}
              </h3>
              <p className="mt-2 text-sm text-slate-300">{item.why}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
