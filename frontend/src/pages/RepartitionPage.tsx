import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import {
  exportRepartitionDocx,
  exportRepartitionPdf,
  type RepartitionExportContext,
} from "../utils/repartitionExport";

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

function formatPct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function KpiCard({ label, value, hint, accent }: { label: string; value: number | string; hint: string; accent: string }) {
  return (
    <div style={kpiCard}>
      <div style={{ ...kpiAccent, background: accent }} aria-hidden="true" />
      <span style={kpiValue}>{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</span>
      <span style={kpiLabel}>{label}</span>
      <span style={kpiHint}>{hint}</span>
    </div>
  );
}

function RunCard({
  run,
  readOnly,
  deleting,
  onView,
  onDelete,
}: {
  run: RepartitionRunSummary;
  readOnly: boolean;
  deleting: boolean;
  onView: () => void;
  onDelete: () => void;
}) {
  const pct = formatPct(run.totalAffectes, run.totalCandidats);

  return (
    <article style={runCard}>
      <div style={runCardTop}>
        <div style={runCardTitleBlock}>
          <span style={runIdBadge}>#{run.id}</span>
          <span style={statutBadgeStyle(run.statut)}>{STATUT_LABEL[run.statut] ?? run.statut}</span>
        </div>
        <span style={runDate}>{formatDate(run.demarreLe)}</span>
      </div>

      <div style={runMetaRow}>
        <span style={runMetaItem}>
          Par <strong>{run.declenchePar}</strong>
        </span>
      </div>

      <div style={progressSection}>
        <div style={progressHeader}>
          <span style={progressLabel}>Taux d&apos;affectation</span>
          <span style={progressPct}>
            {run.totalAffectes}/{run.totalCandidats} ({pct}%)
          </span>
        </div>
        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${pct}%` }} />
        </div>
      </div>

      <div style={runStatsRow}>
        <span style={runStatChip}>👥 {run.totalCandidats} candidats</span>
        <span style={runStatChipOk}>✓ {run.totalAffectes} affectés</span>
        {run.totalAlertes > 0 ? (
          <span style={runStatChipWarn}>⚠ {run.totalAlertes} alerte{run.totalAlertes !== 1 ? "s" : ""}</span>
        ) : (
          <span style={runStatChipMuted}>Aucune alerte</span>
        )}
      </div>

      <div style={runActions}>
        <button type="button" style={btnView} onClick={onView}>
          Voir la synthèse
        </button>
        {!readOnly ? (
          <button type="button" style={btnDelete} onClick={onDelete} disabled={deleting}>
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div style={runGrid} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} style={skeletonCard}>
          <div style={{ ...skeletonLine, width: "30%", height: "1rem" }} />
          <div style={{ ...skeletonLine, width: "70%", marginTop: "0.75rem" }} />
          <div style={{ ...skeletonLine, width: "100%", height: "0.5rem", marginTop: "1rem" }} />
          <div style={{ ...skeletonLine, width: "50%", marginTop: "0.75rem" }} />
        </div>
      ))}
    </div>
  );
}

function DetailStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={detailStatCard}>
      <div style={{ ...detailStatAccent, background: accent }} aria-hidden="true" />
      <span style={detailStatValue}>{value.toLocaleString("fr-FR")}</span>
      <span style={detailStatLabel}>{label}</span>
    </div>
  );
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
  const [filterCentre, setFilterCentre] = useState("");
  const [filterConcours, setFilterConcours] = useState("");
  const [exportBusy, setExportBusy] = useState<string | null>(null);

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

  useEffect(() => {
    setFilterCentre("");
    setFilterConcours("");
  }, [detail?.id]);

  const stats = useMemo(() => {
    const items = runs ?? [];
    const latest = items[0] ?? null;
    const totalAlertes = items.reduce((sum, r) => sum + r.totalAlertes, 0);
    const successCount = items.filter((r) => r.statut === "TERMINEE").length;
    const latestPct = latest ? formatPct(latest.totalAffectes, latest.totalCandidats) : 0;
    return { totalRuns: items.length, latest, totalAlertes, successCount, latestPct };
  }, [runs]);

  const centresDisponibles = useMemo(() => {
    if (!detail) return [];
    const seen = new Map<number, string>();
    for (const af of detail.affectations) {
      if (af.idCentre == null) continue;
      if (!seen.has(af.idCentre)) {
        seen.set(af.idCentre, af.nomCentre || `Centre ${af.idCentre}`);
      }
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [detail]);

  const concoursDisponibles = useMemo(() => {
    if (!detail) return [];
    const seen = new Map<string, string>();
    for (const af of detail.affectations) {
      const numero = af.numeroConcours;
      if (!numero) continue;
      if (!seen.has(numero)) {
        seen.set(numero, af.nomConcours || numero);
      }
    }
    return Array.from(seen.entries())
      .map(([numero, label]) => ({ numero, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [detail]);

  const filteredAffectations = useMemo(() => {
    if (!detail) return [];
    return detail.affectations.filter((af) => {
      if (filterCentre && String(af.idCentre ?? "") !== filterCentre) {
        return false;
      }
      if (filterConcours && af.numeroConcours !== filterConcours) {
        return false;
      }
      return true;
    });
  }, [detail, filterCentre, filterConcours]);

  const hasActiveFilters = filterCentre !== "" || filterConcours !== "";

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
        "Réinitialiser la répartition ? L'affectation (centre, établissement, salle, place) de tous les candidats sera effacée. Aucune répartition ne sera plus active.",
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
    if (!window.confirm(`Supprimer l'exécution #${id} de l'historique ? Cette action est définitive.`)) {
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

  function resetAffectationFilters() {
    setFilterCentre("");
    setFilterConcours("");
  }

  function buildFilterDescription(): string | null {
    if (!hasActiveFilters) return null;
    const parts: string[] = [];
    if (filterCentre) {
      const centre = centresDisponibles.find((c) => String(c.id) === filterCentre);
      parts.push(`Centre : ${centre?.label ?? filterCentre}`);
    }
    if (filterConcours) {
      const concours = concoursDisponibles.find((c) => c.numero === filterConcours);
      parts.push(`Concours : ${concours?.label ?? filterConcours}`);
    }
    return parts.join(" · ");
  }

  async function handleExport(format: "pdf" | "docx", scope: "filtered" | "all") {
    if (!detail) return;
    const affectations = scope === "all" ? detail.affectations : filteredAffectations;
    if (affectations.length === 0) {
      setActionError("Aucune affectation à exporter.");
      return;
    }
    const busyKey = `${format}-${scope}`;
    setExportBusy(busyKey);
    setActionError(null);
    try {
      const ctx: RepartitionExportContext = {
        runId: detail.id,
        statutLabel: STATUT_LABEL[detail.statut] ?? detail.statut,
        declenchePar: detail.declenchePar,
        demarreLe: formatDate(detail.demarreLe),
        termineLe: formatDate(detail.termineLe),
        totalCandidats: detail.totalCandidats,
        totalAffectes: detail.totalAffectes,
        totalAlertes: detail.totalAlertes,
        message: detail.message,
        affectations,
        scopeLabel: scope === "filtered" ? "Sélection filtrée" : "Toutes les affectations",
        filterDescription: scope === "filtered" ? buildFilterDescription() : null,
      };
      if (format === "pdf") {
        await exportRepartitionPdf(ctx);
      } else {
        await exportRepartitionDocx(ctx);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Échec de l'export.");
    } finally {
      setExportBusy(null);
    }
  }

  const detailPct = detail ? formatPct(detail.totalAffectes, detail.totalCandidats) : 0;

  return (
    <div style={page}>
      <AppHeader />

      <main style={main}>
        <div style={hero}>
          <div>
            <h1 style={h1}>Répartition</h1>
          </div>
          <div style={heroActions}>
            <button type="button" style={btnGhost} onClick={() => void loadRuns()} disabled={loading || running || resetting}>
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
            {!readOnly ? (
              <>
                <button
                  type="button"
                  style={btnReset}
                  onClick={() => void handleReset()}
                  disabled={running || resetting}
                  title="Effacer l'affectation de tous les candidats"
                >
                  {resetting ? "Réinitialisation…" : "Réinitialiser"}
                </button>
                <button type="button" style={btnPrimary} onClick={() => void handleRun()} disabled={running || resetting}>
                  {running ? "Répartition en cours…" : "Lancer la répartition"}
                </button>
              </>
            ) : null}
          </div>
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

        {!loading && !error && runs ? (
          <section style={kpiGrid}>
            <KpiCard label="Exécutions" value={stats.totalRuns} hint="dans l'historique" accent="#2563eb" />
            <KpiCard
              label="Dernière exécution"
              value={stats.latest ? stats.latestPct : "—"}
              hint={stats.latest ? `${stats.latest.totalAffectes}/${stats.latest.totalCandidats} affectés (%)` : "aucune exécution"}
              accent="#059669"
            />
            <KpiCard label="Alertes totales" value={stats.totalAlertes} hint="sur toutes les exécutions" accent="#d97706" />
            <KpiCard label="Sans alerte" value={stats.successCount} hint="exécutions terminées" accent="#7c3aed" />
          </section>
        ) : null}

        <section style={section}>
          <div style={sectionHead}>
            <h2 style={h2}>Historique des exécutions</h2>
            {runs && runs.length > 0 ? (
              <span style={sectionCount}>{runs.length} exécution{runs.length !== 1 ? "s" : ""}</span>
            ) : null}
          </div>

          {loading ? <LoadingSkeleton /> : null}

          {!loading && error ? (
            <div style={errorState}>
              <span style={errorIcon} aria-hidden="true">
                ⚠
              </span>
              <p role="alert" style={errorText}>
                {error}
              </p>
              <button type="button" style={btnGhost} onClick={() => void loadRuns()}>
                Réessayer
              </button>
            </div>
          ) : null}

          {!loading && !error && runs && runs.length === 0 ? (
            <div style={emptyState}>
              <span style={emptyIcon} aria-hidden="true">
                🔄
              </span>
              <h3 style={emptyTitle}>Aucune répartition exécutée</h3>
              <p style={emptyDesc}>
                Lancez une première répartition pour affecter automatiquement les candidats aux salles disponibles.
              </p>
              {!readOnly ? (
                <button type="button" style={btnPrimary} onClick={() => void handleRun()} disabled={running}>
                  {running ? "Répartition en cours…" : "Lancer la répartition"}
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && runs && runs.length > 0 ? (
            <div style={runGrid}>
              {runs.map((r) => (
                <RunCard
                  key={r.id}
                  run={r}
                  readOnly={readOnly}
                  deleting={deletingId === r.id}
                  onView={() => void openDetail(r.id)}
                  onDelete={() => void handleDeleteRun(r.id)}
                />
              ))}
            </div>
          ) : null}
        </section>

        {detailLoading ? (
          <div style={modalBackdrop} role="presentation">
            <div style={modalLoading} role="dialog" aria-modal="true" aria-busy="true">
              <div style={spinner} aria-hidden="true" />
              <p style={muted}>Chargement de la synthèse…</p>
            </div>
          </div>
        ) : null}

        {detail ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={closeDetail}>
            <div style={modal} role="dialog" aria-modal="true" onMouseDown={(ev) => ev.stopPropagation()}>
              <div style={modalHeader}>
                <div>
                  <div style={modalTitleRow}>
                    <h2 style={modalTitle}>Synthèse · exécution #{detail.id}</h2>
                    <span style={statutBadgeStyle(detail.statut)}>
                      {STATUT_LABEL[detail.statut] ?? detail.statut}
                    </span>
                  </div>
                  <p style={modalSubtitle}>
                    Déclenché par <strong>{detail.declenchePar}</strong> · {formatDate(detail.demarreLe)} →{" "}
                    {formatDate(detail.termineLe)}
                  </p>
                </div>
                <button type="button" style={closeBtn} onClick={closeDetail} aria-label="Fermer">
                  ×
                </button>
              </div>

              <div style={detailStatGrid}>
                <DetailStat label="Candidats" value={detail.totalCandidats} accent="#2563eb" />
                <DetailStat label="Affectés" value={detail.totalAffectes} accent="#059669" />
                <DetailStat label="Alertes" value={detail.totalAlertes} accent="#d97706" />
              </div>

              <div style={detailProgress}>
                <div style={progressHeader}>
                  <span style={progressLabel}>Taux d&apos;affectation global</span>
                  <span style={progressPct}>{detailPct}%</span>
                </div>
                <div style={progressTrackLarge}>
                  <div style={{ ...progressFillLarge, width: `${detailPct}%` }} />
                </div>
              </div>

              {detail.message ? (
                <div style={messageBox}>
                  <span style={messageIcon} aria-hidden="true">
                    ℹ
                  </span>
                  <p style={messageText}>{detail.message}</p>
                </div>
              ) : null}

              {detail.alertes.length > 0 ? (
                <div style={detailSection}>
                  <h3 style={h3}>
                    Alertes <span style={sectionBadge}>{detail.alertes.length}</span>
                  </h3>
                  <div style={alerteList}>
                    {detail.alertes.map((a, i) => (
                      <div key={i} style={alerteItem}>
                        <span style={alerteTypeBadge}>{ALERTE_LABEL[a.type] ?? a.type}</span>
                        <div style={alerteContent}>
                          <span style={alerteCandidat}>{a.candidatNom || "Candidat inconnu"}</span>
                          <span style={alerteMeta}>
                            {[a.ville, a.nomConcours].filter(Boolean).join(" · ") || "—"}
                          </span>
                          {a.message ? <span style={alerteMessage}>{a.message}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={detailSection}>
                <h3 style={h3}>
                  Affectations{" "}
                  <span style={sectionBadge}>
                    {hasActiveFilters
                      ? `${filteredAffectations.length} / ${detail.affectations.length}`
                      : detail.affectations.length}
                  </span>
                </h3>

                {detail.affectations.length === 0 ? (
                  <p style={muted}>Aucune affectation pour cette exécution.</p>
                ) : (
                  <>
                    <div style={filterBar}>
                      <label style={filterField}>
                        <span style={filterLabel}>Centre</span>
                        <select
                          style={filterInput}
                          value={filterCentre}
                          onChange={(e) => setFilterCentre(e.target.value)}
                          aria-label="Filtrer par centre"
                        >
                          <option value="">Tous les centres</option>
                          {centresDisponibles.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={filterField}>
                        <span style={filterLabel}>Concours</span>
                        <select
                          style={filterInput}
                          value={filterConcours}
                          onChange={(e) => setFilterConcours(e.target.value)}
                          aria-label="Filtrer par concours"
                        >
                          <option value="">Tous les concours</option>
                          {concoursDisponibles.map((co) => (
                            <option key={co.numero} value={co.numero}>
                              {co.label}
                              {co.numero ? ` (${co.numero})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {hasActiveFilters ? (
                        <button type="button" style={btnClearFilters} onClick={resetAffectationFilters}>
                          Effacer les filtres
                        </button>
                      ) : null}
                    </div>

                    <div style={exportBar}>
                      <div style={exportGroup}>
                        <span style={exportLabel}>
                          {hasActiveFilters ? "Exporter la sélection :" : "Exporter :"}
                        </span>
                        <button
                          type="button"
                          style={btnExport}
                          disabled={filteredAffectations.length === 0 || exportBusy !== null}
                          onClick={() => void handleExport("docx", hasActiveFilters ? "filtered" : "all")}
                        >
                          {exportBusy === `docx-${hasActiveFilters ? "filtered" : "all"}` ? "Export…" : "Word"}
                        </button>
                        <button
                          type="button"
                          style={btnExport}
                          disabled={filteredAffectations.length === 0 || exportBusy !== null}
                          onClick={() => void handleExport("pdf", hasActiveFilters ? "filtered" : "all")}
                        >
                          {exportBusy === `pdf-${hasActiveFilters ? "filtered" : "all"}` ? "Export…" : "PDF"}
                        </button>
                      </div>
                      {hasActiveFilters ? (
                        <div style={exportGroup}>
                          <span style={exportLabelMuted}>Toutes les affectations :</span>
                          <button
                            type="button"
                            style={btnExport}
                            disabled={exportBusy !== null}
                            onClick={() => void handleExport("docx", "all")}
                          >
                            {exportBusy === "docx-all" ? "Export…" : "Word"}
                          </button>
                          <button
                            type="button"
                            style={btnExport}
                            disabled={exportBusy !== null}
                            onClick={() => void handleExport("pdf", "all")}
                          >
                            {exportBusy === "pdf-all" ? "Export…" : "PDF"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {filteredAffectations.length === 0 ? (
                      <p style={muted}>Aucune affectation ne correspond aux filtres sélectionnés.</p>
                    ) : (
                      <div style={tableCard}>
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
                              {filteredAffectations.map((af) => (
                                <tr key={af.numeroInscription} style={tableRow}>
                                  <td style={td}>
                                    <span style={tdPrimary}>{af.candidatNom}</span>
                                  </td>
                                  <td style={td}>{af.ville || "—"}</td>
                                  <td style={td}>{af.nomConcours || "—"}</td>
                                  <td style={td}>{af.nomCentre || "—"}</td>
                                  <td style={td}>{af.nomEtablissement || "—"}</td>
                                  <td style={td}>{af.nomSalle || "—"}</td>
                                  <td style={td}>
                                    {af.numeroPlace != null ? (
                                      <span style={placeBadge}>{af.numeroPlace}</span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

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

const page: CSSProperties = { minHeight: "100vh", background: "#f8fafc" };

const main: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "2rem 1.5rem 3rem",
};

const hero: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

const h1: CSSProperties = {
  margin: 0,
  fontSize: "1.75rem",
  color: "#0f172a",
  fontWeight: 800,
};

const heroActions: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center",
};

const btnGhost: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
  color: "#334155",
};

const btnPrimary: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
  boxShadow: "0 1px 3px rgba(37,99,235,0.35)",
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

const kpiGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
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

const kpiValue: CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.1,
};

const kpiLabel: CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "#334155",
};

const kpiHint: CSSProperties = {
  fontSize: "0.72rem",
  color: "#94a3b8",
  marginTop: "0.15rem",
};

const section: CSSProperties = {
  padding: "1.25rem",
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
};

const sectionHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "1rem",
  flexWrap: "wrap",
};

const h2: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const sectionCount: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#64748b",
  background: "#f1f5f9",
  padding: "0.15rem 0.55rem",
  borderRadius: "999px",
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

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const muted: CSSProperties = { color: "#64748b", margin: 0 };

const runGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: "1rem",
};

const runCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "1.15rem",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
};

const runCardTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const runCardTitleBlock: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const runIdBadge: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 800,
  color: "#475569",
  fontFamily: "ui-monospace, monospace",
  background: "#f1f5f9",
  padding: "0.15rem 0.5rem",
  borderRadius: "6px",
};

const runDate: CSSProperties = {
  fontSize: "0.72rem",
  color: "#94a3b8",
  whiteSpace: "nowrap",
};

const runMetaRow: CSSProperties = {
  fontSize: "0.8125rem",
  color: "#64748b",
};

const runMetaItem: CSSProperties = {
  color: "#64748b",
};

const progressSection: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const progressHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.5rem",
};

const progressLabel: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const progressPct: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#334155",
};

const progressTrack: CSSProperties = {
  height: "6px",
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

const runStatsRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
};

const runStatChip: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#475569",
  background: "#f1f5f9",
  padding: "0.2rem 0.5rem",
  borderRadius: "999px",
};

const runStatChipOk: CSSProperties = {
  ...runStatChip,
  color: "#047857",
  background: "#ecfdf5",
};

const runStatChipWarn: CSSProperties = {
  ...runStatChip,
  color: "#b45309",
  background: "#fffbeb",
};

const runStatChipMuted: CSSProperties = {
  ...runStatChip,
  color: "#94a3b8",
};

const runActions: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "auto",
  paddingTop: "0.5rem",
  borderTop: "1px solid #f1f5f9",
};

const btnView: CSSProperties = {
  flex: 1,
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const btnDelete: CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "0.15rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const emptyState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "3rem 1.5rem",
  gap: "0.5rem",
};

const emptyIcon: CSSProperties = {
  fontSize: "2.5rem",
  marginBottom: "0.25rem",
};

const emptyTitle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  fontWeight: 700,
  color: "#0f172a",
};

const emptyDesc: CSSProperties = {
  margin: "0 0 0.75rem",
  color: "#64748b",
  fontSize: "0.9rem",
  maxWidth: "28rem",
};

const errorState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "2.5rem 1.5rem",
  gap: "0.75rem",
};

const errorIcon: CSSProperties = {
  fontSize: "2rem",
};

const errorText: CSSProperties = {
  margin: 0,
  color: "#b91c1c",
  fontSize: "0.9rem",
  maxWidth: "32rem",
};

const skeletonCard: CSSProperties = {
  padding: "1.15rem",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const skeletonLine: CSSProperties = {
  height: "0.75rem",
  borderRadius: "6px",
  background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.2s infinite",
};

const modalBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.5)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 50,
};

const modalLoading: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "2rem 2.5rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1rem",
  boxShadow: "0 25px 50px rgba(15,23,42,0.2)",
};

const spinner: CSSProperties = {
  width: "2rem",
  height: "2rem",
  border: "3px solid #e2e8f0",
  borderTopColor: "#2563eb",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

const modal: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  maxWidth: "960px",
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 25px 50px rgba(15,23,42,0.2)",
};

const modalHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "1.5rem 1.5rem 0",
};

const modalTitleRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const modalTitle: CSSProperties = {
  margin: 0,
  fontSize: "1.2rem",
  fontWeight: 800,
  color: "#0f172a",
};

const modalSubtitle: CSSProperties = {
  margin: "0.35rem 0 0",
  fontSize: "0.8125rem",
  color: "#64748b",
};

const closeBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#64748b",
  cursor: "pointer",
  fontSize: "1.25rem",
  lineHeight: 1,
  flexShrink: 0,
};

const detailStatGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "0.75rem",
  padding: "1.25rem 1.5rem 0",
};

const detailStatCard: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.15rem",
  padding: "0.85rem 0.75rem",
  background: "#f8fafc",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  overflow: "hidden",
};

const detailStatAccent: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
};

const detailStatValue: CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 800,
  color: "#0f172a",
};

const detailStatLabel: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#64748b",
};

const detailProgress: CSSProperties = {
  padding: "1rem 1.5rem 0",
};

const progressTrackLarge: CSSProperties = {
  height: "10px",
  background: "#e2e8f0",
  borderRadius: "999px",
  overflow: "hidden",
  marginTop: "0.35rem",
};

const progressFillLarge: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #059669 0%, #34d399 100%)",
  borderRadius: "999px",
  transition: "width 0.4s ease",
};

const messageBox: CSSProperties = {
  display: "flex",
  gap: "0.65rem",
  alignItems: "flex-start",
  margin: "1rem 1.5rem 0",
  padding: "0.75rem 1rem",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "10px",
};

const messageIcon: CSSProperties = {
  fontSize: "1rem",
  color: "#2563eb",
  flexShrink: 0,
};

const messageText: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#1e40af",
};

const detailSection: CSSProperties = {
  padding: "1.25rem 1.5rem 0",
};

const h3: CSSProperties = {
  margin: "0 0 0.75rem",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#0f172a",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const sectionBadge: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#64748b",
  background: "#f1f5f9",
  padding: "0.1rem 0.45rem",
  borderRadius: "999px",
};

const alerteList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const alerteItem: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-start",
  padding: "0.75rem",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: "10px",
};

const alerteTypeBadge: CSSProperties = {
  flexShrink: 0,
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#b45309",
  background: "#fef3c7",
  padding: "0.2rem 0.5rem",
  borderRadius: "6px",
  whiteSpace: "nowrap",
};

const alerteContent: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  minWidth: 0,
};

const alerteCandidat: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#92400e",
};

const alerteMeta: CSSProperties = {
  fontSize: "0.75rem",
  color: "#b45309",
};

const alerteMessage: CSSProperties = {
  fontSize: "0.75rem",
  color: "#92400e",
  marginTop: "0.15rem",
};

const filterBar: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "0.75rem 1rem",
  marginBottom: "0.75rem",
  padding: "0.85rem 1rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
};

const filterField: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  flex: "1 1 180px",
  minWidth: "160px",
};

const filterLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const filterInput: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
  background: "#fff",
};

const btnClearFilters: CSSProperties = {
  padding: "0.5rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  flexShrink: 0,
  alignSelf: "flex-end",
};

const exportBar: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem 1.25rem",
  marginBottom: "0.75rem",
  padding: "0.75rem 1rem",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "10px",
};

const exportGroup: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
};

const exportLabel: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#1e40af",
};

const exportLabelMuted: CSSProperties = {
  ...exportLabel,
  color: "#64748b",
};

const btnExport: CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #93c5fd",
  background: "#fff",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const tableCard: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  overflow: "hidden",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const tableRow: CSSProperties = {
  transition: "background 0.1s ease",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.65rem 0.75rem",
  borderBottom: "2px solid #e2e8f0",
  color: "#475569",
  fontWeight: 700,
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  background: "#f8fafc",
};

const td: CSSProperties = {
  padding: "0.55rem 0.75rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  color: "#334155",
};

const tdPrimary: CSSProperties = {
  fontWeight: 600,
  color: "#0f172a",
};

const placeBadge: CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#047857",
  background: "#ecfdf5",
  padding: "0.1rem 0.45rem",
  borderRadius: "999px",
  border: "1px solid #a7f3d0",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  padding: "1.25rem 1.5rem 1.5rem",
  marginTop: "0.5rem",
  borderTop: "1px solid #f1f5f9",
};
