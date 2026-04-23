import type { AnalyzeResult } from "../../types/analyze";
import DebugPanel from "./DebugPanel";
import HypothesesSection from "./HypothesesSection";
import MetaCard from "./MetaCard";
import RecommendationsSection from "./RecommendationsSection";
import SummaryCard from "./SummaryCard";
import ThemesSection from "./ThemesSection";
import WatchoutsSection from "./WatchoutsSection";

type AnalysisResultsProps = {
  result: AnalyzeResult;
};

export default function AnalysisResults({ result }: AnalysisResultsProps) {
  return (
    <div className="space-y-6">
      <SummaryCard summary={result.summary} />
      <MetaCard meta={result.meta} />
      <ThemesSection themes={result.themes} />
      <HypothesesSection hypotheses={result.hypotheses} />
      <RecommendationsSection recommendations={result.recommendations} />
      <WatchoutsSection watchouts={result.watchouts} />
      <DebugPanel debug={result.debug} />
    </div>
  );
}
