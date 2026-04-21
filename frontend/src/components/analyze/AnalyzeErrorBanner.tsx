type AnalyzeErrorBannerProps = {
  message: string | null;
};

export default function AnalyzeErrorBanner({
  message,
}: AnalyzeErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4">
      <p className="text-sm font-medium text-red-300">Analysis failed</p>
      <p className="mt-1 text-sm text-red-200">{message}</p>
    </div>
  );
}
