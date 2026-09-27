import { NavLink, Navigate, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { ErrorBox, Loading } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import type { Profile } from "../types";

export interface UserCtx {
  profile: Profile;
  userId: string;
  reload: () => Promise<void>;
  setProfile: (p: Profile) => void;
}

export const useUser = () => useOutletContext<UserCtx>();

const NAV = [
  ["/app", "Home", true],
  ["/app/score", "My score", false],
  ["/app/what-if", "What-If", false],
  ["/app/target", "Goal planner", false],
  ["/app/products", "Products", false],
  ["/app/offers", "Offers", false],
  ["/app/applications", "Applications", false],
  ["/app/report", "Report", false],
] as const;

export function Brand({ sub }: { sub?: string }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 32 32">
          <path d="M8 23l8-15 8 15" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      AltCredit{sub && <small>{sub}</small>}
    </span>
  );
}

export default function UserLayout() {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const uid = session?.role === "user" ? session.user_id : null;
  const { data, error, loading, reload, setData } = useApi<Profile>(uid ? `/api/users/${uid}/score` : null);
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== "user" || !uid) return <Navigate to={session.role === "lender" ? "/lender" : "/admin"} replace />;
  return (
    <div className="theme-user">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/app" onClick={(e) => { e.preventDefault(); nav("/app"); }} style={{ textDecoration: "none" }}>
            <Brand />
          </a>
          <nav className="nav" aria-label="Main">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="user-chip">
            <NavLink to="/app/profile" title="Profile and data" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)", fontWeight: 600 }}>
              <span className="avatar">{(session.display_name || "?").trim().charAt(0).toUpperCase()}</span>
              <span className="hide-sm">{session.display_name}</span>
            </NavLink>
            <button className="btn btn-sm" onClick={() => { logout(); nav("/login"); }}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data && <Loading label="Computing your policy score…" />}
        {data && <Outlet context={{ profile: data, userId: uid, reload, setProfile: setData } satisfies UserCtx} />}
      </main>
    </div>
  );
}
