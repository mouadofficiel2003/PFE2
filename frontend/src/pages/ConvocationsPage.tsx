import axios from "axios";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  envoyerToutesConvocations,
  fetchConvocations,
  fetchConvocationPdf,
  fetchEnvois,
  reinitialiserHistoriqueEnvois,
  type Convocation,
  type EnvoiHistorique,
  type EnvoiResult,
} from "../api/convocationsApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

function formatDateHeure(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function statutBadgeStyle(statut: string): CSSProperties {
  if (statut === "ENVOYE") {
    return { ...badge, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }
  return { ...badge, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
}

export default function ConvocationsPage() {
  const { state } = useAuth();

  const [convocations, setConvocations] = useState<Convocation[] | null>(null);
  const [envois, setEnvois] = useState<EnvoiHistorique[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resettingHistorique, setResettingHistorique] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [result, setResult] = useState<EnvoiResult | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conv, hist] = await Promise.all([fetchConvocations(), fetchEnvois()]);
      setConvocations(conv);
      setEnvois(hist);
    } catch (e) {
      setConvocations(null);
      setEnvois(null);
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setError("Délai dépassé : vérifiez convocation-service (8086), puis rechargez la page.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setError("Impossible de joindre convocation-service (port 8086 ou proxy Vite).");
      } else {
        setError(e instanceof Error ? e.message : "Erreur de chargement.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";
  const sansEmail = (convocations ?? []).filter((c) => !c.email || c.email.trim() === "").length;

  async function handleEnvoyer() {
    const total = convocations?.length ?? 0;
    if (
      !window.confirm(
        `Envoyer les ${total} convocation(s) par e-mail aux candidats affectés ?` +
          (sansEmail > 0 ? `\n\n${sansEmail} candidat(s) sans adresse e-mail seront en échec.` : ""),
      )
    ) {
      return;
    }
    setSending(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await envoyerToutesConvocations();
      setResult(res);
      setActionInfo(
        `Envoi terminé : ${res.envoyes}/${res.total} convocation(s) envoyée(s)` +
          (res.echecs > 0 ? `, ${res.echecs} échec(s).` : "."),
      );
      await loadAll();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Envoi réservé au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.status === 503) {
        setActionError(
          "Service e-mail non configuré : définissez MAIL_USERNAME et MAIL_PASSWORD (mot de passe d’application Gmail).",
        );
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setActionError(
          "Aucune convocation à envoyer : aucun candidat n’est affecté (lancez d’abord la répartition).",
        );
      } else if (axios.isAxiosError(err) && err.response?.status === 502) {
        setActionError("Un service amont (candidat, concours ou lieux) est indisponible.");
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setActionError("Délai dépassé pendant l’envoi. Réessayez dans un instant.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l’envoi des convocations.");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleReinitialiserHistorique() {
    const total = envois?.length ?? 0;
    if (
      !window.confirm(
        total > 0
          ? `Supprimer l'historique des envois ? Les ${total} trace(s) d'envoi seront définitivement effacées.`
          : "Supprimer l'historique des envois ? Cette action est définitive.",
      )
    ) {
      return;
    }
    setResettingHistorique(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await reinitialiserHistoriqueEnvois();
      setEnvois([]);
      setActionInfo(
        res.supprimes > 0
          ? `Historique réinitialisé : ${res.supprimes} trace(s) d'envoi supprimée(s).`
          : "L'historique des envois était déjà vide.",
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Réinitialisation réservée au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setActionError("Délai dépassé pendant la réinitialisation. Réessayez dans un instant.");
      } else {
        setActionError(
          err instanceof Error ? err.message : "Échec de la réinitialisation de l'historique.",
        );
      }
    } finally {
      setResettingHistorique(false);
    }
  }

  async function handleVoirPdf(numeroInscription: string) {
    setPdfBusy(numeroInscription);
    setActionError(null);
    try {
      const blob = await fetchConvocationPdf(numeroInscription);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Libère l'URL après un court délai (le temps que l'onglet la charge).
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setActionError("Convocation introuvable pour ce candidat (non affecté ?).");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l’ouverture du PDF.");
      }
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div style={page}>
      <AppHeader />

      <main style={main}>
        <section style={section}>
          <div style={toolbar}>
            <h2 style={h2Inline}>
              Convocations prêtes{convocations ? ` (${convocations.length})` : ""}
            </h2>
            {!readOnly ? (
              <div style={toolbarActions}>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={() => void handleEnvoyer()}
                  disabled={sending || loading || (convocations?.length ?? 0) === 0}
                  title="Envoyer toutes les convocations aux candidats par e-mail"
                >
                  {sending ? "Envoi en cours…" : "Envoyer toutes les convocations"}
                </button>
              </div>
            ) : null}
          </div>

          <p style={muted}>
            Une convocation est générée pour chaque candidat affecté (centre, établissement, salle et
            place attribués lors de la répartition).
          </p>

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
          {!loading && sansEmail > 0 ? (
            <p role="alert" style={warnBanner}>
              {sansEmail} candidat(s) sans adresse e-mail : leur convocation ne pourra pas être envoyée.
            </p>
          ) : null}

          {loading ? <p style={muted}>Chargement…</p> : null}
          {!loading && error ? (
            <p role="alert" style={alert}>
              {error}
            </p>
          ) : null}
          {!loading && !error && convocations && convocations.length === 0 ? (
            <p style={muted}>
              Aucune convocation : aucun candidat n’est encore affecté. Lancez d’abord la répartition.
            </p>
          ) : null}

          {!loading && !error && convocations && convocations.length > 0 ? (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Candidat</th>
                    <th style={th}>N° inscription</th>
                    <th style={th}>Concours</th>
                    <th style={th}>Centre</th>
                    <th style={th}>Établissement</th>
                    <th style={th}>Salle</th>
                    <th style={th}>Date / heure</th>
                    <th style={th}>Place</th>
                    <th style={th}>E-mail</th>
                    <th style={thActions}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {convocations.map((c) => (
                    <tr key={c.numeroInscription}>
                      <td style={td}>{`${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "—"}</td>
                      <td style={td}>{c.numeroInscription}</td>
                      <td style={td}>
                        {c.nomConcours || "—"}
                        {c.numeroConcours ? <span style={subtle}> · {c.numeroConcours}</span> : null}
                      </td>
                      <td style={td}>{c.nomCentre || "—"}</td>
                      <td style={td}>{c.nomEtablissement || "—"}</td>
                      <td style={td}>{c.nomSalle || "—"}</td>
                      <td style={td}>{formatDateHeure(c.dateHeureExamen)}</td>
                      <td style={td}>{c.numeroPlace != null ? `N° ${c.numeroPlace}` : "—"}</td>
                      <td style={td}>
                        {c.email && c.email.trim() !== "" ? (
                          c.email
                        ) : (
                          <span style={emailManquant}>manquant</span>
                        )}
                      </td>
                      <td style={tdActions}>
                        <button
                          type="button"
                          style={btnLink}
                          onClick={() => void handleVoirPdf(c.numeroInscription)}
                          disabled={pdfBusy === c.numeroInscription}
                        >
                          {pdfBusy === c.numeroInscription ? "Ouverture…" : "PDF"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {!loading && !error ? (
          <section style={section}>
            <div style={toolbar}>
              <h2 style={h2Inline}>
                Historique des envois{envois ? ` (${envois.length})` : ""}
              </h2>
              {!readOnly ? (
                <div style={toolbarActions}>
                  <button
                    type="button"
                    style={btnReset}
                    onClick={() => void handleReinitialiserHistorique()}
                    disabled={resettingHistorique || sending || (envois?.length ?? 0) === 0}
                    title="Supprimer tout l'historique des envois de convocations"
                  >
                    {resettingHistorique
                      ? "Suppression…"
                      : "Réinitialiser l'historique des envois"}
                  </button>
                </div>
              ) : null}
            </div>

            {envois && envois.length > 0 ? (
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>Candidat</th>
                      <th style={th}>E-mail</th>
                      <th style={th}>Concours</th>
                      <th style={th}>Statut</th>
                      <th style={th}>Détail</th>
                      <th style={th}>Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envois.map((e) => (
                      <tr key={e.id}>
                        <td style={td}>{formatDateHeure(e.envoyeLe)}</td>
                        <td style={td}>{e.candidatNom || e.numeroInscription}</td>
                        <td style={td}>{e.email || "—"}</td>
                        <td style={td}>{e.nomConcours || "—"}</td>
                        <td style={td}>
                          <span style={statutBadgeStyle(e.statut)}>
                            {e.statut === "ENVOYE" ? "Envoyé" : "Échec"}
                          </span>
                        </td>
                        <td style={td}>{e.message || "—"}</td>
                        <td style={td}>{e.declenchePar || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={muted}>Aucun envoi enregistré pour le moment.</p>
            )}
          </section>
        ) : null}

        {result ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={() => setResult(null)}>
            <div style={modal} role="dialog" aria-modal="true" onMouseDown={(ev) => ev.stopPropagation()}>
              <div style={modalHead}>
                <h2 style={modalTitle}>Résultat de l’envoi</h2>
              </div>
              <div style={statGrid}>
                <Stat label="Total" value={result.total} />
                <Stat label="Envoyés" value={result.envoyes} />
                <Stat label="Échecs" value={result.echecs} />
              </div>

              {result.details.length > 0 ? (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Candidat</th>
                        <th style={th}>E-mail</th>
                        <th style={th}>Statut</th>
                        <th style={th}>Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((d) => (
                        <tr key={d.numeroInscription}>
                          <td style={td}>{d.candidatNom || d.numeroInscription}</td>
                          <td style={td}>{d.email || "—"}</td>
                          <td style={td}>
                            <span style={statutBadgeStyle(d.statut)}>
                              {d.statut === "ENVOYE" ? "Envoyé" : "Échec"}
                            </span>
                          </td>
                          <td style={td}>{d.message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={() => setResult(null)}>
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
  marginBottom: "0.5rem",
};

const toolbarActions: CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap" };

const h2Inline: CSSProperties = { margin: 0, fontSize: "1.1rem" };

const muted: CSSProperties = { color: "#64748b", margin: "0.25rem 0 1rem" };

const subtle: CSSProperties = { color: "#94a3b8", fontSize: "0.75rem" };

const emailManquant: CSSProperties = { color: "#b91c1c", fontWeight: 600 };

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

const btnGhost: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const btnLink: CSSProperties = {
  border: "none",
  background: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const alert: CSSProperties = {
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const warnBanner: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
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

const tableWrap: CSSProperties = { overflowX: "auto", marginTop: "0.5rem" };

const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" };

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.4rem",
  borderBottom: "2px solid #e2e8f0",
  color: "#475569",
  fontWeight: 600,
};

const thActions: CSSProperties = { ...th, textAlign: "right", minWidth: "90px" };

const td: CSSProperties = {
  padding: "0.45rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const tdActions: CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

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
  maxWidth: "820px",
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

const statGrid: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};

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
