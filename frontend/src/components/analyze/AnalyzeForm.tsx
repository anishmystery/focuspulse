import { useState } from "react";
import type {
  AnalyzeErrorResponse,
  AnalyzeSuccessResponse,
} from "../../types/analyze";
import { runAnalyze } from "../../api/analyzeApi";
import { getAnalyzeErrorMessage } from "../../utils/getAnalyzeErrorMessage";
import { sampleGitLog } from "../../constants/sampleGitLog";

type AnalyzeFormProps = {
  onSuccess: (result: AnalyzeSuccessResponse) => void;
  onError: (message: string | null) => void;
};

export default function AnalyzeForm({ onSuccess, onError }: AnalyzeFormProps) {
  const [text, setText] = useState("");
  const [focusAuthor, setFocusAuthor] = useState("");
  const [debug, setDebug] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    onError(null);

    try {
      const result = await runAnalyze({
        text,
        focusAuthor: focusAuthor.trim() || undefined,
        debug,
        source: "git-log",
      });

      onSuccess(result);
    } catch (error) {
      const message = getAnalyzeErrorMessage(error as AnalyzeErrorResponse);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUseSample() {
    setText(sampleGitLog);
    setFocusAuthor("John Doe");
    onError(null);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-sm"
    >
      <div>
        <label
          htmlFor="gitlog"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Git log input
        </label>
        <textarea
          id="gitlog"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste git log output here..."
          rows={14}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-slate-500"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="focusAuthor"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Focus author
          </label>
          <input
            id="focusAuthor"
            type="text"
            value={focusAuthor}
            onChange={(e) => setFocusAuthor(e.target.value)}
            placeholder="Optional unless multiple authors exist"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-slate-500"
          ></input>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            ></input>
            Include debug info
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting || text.trim().length === 0}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Analyzing..." : "Run analysis"}
        </button>
        <button
          type="button"
          onClick={handleUseSample}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Use sample
        </button>
      </div>
    </form>
  );
}
