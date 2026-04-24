import { Link } from "react-router-dom";
import type { AnalysisHistoryItem } from "../../types/history";
import { getSignalBadgeClass } from "../../utils/getSignalBadgeClass";
import { formatDateTime } from "../../utils/formatDateTime";
import { formatRange } from "../../utils/formatRange";

type HistoryCardProps = {
  item: AnalysisHistoryItem;
};

type MiniStatProps = {
  label: string;
  value: string | number;
};

function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function HistoryCard({ item }: HistoryCardProps) {
  return (
    <Link
      to={`/history/${item.id}`}
      className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">
              {item.focusAuthor}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getSignalBadgeClass(item.signal)}`}
            >
              {item.signal}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Created {formatDateTime(item.createdAt)}
          </p>
        </div>
        <p className="text-xs text-slate-400">
          {formatRange(item.dateRange.from, item.dateRange.to)}
        </p>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">
        {item.summary || "No summary available."}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        <MiniStat label="Commits" value={item.commitCount} />
        <MiniStat label="Active days" value={item.activeDays} />
        <MiniStat label="Themes" value={item.themeCount} />
        <MiniStat label="Hypotheses" value={item.hypothesisCount} />
        <MiniStat label="Recs" value={item.recommendationCount} />
      </div>
    </Link>
  );
}
