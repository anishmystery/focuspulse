import { useEffect, useState } from "react";
import type { AnalysisHistoryItem } from "../types/history";
import { getAnalysisHistory } from "../api/historyApi";
import HistoryList from "../components/history/HistoryList";

export default function HistoryPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getAnalysisHistory({ limit: 20 });

        if (!ignore) {
          setItems(response.data);
        }
      } catch {
        if (!ignore) {
          setErrorMessage("Unable to load analysis history.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    loadHistory();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          History
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Review previous analysis runs and reopen saved insights.
        </p>
      </div>
      {isLoading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm text-slate-400">Loading history...</p>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm font-medium text-red-300">History failed</p>
          <p className="mt-1 text-sm text-red-200">{errorMessage}</p>
        </div>
      )}
      {!isLoading && !errorMessage && <HistoryList items={items} />}
    </div>
  );
}
