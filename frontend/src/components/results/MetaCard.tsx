import type { AnalyzeMeta } from "../../types/analyze";
import { formatRange } from "../../utils/formatRange";
import { getSignalBadgeClass } from "../../utils/getSignalBadgeClass";

type MetaCardProps = {
  meta: AnalyzeMeta;
};

type StatItemProps = {
  label: string;
  value: string | number;
};

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function MetaCard({ meta }: MetaCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Analysis details</h2>
          <p className="mt-1 text-sm text-slate-400">
            Core metadata and deterministic stats from the analyzed commit set.
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${getSignalBadgeClass(meta.signal)}`}
        >
          {meta.signal} signal
        </span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatItem label="Focus Author" value={meta.focusAuthor} />
        <StatItem
          label="Authors Detected"
          value={meta.authorsDetected.join(", ")}
        />
        <StatItem
          label="Date Range"
          value={formatRange(meta.dateRange.from, meta.dateRange.to)}
        />
        <StatItem label="Commit Count" value={meta.commitCount} />
        <StatItem label="Active Days" value={meta.activeDays} />
        <StatItem label="Version" value={meta.version} />
        <StatItem label="Souce" value={meta.source} />
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-200">Warnings</h3>
        {meta.warnings.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No warnings.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {meta.warnings.map((warning) => (
              <li
                key={warning}
                className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300"
              >
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
