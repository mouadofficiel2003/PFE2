import axios from "axios";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  declencherRepartition,
  fetchRun,
  fetchRuns,
  reinitialiserRepartition,
  supprimerRun,
  type RepartitionRunDetail,
  type RepartitionRunSummary,
  type RepartitionStatut,
} from "../api/repartitionApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

const STATUT_LABEL: Record<RepartitionStatut, string> = {
  TERMINEE: "Terminée",
  TERMINEE_AVEC_ALERTES: "Terminée avec alertes",
  ECHEC: "Échec",
};

const ALERTE_LABEL: Record<string, string> = {
  CAPACITE_DEPASSEE: "Capacité dépassée",
  AUCUN_CENTRE_DISPONIBLE: "Aucun centre disponible",
  CONCOURS_INCONNU: "Concours inconnu",
  VILLE_NON_GEOLOCALISEE: "Ville non géolocalisée",
};

function statutBadgeStyle(statut: RepartitionStatut): CSSProperties {
  if (statut === "TERMINEE") {
    return { ...badge, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }
  if (statut === "TERMINEE_AVEC_ALERTES") {
    return { ...badge, background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" };
  }
  return { ...badge, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function RepartitionPage() {
  const { state } = useAuth();

  const [runs, setRuns] = useState<RepartitionRunSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [detail, setDetail] = useState<RepartitionRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuns();
      setRuns(data);
    } catch (e) {
      setRuns(null);
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setError("Délai dépassé : vérifiez repartition-service (8085), puis rechargez la page.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setError("Impossible de joindre repartition-service (port 8085 ou proxy Vite).");
      } else {
        setError(e instanceof Error ? e.message : "Erreur de chargement.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";

  async function handleRun() {
    if (!window.confirm("Lancer une nouvelle répartition automatique de tous les candidats ?")) return;
    setRunning(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await declencherRepartition();
      setDetail(result);
      setActionInfo(
        `Répartition terminée : ${result.totalAffectes}/${result.totalCandidats} candidat(s) affecté(s)` +
          (result.totalAlertes > 0 ? `, ${result.totalAlertes} alerte(s).` : "."),
      );
      await loadRuns();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Déclenchement réservé au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.status === 502) {
        setActionError("Un service amont (concours, lieux ou candidat) est indisponible.");
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setActionError("Délai dépassé pendant la répartition. Réessayez dans un instant.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la répartition.");
      }
    } finally {
      setRunning(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Réinitialiser la répartition ? L’affectation (centre, établissement, salle, place) de tous les candidats sera effacée. Aucune répartition ne sera plus active.",
      )
    ) {
      return;
    }
    setResetting(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await reinitialiserRepartition();
      setDetail(null);
      setActionInfo(
        `Répartition réinitialisée : ${result.candidatsReinitialises} candidat(s) remis à zéro. Vous pouvez relancer une répartition.`,
      );
      await loadRuns();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Réinitialisation réservée au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.status === 502) {
        setActionError("Le service candidat est indisponible.");
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setActionError("Délai dépassé pendant la réinitialisation. Réessayez dans un instant.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la réinitialisation.");
      }
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteRun(id: number) {
    if (!window.confirm(`Supprimer l’exécution #${id} de l’historique ? Cette action est définitive.`)) {
      return;
    }
    setDeletingId(id);
    setActionError(null);
    setActionInfo(null);
    try {
      await supprimerRun(id);
      setRuns((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      setDetail((prev) => (prev && prev.id === id ? null : prev));
      setActionInfo(`Exécution #${id} supprimée.`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Suppression réservée au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.status === 404) {
        setActionError("Exécution introuvable (déjà supprimée ?).");
        await loadRuns();
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la suppression.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function openDetail(id: number) {
    setActionError(null);
    setDetailLoading(true);
    try {
      const data = await fetchRun(id);
      setDetail(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Échec du chargement de la synthèse.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
  }

  return (
    <div style={page}>
      <AppHeader />

      <main style={main}>
        <section style={section}>
          <div style={toolbar}>
            <h2 style={h2Inline}>Exécutions</h2>
            {!readOnly ? (
              <div style={toolbarActions}>
                <button
                  type="button"
                  style={btnReset}
                  onClick={() => void handleReset()}
                  disabled={running || resetting}
                  title="Effacer l’affectation de tous les candidats"
                >
                  {resetting ? "Réinitialisation…" : "Réinitialiser la répartition"}
                </button>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={() => void handleRun()}
                  disabled={running || resetting}
                >
                  {running ? "Répartition en cours…" : "Lancer la répartition"}
                </button>
              </div>
            ) : null}
          </div>

          {actionInfo ? (
            <p role="status" style={infoBanner}>
              {actionInfo}
            </p>
          ) : null}
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
          {!loading && !error && runs && runs.length === 0 ? (
            <p style={muted}>Aucune répartition n’a encore été exécutée.</p>
          ) : null}

          {!loading && !error && runs && runs.length > 0 ? (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Statut</th>
                    <th style={th}>Déclenché par</th>
                    <th style={th}>Candidats</th>
                    <th style={th}>Affectés</th>
                    <th style={th}>Alertes</th>
                    <th style={th}>Démarré</th>
                    <th style={thActions}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.id}</td>
                      <td style={td}>
                        <span style={statutBadgeStyle(r.statut)}>{STATUT_LABEL[r.statut] ?? r.statut}</span>
                      </td>
                      <td style={td}>{r.declenchePar}</td>
                      <td style={td}>{r.totalCandidats}</td>
                      <td style={td}>{r.totalAffectes}</td>
                      <td style={td}>{r.totalAlertes}</td>
                      <td style={td}>{formatDate(r.demarreLe)}</td>
                      <td style={tdActions}>
                        <button type="button" style={btnLink} onClick={() => void openDetail(r.id)}>
                          Voir
                        </button>
                        {!readOnly ? (
                          <button
                            type="button"
                            style={btnDeleteLink}
                            onClick={() => void handleDeleteRun(r.id)}
                            disabled={deletingId === r.id}
                          >
                            {deletingId === r.id ? "Suppression…" : "Supprimer"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {detailLoading ? (
          <div style={modalBackdrop} role="presentation">
            <div style={modal} role="dialog" aria-modal="true">
              <p style={muted}>Chargement de la synthèse…</p>
            </div>
          </div>
        ) : null}

        {detail ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={closeDetail}>
            <div style={modal} role="dialog" aria-modal="true" onMouseDown={(ev) => ev.stopPropagation()}>
              <div style={modalHead}>
                <h2 style={modalTitle}>Synthèse de l’exécution #{detail.id}</h2>
                <span style={statutBadgeStyle(detail.statut)}>
                  {STATUT_LABEL[detail.statut] ?? detail.statut}
                </span>
              </div>

              <div style={statGrid}>
                <Stat label="Candidats" value={detail.totalCandidats} />
                <Stat label="Affectés" value={detail.totalAffectes} />
                <Stat label="Alertes" value={detail.totalAlertes} />
              </div>
              <p style={metaLine}>
                Déclenché par <strong>{detail.declenchePar}</strong> · {formatDate(detail.demarreLe)} →{" "}
                {formatDate(detail.termineLe)}
              </p>
              {detail.message ? <p style={metaLine}>{detail.message}</p> : null}

              {detail.alertes.length > 0 ? (
                <>
                  <h3 style={h3}>Alertes ({detail.alertes.length})</h3>
                  <div style={tableWrap}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Type</th>
                          <th style={th}>Candidat</th>
                          <th style={th}>Ville</th>
                          <th style={th}>Concours</th>
                          <th style={th}>Détail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.alertes.map((a, i) => (
                          <tr key={i}>
                            <td style={td}>{ALERTE_LABEL[a.type] ?? a.type}</td>
                            <td style={td}>{a.candidatNom || "—"}</td>
                            <td style={td}>{a.ville || "—"}</td>
                            <td style={td}>{a.nomConcours || "—"}</td>
                            <td style={td}>{a.message || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <h3 style={h3}>Affectations ({detail.affectations.length})</h3>
              {detail.affectations.length === 0 ? (
                <p style={muted}>Aucune affectation pour cette exécution.</p>
              ) : (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Candidat</th>
                        <th style={th}>Ville</th>
                        <th style={th}>Concours</th>
                        <th style={th}>Centre</th>
                        <th style={th}>Établissement</th>
                        <th style={th}>Salle</th>
                        <th style={th}>Place</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.affectations.map((af) => (
                        <tr key={af.numeroInscription}>
                          <td style={td}>{af.candidatNom}</td>
                          <td style={td}>{af.ville || "—"}</td>
                          <td style={td}>{af.nomConcours || "—"}</td>
                          <td style={td}>{af.nomCentre || "—"}</td>
                          <td style={td}>{af.nomEtablissement || "—"}</td>
                          <td style={td}>{af.nomSalle || "—"}</td>
                          <td style={td}>{af.numeroPlace ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={closeDetail}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statCard}>
      <span style={statValue}>{value}</span>
      <span style={statLabel}>{label}</span>
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

const main: CSSProperties = { maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" };

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

const h2Inline: CSSProperties = { margin: 0, fontSize: "1.1rem" };

const h3: CSSProperties = { margin: "1.25rem 0 0.5rem", fontSize: "1rem", color: "#0f172a" };

const muted: CSSProperties = { color: "#64748b", margin: 0 };

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const tableWrap: CSSProperties = { overflowX: "auto", marginTop: "0.5rem" };

const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" };

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.4rem",
  borderBottom: "2px solid #e2e8f0",
  color: "#475569",
  fontWeight: 600,
};

const thActions: CSSProperties = { ...th, textAlign: "right", minWidth: "160px" };

const td: CSSProperties = {
  padding: "0.45rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const tdActions: CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

const btnLink: CSSProperties = {
  border: "none",
  background: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const btnDeleteLink: CSSProperties = {
  border: "none",
  background: "none",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  marginLeft: "0.75rem",
};

const toolbarActions: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const btnReset: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const infoBanner: CSSProperties = {
  color: "#166534",
  background: "#f0fdf4",
  border: "1px solid #86efac",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
  fontSize: "0.9rem",
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.5rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
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
  maxWidth: "920px",
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 40px rgba(15,23,42,0.15)",
};

const modalHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  marginBottom: "1rem",
};

const modalTitle: CSSProperties = { margin: 0, fontSize: "1.15rem" };

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  marginTop: "1.25rem",
};

const metaLine: CSSProperties = { margin: "0.25rem 0", fontSize: "0.85rem", color: "#475569" };

const statGrid: CSSProperties = { display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" };

const statCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  minWidth: "90px",
  padding: "0.6rem 1rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
};

const statValue: CSSProperties = { fontSize: "1.35rem", fontWeight: 700, color: "#0f172a" };

const statLabel: CSSProperties = { fontSize: "0.75rem", color: "#64748b" };
