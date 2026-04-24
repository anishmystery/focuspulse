import type { AnalysisHistoryItem } from "../../types/history";
import HistoryCard from "./HistoryCard";

type HistoryListProps = {
  items: AnalysisHistoryItem[];
};

export default function HistoryList({ items }: HistoryListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white">No history yet</h2>
        <p className="mt-2 text-sm text-slate-400">
          Run an analysis first. Saved analysis runs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <HistoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}
