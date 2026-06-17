import type { CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Brand from "./Brand";

type NavItem = { to: string; label: string };

const BASE_NAV: NavItem[] = [
  { to: "/candidats", label: "Candidats" },
  { to: "/concours", label: "Concours" },
  { to: "/lieux", label: "Lieux" },
  { to: "/repartition", label: "Répartition" },
];

export default function AppHeader() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";
  const roleLabel = user.role === "ADMINISTRATEUR" ? "Administrateur" : "Gestionnaire";
  const initial = (user.username?.[0] ?? "?").toUpperCase();

  const items: NavItem[] = readOnly
    ? [...BASE_NAV, { to: "/gestionnaires", label: "Gestionnaires" }]
    : BASE_NAV;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header style={header}>
      <div style={headerInner}>
        <div style={left}>
          <Brand />
          <span style={divider} aria-hidden="true" />
          <nav style={nav}>
            {items.map((item) => {
              const active =
                location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <Link key={item.to} to={item.to} style={active ? tabActive : tab}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={right}>
          <div style={userChip}>
            <span style={avatar} aria-hidden="true">
              {initial}
            </span>
            <span style={userText}>
              <span style={userName}>{user.username}</span>
              <span style={readOnly ? roleBadgeMuted : roleBadge}>
                {roleLabel}
                {readOnly ? " · lecture seule" : ""}
              </span>
            </span>
          </div>
          <button type="button" style={logoutBtn} onClick={handleLogout} title="Se déconnecter">
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}

const header: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 40,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(8px)",
  borderBottom: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
};

const headerInner: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "0.85rem 1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
};

const left: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
};

const divider: CSSProperties = {
  width: "1px",
  height: "1.6rem",
  background: "#e2e8f0",
};

const nav: CSSProperties = {
  display: "flex",
  gap: "0.25rem",
  alignItems: "center",
  background: "#f1f5f9",
  padding: "0.25rem",
  borderRadius: "10px",
};

const tab: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.4rem 0.85rem",
  borderRadius: "8px",
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "#64748b",
  textDecoration: "none",
  transition: "all 0.15s ease",
};

const tabActive: CSSProperties = {
  ...tab,
  color: "#1d4ed8",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(15,23,42,0.10)",
};

const right: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
};

const userChip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.3rem 0.75rem 0.3rem 0.35rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "999px",
};

const avatar: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.85rem",
};

const userText: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  lineHeight: 1.15,
};

const userName: CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "#0f172a",
};

const roleBadge: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#0f766e",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const roleBadgeMuted: CSSProperties = {
  ...roleBadge,
  color: "#94a3b8",
};

const logoutBtn: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.85rem",
};
