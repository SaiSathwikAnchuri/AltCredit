import type { ReactNode } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Brand } from "./UserLayout";

const I = (d: string): ReactNode => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICON = {
  dash: I("M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"),
  people: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"),
  send: I("M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"),
  inbox: I("M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"),
  chart: I("M3 3v18h18M7 15l4-4 3 3 5-6"),
  gear: I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"),
};

const LENDER_NAV = [
  ["/lender", "Overview", true, ICON.dash],
  ["/lender/candidates", "Candidates", false, ICON.people],
  ["/lender/applications", "Applications", false, ICON.inbox],
  ["/lender/offers", "Sent offers", false, ICON.send],
  ["/lender/analytics", "Portfolio analytics", false, ICON.chart],
] as const;

const ADMIN_NAV = [
  ["/admin", "Platform", true, ICON.gear],
  ["/admin/candidates", "Applicants", false, ICON.people],
  ["/admin/analytics", "Analytics", false, ICON.chart],
] as const;

export default function LenderLayout({ role }: { role: "lender" | "admin" }) {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={session.role === "user" ? "/app" : session.role === "lender" ? "/lender" : "/admin"} replace />;
  const items = role === "lender" ? LENDER_NAV : ADMIN_NAV;
  return (
    <div className="shell theme-lender">
      <aside className="sidebar">
        <Brand sub={role === "lender" ? "Lender" : "Admin"} />
        <div className="nav-label">Workspace</div>
        {items.map(([to, label, end, icon]) => (
          <NavLink key={to} to={to} end={end}>
            {icon}
            {label}
          </NavLink>
        ))}
        <div className="foot">
          <span className="avatar" style={{ background: "rgba(96,165,250,.18)", color: "#bfdbfe" }}>{(session.display_name || "?").charAt(0).toUpperCase()}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{session.username}</span>
        </div>
      </aside>
      <div className="shell-main">
        <div className="shell-top">
          <span className="inst">{session.display_name}</span>
          <button className="btn btn-sm" onClick={() => { logout(); nav("/login"); }}>
            Sign out
          </button>
        </div>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
