import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { fetchCandidats, isCandidatAffecte, type CandidatDto } from "../api/candidatsApi";
import { fetchConcours, type ConcoursDto } from "../api/concoursApi";
import { fetchConvocations, fetchEnvois, type EnvoiHistorique } from "../api/convocationsApi";
import { fetchCentres, fetchSallesByConcours, type CentreListItemDto, type SalleAvecLieuxDto } from "../api/lieuxApi";
import { fetchRun, fetchRuns, type AlerteDto, type RepartitionRunSummary } from "../api/repartitionApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

const ALERTE_LABEL: Record<string, string> = {
  CAPACITE_DEPASSEE: "Capacité dépassée",
  AUCUN_CENTRE_DISPONIBLE: "Aucun centre disponible",
  CONCOURS_INCONNU: "Concours inconnu",
  VILLE_NON_GEOLOCALISEE: "Ville non géolocalisée",
};

const STATUT_LABEL: Record<string, string> = {
  TERMINEE: "Terminée",
  TERMINEE_AVEC_ALERTES: "Terminée avec alertes",
  ECHEC: "Échec",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatPct(value: number, total: number): string {
  if (total === 0) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

type ConcoursStats = {
  numeroConcours: string;
  nomConcours: string;
  dateHeureExamen: string;
  candidats: number;
  affectes: number;
  capacite: number;
};

function computeConcoursStats(
  concours: ConcoursDto[],
  candidats: CandidatDto[],
  sallesByConcours: Map<string, SalleAvecLieuxDto[]>,
): ConcoursStats[] {
  return concours.map((co) => {
    const forConcours = candidats.filter((c) => c.numeroConcours === co.numeroConcours);
    const salles = sallesByConcours.get(co.numeroConcours) ?? [];
    return {
      numeroConcours: co.numeroConcours,
      nomConcours: co.nomConcours,
      dateHeureExamen: co.dateHeureExamen,
      candidats: forConcours.length,
      affectes: forConcours.filter(isCandidatAffecte).length,
      capacite: salles.reduce((sum, s) => sum + s.nombrePlaces, 0),
    };
  });
}

function countAlertesByType(alertes: AlerteDto[]): { type: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of alertes) {
    map.set(a.type, (map.get(a.type) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export default function DashboardPage() {
  const { state } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidats, setCandidats] = useState<CandidatDto[]>([]);
  const [concours, setConcours] = useState<ConcoursDto[]>([]);
  const [centres, setCentres] = useState<CentreListItemDto[]>([]);
  const [runs, setRuns] = useState<RepartitionRunSummary[]>([]);
  const [convocationsCount, setConvocationsCount] = useState(0);
  const [envois, setEnvois] = useState<EnvoiHistorique[]>([]);
  const [sallesByConcours, setSallesByConcours] = useState<Map<string, SalleAvecLieuxDto[]>>(new Map());
  const [latestAlertes, setLatestAlertes] = useState<AlerteDto[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candidatsData, concoursData, centresData, runsData, convocationsData, envoisData] =
        await Promise.all([
          fetchCandidats(),
          fetchConcours(),
          fetchCentres(),
          fetchRuns(),
          fetchConvocations(),
          fetchEnvois(),
        ]);

      const sallesEntries: [string, SalleAvecLieuxDto[]][] = await Promise.all(
        concoursData.map(async (co) => {
          try {
            const salles = await fetchSallesByConcours(co.numeroConcours);
            return [co.numeroConcours, salles] as [string, SalleAvecLieuxDto[]];
          } catch {
            return [co.numeroConcours, []] as [string, SalleAvecLieuxDto[]];
          }
        }),
      );

      setCandidats(candidatsData);
      setConcours(concoursData);
      setCentres(centresData);
      setRuns(runsData);
      setConvocationsCount(convocationsData.length);
      setEnvois(envoisData);
      setSallesByConcours(new Map(sallesEntries));

      const latestRun = runsData[0] ?? null;
      if (latestRun && latestRun.totalAlertes > 0) {
        try {
          const detail = await fetchRun(latestRun.id);
          setLatestAlertes(detail.alertes);
        } catch {
          setLatestAlertes([]);
        }
      } else {
        setLatestAlertes([]);
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setError("Délai dépassé : vérifiez que les services backend sont démarrés, puis rechargez.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setError("Impossible de joindre le backend (gateway ou proxy Vite).");
      } else {
        setError(e instanceof Error ? e.message : "Erreur de chargement du tableau de bord.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const totalCandidats = candidats.length;
    const affectes = candidats.filter(isCandidatAffecte).length;
    const nonAffectes = totalCandidats - affectes;
    const totalEtablissements = centres.reduce((sum, c) => sum + c.nombreEtablissements, 0);
    const allSalles = [...sallesByConcours.values()].flat();
    const capaciteTotale = allSalles.reduce((sum, s) => sum + s.nombrePlaces, 0);
    const envoisOk = envois.filter((e) => e.statut === "ENVOYE").length;
    const envoisEchec = envois.filter((e) => e.statut === "ECHEC").length;
    const concoursStats = computeConcoursStats(concours, candidats, sallesByConcours);
    const latestRun = runs[0] ?? null;

    return {
      totalCandidats,
      affectes,
      nonAffectes,
      totalConcours: concours.length,
      totalCentres: centres.length,
      totalEtablissements,
      totalSalles: allSalles.length,
      capaciteTotale,
      convocationsCount,
      envoisOk,
      envoisEchec,
      concoursStats,
      latestRun,
    };
  }, [candidats, concours, centres, sallesByConcours, convocationsCount, envois, runs]);

  if (state.status !== "authenticated") {
    return null;
  }

  const alerteBreakdown = countAlertesByType(latestAlertes);
  const maxConcoursCandidats = Math.max(1, ...stats.concoursStats.map((c) => c.candidats));

  return (
    <div style={page}>
      <AppHeader />
      <main style={main}>
        <div style={hero}>
          <div>
            <h1 style={h1}>Tableau de bord</h1>
            <p style={subtitle}>Vue d&apos;ensemble de la plateforme concours — données en temps réel.</p>
          </div>
          <button type="button" style={btnGhost} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>

        {error && <p style={errorBanner}>{error}</p>}

        {loading && !error ? (
          <p style={muted}>Chargement des statistiques…</p>
        ) : (
          <>
            <section style={kpiGrid}>
              <KpiCard label="Candidats" value={stats.totalCandidats} hint="inscrits au total" accent="#2563eb" />
              <KpiCard
                label="Affectés"
                value={stats.affectes}
                hint={`${formatPct(stats.affectes, stats.totalCandidats)} · ${stats.nonAffectes} sans place`}
                accent="#059669"
              />
              <KpiCard label="Concours" value={stats.totalConcours} hint="compétitions planifiées" accent="#7c3aed" />
              <KpiCard
                label="Centres"
                value={stats.totalCentres}
                hint={`${stats.totalEtablissements} établ. · ${stats.totalSalles} salles`}
                accent="#0d9488"
              />
              <KpiCard
                label="Capacité"
                value={stats.capaciteTotale}
                hint="places disponibles (salles liées aux concours)"
                accent="#d97706"
              />
              <KpiCard
                label="Convocations"
                value={stats.convocationsCount}
                hint={`${stats.envoisOk} envoyées · ${stats.envoisEchec} échec(s)`}
                accent="#4f46e5"
              />
            </section>

            {stats.totalCandidats > 0 && (
              <section style={section}>
                <h2 style={h2}>Taux d&apos;affectation global</h2>
                <div style={progressTrack}>
                  <div
                    style={{
                      ...progressFill,
                      width: `${Math.round((stats.affectes / stats.totalCandidats) * 100)}%`,
                    }}
                  />
                </div>
                <p style={progressLegend}>
                  {stats.affectes} / {stats.totalCandidats} candidats avec centre, établissement, salle et place
                </p>
              </section>
            )}

            <div style={twoCol}>
              <section style={section}>
                <div style={sectionHead}>
                  <h2 style={h2}>Candidats par concours</h2>
                  <Link to="/candidats" style={link}>
                    Voir candidats →
                  </Link>
                </div>
                {stats.concoursStats.length === 0 ? (
                  <p style={muted}>Aucun concours enregistré.</p>
                ) : (
                  <div style={barList}>
                    {stats.concoursStats.map((co) => (
                      <div key={co.numeroConcours} style={barRow}>
                        <div style={barMeta}>
                          <span style={barTitle}>{co.nomConcours}</span>
                          <span style={barSub}>
                            {co.numeroConcours} · {formatDate(co.dateHeureExamen)}
                          </span>
                        </div>
                        <div style={barTrack}>
                          <div
                            style={{
                              ...barFillBlue,
                              width: `${Math.round((co.candidats / maxConcoursCandidats) * 100)}%`,
                            }}
                          />
                          <div
                            style={{
                              ...barFillGreen,
                              width: `${co.candidats > 0 ? Math.round((co.affectes / co.candidats) * (co.candidats / maxConcoursCandidats) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span style={barCount}>
                          {co.affectes}/{co.candidats} affectés · cap. {co.capacite}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={section}>
                <div style={sectionHead}>
                  <h2 style={h2}>Dernière répartition</h2>
                  <Link to="/repartition" style={link}>
                    Historique →
                  </Link>
                </div>
                {!stats.latestRun ? (
                  <p style={muted}>Aucune répartition exécutée pour le moment.</p>
                ) : (
                  <>
                    <div style={runSummary}>
                      <span style={statutBadge(stats.latestRun.statut)}>{STATUT_LABEL[stats.latestRun.statut] ?? stats.latestRun.statut}</span>
                      <span style={runMeta}>
                        {stats.latestRun.totalAffectes}/{stats.latestRun.totalCandidats} affectés
                        {stats.latestRun.totalAlertes > 0 ? ` · ${stats.latestRun.totalAlertes} alerte(s)` : ""}
                      </span>
                    </div>
                    <dl style={dl}>
                      <div style={dlRow}>
                        <dt style={dt}>Déclenchée par</dt>
                        <dd style={dd}>{stats.latestRun.declenchePar}</dd>
                      </div>
                      <div style={dlRow}>
                        <dt style={dt}>Démarrée le</dt>
                        <dd style={dd}>{formatDate(stats.latestRun.demarreLe)}</dd>
                      </div>
                      <div style={dlRow}>
                        <dt style={dt}>Terminée le</dt>
                        <dd style={dd}>{formatDate(stats.latestRun.termineLe)}</dd>
                      </div>
                      {stats.latestRun.message && (
                        <div style={dlRow}>
                          <dt style={dt}>Message</dt>
                          <dd style={{ ...dd, color: "#b91c1c" }}>{stats.latestRun.message}</dd>
                        </div>
                      )}
                    </dl>
                    {alerteBreakdown.length > 0 && (
                      <>
                        <h3 style={h3}>Alertes de la dernière exécution</h3>
                        <ul style={alertList}>
                          {alerteBreakdown.map(({ type, count }) => (
                            <li key={type} style={alertItem}>
                              <span>{ALERTE_LABEL[type] ?? type}</span>
                              <strong>{count}</strong>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>

            <section style={section}>
              <div style={sectionHead}>
                <h2 style={h2}>Convocations par e-mail</h2>
                <Link to="/convocations" style={link}>
                  Gérer convocations →
                </Link>
              </div>
              {envois.length === 0 ? (
                <p style={muted}>Aucun envoi enregistré.</p>
              ) : (
                <div style={envoiGrid}>
                  <div style={envoiCardOk}>
                    <span style={envoiValue}>{stats.envoisOk}</span>
                    <span style={envoiLabel}>Envoyées</span>
                  </div>
                  <div style={envoiCardFail}>
                    <span style={envoiValue}>{stats.envoisEchec}</span>
                    <span style={envoiLabel}>Échecs</span>
                  </div>
                  <div style={envoiCardReady}>
                    <span style={envoiValue}>{stats.convocationsCount}</span>
                    <span style={envoiLabel}>Prêtes à envoyer</span>
                  </div>
                </div>
              )}
            </section>

            <section style={shortcuts}>
              <h2 style={h2}>Accès rapide</h2>
              <div style={shortcutGrid}>
                <Shortcut to="/candidats" title="Candidats" desc="Import Excel, édition, affectations" />
                <Shortcut to="/concours" title="Concours" desc="Dates d'examen, centres assignés" />
                <Shortcut to="/lieux" title="Lieux" desc="Centres, établissements, salles" />
                <Shortcut to="/repartition" title="Répartition" desc="Allocation automatique des places" />
                <Shortcut to="/convocations" title="Convocations" desc="PDF et envoi par e-mail" />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent: string;
}) {
  return (
    <div style={kpiCard}>
      <div style={{ ...kpiAccent, background: accent }} aria-hidden="true" />
      <span style={kpiValue}>{value.toLocaleString("fr-FR")}</span>
      <span style={kpiLabel}>{label}</span>
      <span style={kpiHint}>{hint}</span>
    </div>
  );
}

function Shortcut({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} style={shortcutCard}>
      <span style={shortcutTitle}>{title}</span>
      <span style={shortcutDesc}>{desc}</span>
    </Link>
  );
}

function statutBadge(statut: string): CSSProperties {
  if (statut === "TERMINEE") {
    return { ...badge, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }
  if (statut === "TERMINEE_AVEC_ALERTES") {
    return { ...badge, background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" };
  }
  return { ...badge, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
}

const page: CSSProperties = { minHeight: "100vh", background: "#f8fafc" };

const main: CSSProperties = { maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem 3rem" };

const hero: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

const h1: CSSProperties = { margin: 0, fontSize: "1.75rem", color: "#0f172a", fontWeight: 800 };

const subtitle: CSSProperties = { margin: "0.35rem 0 0", color: "#64748b", fontSize: "0.95rem" };

const h2: CSSProperties = { margin: 0, fontSize: "1.1rem", color: "#0f172a" };

const h3: CSSProperties = { margin: "1rem 0 0.5rem", fontSize: "0.95rem", color: "#334155" };

const muted: CSSProperties = { color: "#64748b", margin: 0 };

const errorBanner: CSSProperties = {
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  marginBottom: "1rem",
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

const kpiGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: "1rem",
  marginBottom: "1.5rem",
};

const kpiCard: CSSProperties = {
  position: "relative",
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "1.1rem 1rem 1rem",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

const kpiAccent: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
};

const kpiValue: CSSProperties = { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 };

const kpiLabel: CSSProperties = { fontSize: "0.85rem", fontWeight: 700, color: "#334155" };

const kpiHint: CSSProperties = { fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.15rem" };

const section: CSSProperties = {
  padding: "1.25rem",
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  marginBottom: "1.5rem",
};

const twoCol: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "1.5rem",
  marginBottom: "0",
};

const sectionHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "1rem",
  flexWrap: "wrap",
};

const link: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#2563eb",
  textDecoration: "none",
};

const progressTrack: CSSProperties = {
  height: "10px",
  background: "#e2e8f0",
  borderRadius: "999px",
  overflow: "hidden",
};

const progressFill: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #059669 0%, #34d399 100%)",
  borderRadius: "999px",
  transition: "width 0.4s ease",
};

const progressLegend: CSSProperties = { margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "#64748b" };

const barList: CSSProperties = { display: "flex", flexDirection: "column", gap: "1rem" };

const barRow: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.35rem" };

const barMeta: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.1rem" };

const barTitle: CSSProperties = { fontSize: "0.875rem", fontWeight: 700, color: "#0f172a" };

const barSub: CSSProperties = { fontSize: "0.75rem", color: "#94a3b8" };

const barTrack: CSSProperties = {
  position: "relative",
  height: "8px",
  background: "#f1f5f9",
  borderRadius: "999px",
  overflow: "hidden",
};

const barFillBlue: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  height: "100%",
  background: "#93c5fd",
  borderRadius: "999px",
};

const barFillGreen: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  height: "100%",
  background: "#059669",
  borderRadius: "999px",
};

const barCount: CSSProperties = { fontSize: "0.75rem", color: "#64748b" };

const runSummary: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};

const runMeta: CSSProperties = { fontSize: "0.875rem", color: "#475569", fontWeight: 600 };

const badge: CSSProperties = {
  display: "inline-block",
  padding: "0.15rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
};

const dl: CSSProperties = { margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" };

const dlRow: CSSProperties = { display: "grid", gridTemplateColumns: "130px 1fr", gap: "0.5rem", fontSize: "0.8125rem" };

const dt: CSSProperties = { margin: 0, color: "#94a3b8", fontWeight: 600 };

const dd: CSSProperties = { margin: 0, color: "#334155" };

const alertList: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" };

const alertItem: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.4rem 0.6rem",
  background: "#fffbeb",
  borderRadius: "6px",
  fontSize: "0.8125rem",
  color: "#92400e",
};

const envoiGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "1rem",
};

const envoiCardOk: CSSProperties = {
  padding: "1rem",
  borderRadius: "10px",
  background: "#f0fdf4",
  border: "1px solid #86efac",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.25rem",
};

const envoiCardFail: CSSProperties = {
  ...envoiCardOk,
  background: "#fef2f2",
  border: "1px solid #fecaca",
};

const envoiCardReady: CSSProperties = {
  ...envoiCardOk,
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
};

const envoiValue: CSSProperties = { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" };

const envoiLabel: CSSProperties = { fontSize: "0.8rem", fontWeight: 600, color: "#64748b" };

const shortcuts: CSSProperties = { ...section, marginBottom: 0 };

const shortcutGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "0.75rem",
  marginTop: "1rem",
};

const shortcutCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  padding: "0.85rem 1rem",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  textDecoration: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const shortcutTitle: CSSProperties = { fontWeight: 700, fontSize: "0.9rem", color: "#1d4ed8" };

const shortcutDesc: CSSProperties = { fontSize: "0.75rem", color: "#64748b" };
