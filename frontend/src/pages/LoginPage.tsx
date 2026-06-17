import { FormEvent, useState, type CSSProperties } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Brand from "../components/Brand";

type LocationState = { from?: string } | null;

export default function LoginPage() {
  const { state, login } = useAuth();
  const location = useLocation();
  const from = (location.state as LocationState)?.from;
  const redirectTo = from && from !== "/login" ? from : "/candidats";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  if (state.status === "authenticated") {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div style={layout}>
      <div style={card}>
        <div style={brandRow}>
          <Brand asLink={false} size="lg" />
        </div>
        <h1 style={{ marginTop: 0, marginBottom: "0.25rem", fontSize: "1.35rem" }}>Connexion</h1>
        <p style={{ color: "#475569", marginTop: 0 }}>
          Gestion des candidatures — authentification
        </p>
        <form onSubmit={handleSubmit}>
          <label style={label}>
            Nom d&apos;utilisateur
            <input
              style={input}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label style={label}>
            Mot de passe
            <input
              style={input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? (
            <p role="alert" style={{ color: "#b91c1c", margin: "0 0 0.75rem" }}>
              {error}
            </p>
          ) : null}
          <button type="submit" style={buttonPrimary} disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

const layout: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
};

const brandRow: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "1.5rem",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: "400px",
  background: "#fff",
  borderRadius: "12px",
  padding: "2rem",
  boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginBottom: "1rem",
  fontWeight: 600,
  fontSize: "0.9rem",
};

const input: CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "1rem",
};

const buttonPrimary: CSSProperties = {
  width: "100%",
  padding: "0.65rem 1rem",
  borderRadius: "8px",
  border: "none",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 600,
  fontSize: "1rem",
  cursor: "pointer",
};
