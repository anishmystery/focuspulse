import { formatDate } from "./formatDate";

export function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return "N/A";
  if (from && !to) return `${formatDate(from)} -> N/A`;
  if (!from && to) return `N/A -> ${formatDate(to)}`;
  return `${formatDate(from)} -> ${formatDate(to)}`;
}
