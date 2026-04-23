type SummaryCardProps = {
  summary: string;
};

export default function SummaryCard({ summary }: SummaryCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Summary</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">{summary}</p>
    </section>
  );
}
