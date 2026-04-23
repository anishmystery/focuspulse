type WatchoutsSectionProps = {
  watchouts: string[];
};

export default function WatchoutsSection({ watchouts }: WatchoutsSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Watchouts</h2>
      <p className="mt-1 text-sm text-slate-400">
        Caveats or limitations to keep in mind while reading the analysis.
      </p>

      {watchouts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No watchouts.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {watchouts.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
