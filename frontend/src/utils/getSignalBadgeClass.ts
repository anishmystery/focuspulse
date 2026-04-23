export function getSignalBadgeClass(signal: "low" | "medium" | "high"): string {
  switch (signal) {
    case "low":
      return "bg-amber-950/60 text-amber-300 border border-amber-800";
    case "medium":
      return "bg-sky-950/60 text-sky-300 border border-sky-800";
    case "high":
      return "bg-emerald-950/60 text-emerald-300 border border-emerald-800";
    default:
      return "bg-slate-800 text-slate-200 border border-slate-700";
  }
}
