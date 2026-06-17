import axios from "axios";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  createGestionnaire,
  deleteGestionnaire,
  fetchGestionnaires,
  updateGestionnaire,
  type GestionnaireCreatePayload,
  type GestionnaireDto,
  type GestionnaireUpdatePayload,
} from "../api/gestionnairesApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

function apiMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.status === 403) {
    return "Accès réservé à l’administrateur.";
  }
  if (
    axios.isAxiosError(err) &&
    err.response?.data &&
    typeof err.response.data === "object" &&
    "message" in err.response.data &&
    typeof err.response.data.message === "string"
  ) {
    return err.response.data.message;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function GestionnairesPage() {
  const { state } = useAuth();
  const [list, setList] = useState<GestionnaireDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [actif, setActif] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGestionnaires();
      setList(data);
    } catch (e) {
      setList(null);
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setError("Délai dépassé : redémarrez auth-service (8081) et la gateway (8080), puis rechargez la page.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setError("Impossible de joindre auth-service (port 8081 ou proxy Vite).");
      } else {
        setError(apiMessage(e, "Erreur de chargement."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;

  if (user.role !== "ADMINISTRATEUR") {
    return <Navigate to="/candidats" replace />;
  }

  function openCreate() {
    setActionError(null);
    setEditingId(null);
    setUsername("");
    setPassword("");
    setActif(true);
    setFormOpen(true);
  }

  function openEdit(g: GestionnaireDto) {
    setActionError(null);
    setEditingId(g.id);
    setUsername(g.username);
    setPassword("");
    setActif(g.actif);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setSaving(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);

    const nom = username.trim();
    if (!nom) {
      setActionError("Indiquez un nom d’utilisateur.");
      setSaving(false);
      return;
    }
    if (nom.length < 3) {
      setActionError("Le nom d’utilisateur doit contenir au moins 3 caractères.");
      setSaving(false);
      return;
    }
    if (editingId == null && password.length < 8) {
      setActionError("Le mot de passe doit contenir au moins 8 caractères.");
      setSaving(false);
      return;
    }
    if (editingId != null && password.trim() && password.length < 8) {
      setActionError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      setSaving(false);
      return;
    }

    try {
      if (editingId == null) {
        const payload: GestionnaireCreatePayload = { username: nom, password };
        await createGestionnaire(payload);
      } else {
        const payload: GestionnaireUpdatePayload = { username: nom, actif };
        if (password.trim()) {
          payload.password = password;
        }
        await updateGestionnaire(editingId, payload);
      }
      closeForm();
      await loadList();
    } catch (err) {
      setActionError(apiMessage(err, "Échec de l’enregistrement."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: GestionnaireDto) {
    if (!window.confirm(`Supprimer définitivement le gestionnaire « ${g.username} » ?`)) return;
    setActionError(null);
    try {
      await deleteGestionnaire(g.id);
      await loadList();
    } catch (err) {
      setActionError(apiMessage(err, "Échec de la suppression."));
    }
  }

  return (
    <div style={page}>
      <AppHeader />
      <main style={main}>
        <section style={section}>
          <div style={toolbar}>
            <h2 style={h2Inline}>Liste des gestionnaires</h2>
            <button type="button" style={btnPrimary} onClick={openCreate} disabled={loading}>
              Nouveau gestionnaire
            </button>
          </div>
          {actionError ? (
            <p role="alert" style={alert}>
              {actionError}
            </p>
          ) : null}
          {loading ? <p style={muted}>Chargement…</p> : null}
          {!loading && error ? (
            <p role="alert" style={alert}>
              {error}
            </p>
          ) : null}
          {!loading && !error && list && list.length === 0 ? (
            <p style={muted}>Aucun gestionnaire enregistré.</p>
          ) : null}
          {!loading && !error && list && list.length > 0 ? (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Nom d’utilisateur</th>
                    <th style={th}>Statut</th>
                    <th style={th}>Créé le</th>
                    <th style={thActions}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((g) => (
                    <tr key={g.id}>
                      <td style={td}>{g.username}</td>
                      <td style={td}>
                        <span style={g.actif ? badgeActive : badgeInactive}>
                          {g.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td style={td}>{new Date(g.creeLe).toLocaleString()}</td>
                      <td style={tdActions}>
                        <button type="button" style={btnLink} onClick={() => openEdit(g)}>
                          Modifier
                        </button>
                        <button type="button" style={btnDanger} onClick={() => void handleDelete(g)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {formOpen ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={closeForm}>
            <div
              style={modal}
              role="dialog"
              aria-modal="true"
              onMouseDown={(ev) => ev.stopPropagation()}
            >
              <h2 style={modalTitle}>
                {editingId == null ? "Nouveau gestionnaire" : "Modifier le gestionnaire"}
              </h2>
              <form onSubmit={(e) => void handleSubmit(e)}>
                <div style={formGrid}>
                  <label style={{ ...label, gridColumn: "1 / -1" }}>
                    Nom d’utilisateur
                    <input
                      style={input}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      minLength={3}
                      maxLength={100}
                      autoComplete="off"
                    />
                  </label>
                  <label style={{ ...label, gridColumn: "1 / -1" }}>
                    {editingId == null ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour conserver)"}
                    <input
                      style={input}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required={editingId == null}
                      minLength={8}
                      maxLength={100}
                      autoComplete="new-password"
                      placeholder={editingId == null ? "" : "••••••••"}
                    />
                  </label>
                  {editingId != null ? (
                    <label style={{ ...checkboxLabel, gridColumn: "1 / -1" }}>
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={(e) => setActif(e.target.checked)}
                      />
                      Compte actif (peut se connecter)
                    </label>
                  ) : null}
                </div>
                <p style={hint}>
                  Le rôle est fixé à GESTIONNAIRE. Le mot de passe doit contenir au moins 8 caractères.
                </p>
                <div style={modalActions}>
                  <button type="button" style={btnGhost} onClick={closeForm}>
                    Annuler
                  </button>
                  <button type="submit" style={btnPrimary} disabled={saving}>
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

const page: CSSProperties = { minHeight: "100vh", background: "#f8fafc" };

const btnGhost: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const btnPrimary: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const main: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "2rem 1.5rem",
};

const section: CSSProperties = {
  marginTop: "1.5rem",
  padding: "1.25rem",
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
};

const toolbar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
};

const h2Inline: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
};

const muted: CSSProperties = {
  color: "#64748b",
  margin: 0,
};

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
  marginTop: "0.5rem",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.4rem",
  borderBottom: "2px solid #e2e8f0",
  color: "#475569",
  fontWeight: 600,
};

const thActions: CSSProperties = {
  ...th,
  textAlign: "right",
  minWidth: "140px",
};

const td: CSSProperties = {
  padding: "0.45rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const tdActions: CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const btnLink: CSSProperties = {
  border: "none",
  background: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  marginRight: "0.5rem",
};

const btnDanger: CSSProperties = {
  border: "none",
  background: "none",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const badgeActive: CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.5rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#166534",
  background: "#dcfce7",
};

const badgeInactive: CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.5rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#9f1239",
  background: "#ffe4e6",
};

const modalBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 50,
};

const modal: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  padding: "1.5rem",
  maxWidth: "640px",
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 40px rgba(15,23,42,0.15)",
};

const modalTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: "1rem",
  fontSize: "1.15rem",
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem 1rem",
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const checkboxLabel: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const input: CSSProperties = {
  padding: "0.45rem 0.55rem",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  marginTop: "1.25rem",
};

const hint: CSSProperties = {
  margin: "1rem 0 0.5rem",
  fontSize: "0.8rem",
  color: "#64748b",
};
