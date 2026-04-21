import { NavLink } from "react-router-dom";

const linkBase =
  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkInactive = "text-slate-300 hover:bg-slate-800 hover:text-white";
const linkActive = "bg-slate-800 text-white";

export default function Sidebar() {
  return (
    <aside className="w-64 border-r border-slate-800 px-4 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">FocusPulse</h1>
        <p className="mt-1 text-sm text-slate-400">
          Developer productivity insights
        </p>
      </div>

      <nav className="space-y-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkInactive}`
          }
        >
          Analyze
        </NavLink>

        <NavLink
          to="/history"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkInactive}`
          }
        >
          History
        </NavLink>

        <NavLink
          to="/trends"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkInactive}`
          }
        >
          Trends
        </NavLink>
      </nav>
    </aside>
  );
}
