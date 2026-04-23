import { useState } from "react";
import type { AnalyzeSuccessResponse } from "../types/analyze";
import AnalyzeHelpText from "../components/analyze/AnalyzeHelpText";
import AnalyzeErrorBanner from "../components/analyze/AnalyzeErrorBanner";
import AnalyzeForm from "../components/analyze/AnalyzeForm";
import AnalysisResults from "../components/results/AnalysisResults";

export default function AnalyzePage() {
  const [result, setResult] = useState<AnalyzeSuccessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Analyze git history
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Paste git log and generate structured productivity insights for a
          single author or filtered commit set.
        </p>
      </div>
      <AnalyzeHelpText />
      <AnalyzeErrorBanner message={errorMessage} />
      <AnalyzeForm
        onSuccess={(data) => {
          setResult(data);
          setErrorMessage(null);
        }}
        onError={setErrorMessage}
      />
      {result && <AnalysisResults result={result.data} />}
    </div>
  );
}
