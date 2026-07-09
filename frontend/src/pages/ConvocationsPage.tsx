import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
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
import {
  exportConvocationsDocx,
  exportConvocationsPdf,
  type ConvocationsExportContext,
} from "../utils/convocationsExport";

function formatDateHeure(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatExamShort(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function statutBadgeStyle(statut: string): CSSProperties {
  if (statut === "ENVOYE") {
    return { ...badge, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }
  return { ...badge, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
}

function KpiCard({ label, value, hint, accent }: { label: string; value: number; hint: string; accent: string }) {
  return (
    <div style={kpiCard}>
      <div style={{ ...kpiAccent, background: accent }} aria-hidden="true" />
      <span style={kpiValue}>{value.toLocaleString("fr-FR")}</span>
      <span style={kpiLabel}>{label}</span>
      <span style={kpiHint}>{hint}</span>
    </div>
  );
}

function ConvocationCard({
  convocation,
  pdfBusy,
  onViewPdf,
}: {
  convocation: Convocation;
  pdfBusy: boolean;
  onViewPdf: () => void;
}) {
  const name = `${convocation.prenom ?? ""} ${convocation.nom ?? ""}`.trim() || "—";
  const hasEmail = Boolean(convocation.email?.trim());
  const { date, time } = formatExamShort(convocation.dateHeureExamen);

  return (
    <article style={convCard}>
      <div style={convCardTop}>
        <div style={convNameBlock}>
          <h3 style={convName}>{name}</h3>
          <span style={inscriptionBadge}>{convocation.numeroInscription}</span>
        </div>
        {hasEmail ? (
          <span style={emailOkBadge}>✉ E-mail OK</span>
        ) : (
          <span style={emailMissingBadge}>⚠ Sans e-mail</span>
        )}
      </div>

      <div style={convConcoursRow}>
        <span style={concoursChip}>{convocation.nomConcours || "—"}</span>
        {convocation.numeroConcours ? (
          <span style={numeroChip}>{convocation.numeroConcours}</span>
        ) : null}
      </div>

      <div style={convLocationGrid}>
        <div style={locItem}>
          <span style={locLabel}>Centre</span>
          <span style={locValue}>{convocation.nomCentre || "—"}</span>
        </div>
        <div style={locItem}>
          <span style={locLabel}>Établissement</span>
          <span style={locValue}>{convocation.nomEtablissement || "—"}</span>
        </div>
        <div style={locItem}>
          <span style={locLabel}>Salle</span>
          <span style={locValue}>{convocation.nomSalle || "—"}</span>
        </div>
        <div style={locItem}>
          <span style={locLabel}>Place</span>
          <span style={locValue}>
            {convocation.numeroPlace != null ? (
              <span style={placeBadge}>N° {convocation.numeroPlace}</span>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      <div style={convDateRow}>
        <span style={dateIcon} aria-hidden="true">
          📅
        </span>
        <div>
          <span style={dateLine}>{date}</span>
          {time ? <span style={timeLine}>{time}</span> : null}
        </div>
      </div>

      {hasEmail ? (
        <span style={emailLine} title={convocation.email ?? undefined}>
          {convocation.email}
        </span>
      ) : null}

      <button type="button" style={btnPdf} onClick={onViewPdf} disabled={pdfBusy}>
        {pdfBusy ? "Ouverture…" : "📄 Voir le PDF"}
      </button>
    </article>
  );
}

function EnvoiCard({ envoi }: { envoi: EnvoiHistorique }) {
  return (
    <article style={envoiCard}>
      <div style={envoiTop}>
        <div>
          <span style={envoiCandidat}>{envoi.candidatNom || envoi.numeroInscription}</span>
          <span style={envoiDate}>{formatDateHeure(envoi.envoyeLe)}</span>
        </div>
        <span style={statutBadgeStyle(envoi.statut)}>
          {envoi.statut === "ENVOYE" ? "Envoyé" : "Échec"}
        </span>
      </div>
      <div style={envoiMeta}>
        {envoi.email ? <span style={envoiEmail}>{envoi.email}</span> : null}
        {envoi.nomConcours ? <span style={envoiConcours}>{envoi.nomConcours}</span> : null}
      </div>
      {envoi.message ? <p style={envoiMessage}>{envoi.message}</p> : null}
      {envoi.declenchePar ? (
        <span style={envoiPar}>Par {envoi.declenchePar}</span>
      ) : null}
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div style={convGrid} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={skeletonCard}>
          <div style={{ ...skeletonLine, width: "55%", height: "1rem" }} />
          <div style={{ ...skeletonLine, width: "40%", marginTop: "0.65rem" }} />
          <div style={{ ...skeletonLine, width: "100%", marginTop: "0.85rem" }} />
          <div style={{ ...skeletonLine, width: "70%", marginTop: "0.5rem" }} />
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
  const [filterCentre, setFilterCentre] = useState("");
  const [filterConcours, setFilterConcours] = useState("");
  const [exportBusy, setExportBusy] = useState<string | null>(null);

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

  const centresDisponibles = useMemo(() => {
    if (!convocations) return [];
    const seen = new Map<string, string>();
    for (const c of convocations) {
      const trimmed = c.nomCentre?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "fr"));
  }, [convocations]);

  const concoursDisponibles = useMemo(() => {
    if (!convocations) return [];
    const seen = new Map<string, string>();
    for (const c of convocations) {
      const numero = c.numeroConcours;
      if (!numero) continue;
      if (!seen.has(numero)) {
        seen.set(numero, c.nomConcours || numero);
      }
    }
    return Array.from(seen.entries())
      .map(([numero, label]) => ({ numero, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [convocations]);

  const filteredConvocations = useMemo(() => {
    if (!convocations) return [];
    return convocations.filter((c) => {
      if (filterCentre && c.nomCentre?.trim().toLowerCase() !== filterCentre.toLowerCase()) {
        return false;
      }
      if (filterConcours && c.numeroConcours !== filterConcours) {
        return false;
      }
      return true;
    });
  }, [convocations, filterCentre, filterConcours]);

  const stats = useMemo(() => {
    const items = convocations ?? [];
    const avecEmail = items.filter((c) => c.email?.trim()).length;
    const sansEmail = items.length - avecEmail;
    const hist = envois ?? [];
    const envoisOk = hist.filter((e) => e.statut === "ENVOYE").length;
    const envoisEchec = hist.filter((e) => e.statut === "ECHEC").length;
    return {
      total: items.length,
      avecEmail,
      sansEmail,
      envoisOk,
      envoisEchec,
    };
  }, [convocations, envois]);

  const hasActiveFilters = filterCentre !== "" || filterConcours !== "";

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";

  async function handleEnvoyer() {
    const total = convocations?.length ?? 0;
    if (
      !window.confirm(
        `Envoyer les ${total} convocation(s) par e-mail aux candidats affectés ?` +
          (stats.sansEmail > 0 ? `\n\n${stats.sansEmail} candidat(s) sans adresse e-mail seront en échec.` : ""),
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
          "Service e-mail non configuré : définissez MAIL_USERNAME et MAIL_PASSWORD (mot de passe d'application Gmail).",
        );
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setActionError(
          "Aucune convocation à envoyer : aucun candidat n'est affecté (lancez d'abord la répartition).",
        );
      } else if (axios.isAxiosError(err) && err.response?.status === 502) {
        setActionError("Un service amont (candidat, concours ou lieux) est indisponible.");
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setActionError("Délai dépassé pendant l'envoi. Réessayez dans un instant.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l'envoi des convocations.");
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
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setActionError("Convocation introuvable pour ce candidat (non affecté ?).");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l'ouverture du PDF.");
      }
    } finally {
      setPdfBusy(null);
    }
  }

  function resetFilters() {
    setFilterCentre("");
    setFilterConcours("");
  }

  function buildFilterDescription(): string | null {
    if (!hasActiveFilters) return null;
    const parts: string[] = [];
    if (filterCentre) {
      parts.push(`Centre : ${filterCentre}`);
    }
    if (filterConcours) {
      const concours = concoursDisponibles.find((c) => c.numero === filterConcours);
      parts.push(`Concours : ${concours?.label ?? filterConcours}`);
    }
    return parts.join(" · ");
  }

  async function handleExport(format: "pdf" | "docx", scope: "filtered" | "all") {
    if (!convocations) return;
    const list = scope === "all" ? convocations : filteredConvocations;
    if (list.length === 0) {
      setActionError("Aucune convocation à exporter.");
      return;
    }
    const busyKey = `${format}-${scope}`;
    setExportBusy(busyKey);
    setActionError(null);
    try {
      const ctx: ConvocationsExportContext = {
        convocations: list,
        totalCount: convocations.length,
        scopeLabel: scope === "filtered" ? "Sélection filtrée" : "Toutes les convocations",
        filterDescription: scope === "filtered" ? buildFilterDescription() : null,
        exportedAt: new Date().toLocaleString(),
        formatDateHeure,
      };
      if (format === "pdf") {
        await exportConvocationsPdf(ctx);
      } else {
        await exportConvocationsDocx(ctx);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Échec de l'export.");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div style={page}>
      <AppHeader />

      <main style={main}>
        <div style={hero}>
          <div>
            <h1 style={h1}>Convocations</h1>
          </div>
          <div style={heroActions}>
            <button type="button" style={btnGhost} onClick={() => void loadAll()} disabled={loading || sending}>
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
            {!readOnly ? (
              <button
                type="button"
                style={btnPrimary}
                onClick={() => void handleEnvoyer()}
                disabled={sending || loading || (convocations?.length ?? 0) === 0}
                title="Envoyer toutes les convocations aux candidats par e-mail"
              >
                {sending ? "Envoi en cours…" : "Envoyer toutes les convocations"}
              </button>
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
        {!loading && stats.sansEmail > 0 ? (
          <p role="alert" style={warnBanner}>
            {stats.sansEmail} candidat(s) sans adresse e-mail : leur convocation ne pourra pas être envoyée.
          </p>
        ) : null}

        {!loading && !error && convocations ? (
          <section style={kpiGrid}>
            <KpiCard label="Convocations prêtes" value={stats.total} hint="candidats affectés" accent="#4f46e5" />
            <KpiCard label="Avec e-mail" value={stats.avecEmail} hint="envoi possible" accent="#059669" />
            <KpiCard label="Sans e-mail" value={stats.sansEmail} hint="envoi impossible" accent="#dc2626" />
            <KpiCard
              label="Envois réussis"
              value={stats.envoisOk}
              hint={stats.envoisEchec > 0 ? `${stats.envoisEchec} échec(s)` : "dans l'historique"}
              accent="#2563eb"
            />
          </section>
        ) : null}

        <section style={section}>
          <div style={sectionHead}>
            <h2 style={h2}>
              Convocations prêtes
              {convocations
                ? hasActiveFilters
                  ? ` (${filteredConvocations.length} / ${convocations.length})`
                  : ` (${convocations.length})`
                : ""}
            </h2>
          </div>

          <p style={sectionDesc}>
            Une convocation est générée pour chaque candidat affecté (centre, établissement, salle et place
            attribués lors de la répartition).
          </p>

          {loading ? <LoadingSkeleton /> : null}

          {!loading && error ? (
            <div style={errorState}>
              <span style={errorIcon} aria-hidden="true">
                ⚠
              </span>
              <p role="alert" style={errorText}>
                {error}
              </p>
              <button type="button" style={btnGhost} onClick={() => void loadAll()}>
                Réessayer
              </button>
            </div>
          ) : null}

          {!loading && !error && convocations && convocations.length === 0 ? (
            <div style={emptyState}>
              <span style={emptyIcon} aria-hidden="true">
                ✉️
              </span>
              <h3 style={emptyTitle}>Aucune convocation disponible</h3>
              <p style={emptyDesc}>
                Aucun candidat n&apos;est encore affecté. Lancez d&apos;abord une répartition pour générer les
                convocations.
              </p>
              <Link to="/repartition" style={btnPrimaryLink}>
                Aller à la répartition
              </Link>
            </div>
          ) : null}

          {!loading && !error && convocations && convocations.length > 0 ? (
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
                    {centresDisponibles.map((centre) => (
                      <option key={centre} value={centre}>
                        {centre}
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
                  <button type="button" style={btnClearFilters} onClick={resetFilters}>
                    Effacer les filtres
                  </button>
                ) : null}
              </div>

              <div style={exportBar}>
                <div style={exportGroup}>
                  <span style={exportLabel}>
                    {hasActiveFilters ? "Exporter la sélection :" : "Exporter la liste :"}
                  </span>
                  <button
                    type="button"
                    style={btnExport}
                    disabled={filteredConvocations.length === 0 || exportBusy !== null}
                    onClick={() => void handleExport("docx", hasActiveFilters ? "filtered" : "all")}
                  >
                    {exportBusy === `docx-${hasActiveFilters ? "filtered" : "all"}` ? "Export…" : "Word"}
                  </button>
                  <button
                    type="button"
                    style={btnExport}
                    disabled={filteredConvocations.length === 0 || exportBusy !== null}
                    onClick={() => void handleExport("pdf", hasActiveFilters ? "filtered" : "all")}
                  >
                    {exportBusy === `pdf-${hasActiveFilters ? "filtered" : "all"}` ? "Export…" : "PDF"}
                  </button>
                </div>
                {hasActiveFilters ? (
                  <div style={exportGroup}>
                    <span style={exportLabelMuted}>Toutes les convocations :</span>
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

              {filteredConvocations.length === 0 ? (
                <p style={muted}>Aucune convocation ne correspond aux filtres sélectionnés.</p>
              ) : (
                <div style={convGrid}>
                  {filteredConvocations.map((c) => (
                    <ConvocationCard
                      key={c.numeroInscription}
                      convocation={c}
                      pdfBusy={pdfBusy === c.numeroInscription}
                      onViewPdf={() => void handleVoirPdf(c.numeroInscription)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>

        {!loading && !error ? (
          <section style={section}>
            <div style={sectionHead}>
              <h2 style={h2}>Historique des envois{envois ? ` (${envois.length})` : ""}</h2>
              {!readOnly ? (
                <button
                  type="button"
                  style={btnReset}
                  onClick={() => void handleReinitialiserHistorique()}
                  disabled={resettingHistorique || sending || (envois?.length ?? 0) === 0}
                  title="Supprimer tout l'historique des envois de convocations"
                >
                  {resettingHistorique ? "Suppression…" : "Réinitialiser l'historique"}
                </button>
              ) : null}
            </div>

            {envois && envois.length > 0 ? (
              <div style={envoiGrid}>
                {envois.map((e) => (
                  <EnvoiCard key={e.id} envoi={e} />
                ))}
              </div>
            ) : (
              <div style={emptyHistorique}>
                <span style={emptyIconSmall} aria-hidden="true">
                  📭
                </span>
                <p style={muted}>Aucun envoi enregistré pour le moment.</p>
              </div>
            )}
          </section>
        ) : null}

        {result ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={() => setResult(null)}>
            <div style={modal} role="dialog" aria-modal="true" onMouseDown={(ev) => ev.stopPropagation()}>
              <div style={modalHeader}>
                <div>
                  <h2 style={modalTitle}>Résultat de l&apos;envoi</h2>
                  <p style={modalSubtitle}>Récapitulatif de l&apos;envoi groupé par e-mail</p>
                </div>
                <button type="button" style={closeBtn} onClick={() => setResult(null)} aria-label="Fermer">
                  ×
                </button>
              </div>

              <div style={detailStatGrid}>
                <DetailStat label="Total" value={result.total} accent="#2563eb" />
                <DetailStat label="Envoyés" value={result.envoyes} accent="#059669" />
                <DetailStat label="Échecs" value={result.echecs} accent="#dc2626" />
              </div>

              {result.details.length > 0 ? (
                <div style={resultList}>
                  {result.details.map((d) => (
                    <div key={d.numeroInscription} style={resultItem}>
                      <div style={resultItemTop}>
                        <span style={resultCandidat}>{d.candidatNom || d.numeroInscription}</span>
                        <span style={statutBadgeStyle(d.statut)}>
                          {d.statut === "ENVOYE" ? "Envoyé" : "Échec"}
                        </span>
                      </div>
                      {d.email ? <span style={resultEmail}>{d.email}</span> : null}
                      {d.message ? <span style={resultMessage}>{d.message}</span> : null}
                    </div>
                  ))}
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

const btnPrimaryLink: CSSProperties = {
  ...btnPrimary,
  display: "inline-block",
  textDecoration: "none",
  marginTop: "0.25rem",
};

const btnReset: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
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
  marginBottom: "1.5rem",
};

const sectionHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.5rem",
};

const h2: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const sectionDesc: CSSProperties = {
  margin: "0 0 1rem",
  color: "#64748b",
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

const muted: CSSProperties = { color: "#64748b", margin: 0 };

const convGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "1rem",
};

const convCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
  padding: "1.1rem",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
};

const convCardTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const convNameBlock: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
};

const convName: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#0f172a",
};

const inscriptionBadge: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#64748b",
  fontFamily: "ui-monospace, monospace",
};

const emailOkBadge: CSSProperties = {
  flexShrink: 0,
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "#047857",
  background: "#ecfdf5",
  padding: "0.15rem 0.45rem",
  borderRadius: "999px",
  border: "1px solid #a7f3d0",
};

const emailMissingBadge: CSSProperties = {
  ...emailOkBadge,
  color: "#b91c1c",
  background: "#fef2f2",
  borderColor: "#fecaca",
};

const convConcoursRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
  alignItems: "center",
};

const concoursChip: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#4338ca",
  background: "#eef2ff",
  padding: "0.15rem 0.5rem",
  borderRadius: "999px",
  border: "1px solid #c7d2fe",
};

const numeroChip: CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "#64748b",
  fontFamily: "ui-monospace, monospace",
};

const convLocationGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.45rem 0.75rem",
  padding: "0.65rem",
  background: "#fff",
  borderRadius: "8px",
  border: "1px solid #f1f5f9",
};

const locItem: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const locLabel: CSSProperties = {
  fontSize: "0.65rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const locValue: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#334155",
};

const placeBadge: CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#047857",
  background: "#ecfdf5",
  padding: "0.05rem 0.4rem",
  borderRadius: "999px",
  border: "1px solid #a7f3d0",
};

const convDateRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
};

const dateIcon: CSSProperties = {
  fontSize: "0.9rem",
  lineHeight: 1,
};

const dateLine: CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#334155",
};

const timeLine: CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "#64748b",
};

const emailLine: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const btnPdf: CSSProperties = {
  marginTop: "auto",
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  width: "100%",
};

const envoiGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "0.75rem",
};

const envoiCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  padding: "0.85rem 1rem",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const envoiTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const envoiCandidat: CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#0f172a",
};

const envoiDate: CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  color: "#94a3b8",
  marginTop: "0.1rem",
};

const envoiMeta: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

const envoiEmail: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
};

const envoiConcours: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#4338ca",
};

const envoiMessage: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#b45309",
  background: "#fffbeb",
  padding: "0.35rem 0.5rem",
  borderRadius: "6px",
};

const envoiPar: CSSProperties = {
  fontSize: "0.7rem",
  color: "#94a3b8",
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "0.15rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.7rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const emptyState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "3rem 1.5rem",
  gap: "0.5rem",
};

const emptyHistorique: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "2rem 1rem",
  gap: "0.35rem",
};

const emptyIcon: CSSProperties = {
  fontSize: "2.5rem",
  marginBottom: "0.25rem",
};

const emptyIconSmall: CSSProperties = {
  fontSize: "1.75rem",
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
  padding: "1.1rem",
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
  marginBottom: "1rem",
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

const modal: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  maxWidth: "640px",
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

const modalTitle: CSSProperties = {
  margin: 0,
  fontSize: "1.2rem",
  fontWeight: 800,
  color: "#0f172a",
};

const modalSubtitle: CSSProperties = {
  margin: "0.25rem 0 0",
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

const resultList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem 1.5rem 0",
  maxHeight: "320px",
  overflowY: "auto",
};

const resultItem: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  padding: "0.65rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const resultItemTop: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const resultCandidat: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#0f172a",
};

const resultEmail: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
};

const resultMessage: CSSProperties = {
  fontSize: "0.75rem",
  color: "#b45309",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  padding: "1.25rem 1.5rem 1.5rem",
  marginTop: "0.5rem",
  borderTop: "1px solid #f1f5f9",
};
