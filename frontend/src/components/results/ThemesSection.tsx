import type { AnalyzeTheme } from "../../types/analyze";

type ThemesSectionProps = {
  themes: AnalyzeTheme[];
};

export default function ThemesSection({ themes }: ThemesSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Themes</h2>
      <p className="mt-1 text-sm text-slate-400">
        Topic clusters grounded in commit subjects.
      </p>
      {themes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No themes generated.</p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {themes.map((theme) => (
            <article
              key={theme.theme}
              className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                {theme.theme}
              </h3>
              <ul className="mt-3 space-y-2">
                {theme.evidenceSubjects.map((subject) => (
                  <li key={subject} className="text-sm text-slate-300">
                    • {subject}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
