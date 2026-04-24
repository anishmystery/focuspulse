import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AnalysisHistoryDetailResponse } from "../types/history";
import { getAnalysisById } from "../api/historyApi";
import { formatDateTime } from "../utils/formatDateTime";
import AnalysisResults from "../components/results/AnalysisResults";

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [record, setRecord] = useState<
    AnalysisHistoryDetailResponse["data"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErrorMessage("Missing analysis id.");
      setIsLoading(false);
      return;
    }

    // id is coming from useParams() (react-router-dom). Its runtime value can be missing, so the types allow undefined — hence string | undefined.
    // The library's types permit undefined even if you passed <{ id: string }>.
    // Even though you check if (!id) return, TypeScript doesn't always preserve the narrowed type for variables captured by async functions/closures.
    // That makes the compiler still treat id as possibly undefined inside loadRecord().
    // SOLUTION: Capture a local, narrowed copy before the async function
    const analysisId = id;

    let ignore = false;

    async function loadRecord() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getAnalysisById(analysisId);

        if (!ignore) {
          setRecord(response.data);
        }
      } catch {
        if (!ignore) {
          setErrorMessage("Unable to load this analysis run.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadRecord();

    return () => {
      ignore = true;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/history"
          className="text-sm font-medium text-slate-400 transition hover:text-white"
        >
          {"<- Back to history"}
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          Analysis detail
        </h1>
        {record && (
          <p className="mt-2 text-sm text-slate-400">
            Saved on {formatDateTime(record.createdAt)}
          </p>
        )}
      </div>
      {isLoading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm text-slate-400">Loading analysis...</p>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm font-medium text-red-300">Analysis failed</p>
          <p className="mt-1 text-sm text-red-200">{errorMessage}</p>
        </div>
      )}
      {!isLoading && !errorMessage && record && (
        <AnalysisResults result={record.response.data} />
      )}
    </div>
  );
}
