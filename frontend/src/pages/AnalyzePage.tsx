import { useState } from "react";
import type { AnalyzeSuccessResponse } from "../types/analyze";
import AnalyzeHelpText from "../components/analyze/AnalyzeHelpText";
import AnalyzeErrorBanner from "../components/analyze/AnalyzeErrorBanner";
import AnalyzeForm from "../components/analyze/AnalyzeForm";

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
      {result && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Raw response</h2>
            <p className="mt-1 text-sm text-slate-400">
              Temporary view for verifying the end-to-end frontend/backend flow.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{JSON.stringify(result, null, 2)}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
