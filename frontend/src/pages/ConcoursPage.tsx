import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createConcours,
  deleteConcours,
  fetchConcours,
  updateConcours,
  type CentreAffectationWrite,
  type ConcoursDto,
  type ConcoursWritePayload,
} from "../api/concoursApi";
import { fetchCentres, type CentreListItemDto } from "../api/lieuxApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

type CentreFormRow = { idCentre: string };

type ExamTiming = "past" | "today" | "upcoming";

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getExamTiming(iso: string): ExamTiming {
  const exam = new Date(iso);
  if (Number.isNaN(exam.getTime())) return "upcoming";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  if (exam < todayStart) return "past";
  if (exam < todayEnd) return "today";
  return "upcoming";
}

function formatExamDate(iso: string): { dateLine: string; timeLine: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dateLine: "—", timeLine: "" };
  return {
    dateLine: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }),
    timeLine: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function timingLabel(timing: ExamTiming): string {
  if (timing === "past") return "Passé";
  if (timing === "today") return "Aujourd'hui";
  return "À venir";
}

function rowsToPayload(
  nomConcours: string,
  numeroConcours: string,
  dateLocal: string,
  rows: CentreFormRow[],
  lieuxCentres: CentreListItemDto[],
): ConcoursWritePayload {
  const byId = new Map(lieuxCentres.map((c) => [c.idCentre, c]));
  const centres: CentreAffectationWrite[] = rows
    .filter((r) => r.idCentre.trim())
    .map((r) => {
      const idCentre = Number(r.idCentre.trim());
      const centre = byId.get(idCentre);
      return {
        idCentre,
        nomCentre: centre?.nomCentre ?? "",
      };
    })
    .filter((c) => c.nomCentre);
  return {
    nomConcours: nomConcours.trim(),
    numeroConcours: numeroConcours.trim(),
    dateHeureExamen: new Date(dateLocal).toISOString(),
    centres,
  };
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

function ConcoursCard({
  concours,
  readOnly,
  onEdit,
  onDelete,
}: {
  concours: ConcoursDto;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const timing = getExamTiming(concours.dateHeureExamen);
  const { dateLine: formattedDate, timeLine: formattedTime } = formatExamDate(concours.dateHeureExamen);

  return (
    <article style={concoursCard}>
      <div style={cardTop}>
        <div style={cardTitleBlock}>
          <h3 style={cardTitle}>{concours.nomConcours}</h3>
          <span style={numeroBadge}>{concours.numeroConcours ?? "—"}</span>
        </div>
        <span style={timingBadge(timing)}>{timingLabel(timing)}</span>
      </div>

      <div style={dateBlock}>
        <span style={dateIcon} aria-hidden="true">
          📅
        </span>
        <div>
          <span style={dateLineStyle}>{formattedDate}</span>
          {formattedTime ? <span style={timeLineStyle}>{formattedTime}</span> : null}
        </div>
      </div>

      <div style={centresBlock}>
        <span style={centresLabel}>Centres assignés</span>
        {concours.centres.length === 0 ? (
          <span style={noCentres}>Aucun centre</span>
        ) : (
          <div style={chipRow}>
            {concours.centres.map((c) => (
              <span key={c.id} style={centreChip}>
                {c.nomCentre}
              </span>
            ))}
          </div>
        )}
      </div>

      {!readOnly ? (
        <div style={cardActions}>
          <button type="button" style={btnEdit} onClick={onEdit}>
            Modifier
          </button>
          <button type="button" style={btnDelete} onClick={onDelete}>
            Supprimer
          </button>
        </div>
      ) : null}
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div style={cardGrid}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={skeletonCard} aria-hidden="true">
          <div style={{ ...skeletonLine, width: "55%", height: "1.1rem" }} />
          <div style={{ ...skeletonLine, width: "35%", marginTop: "0.75rem" }} />
          <div style={{ ...skeletonLine, width: "80%", marginTop: "1rem" }} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <div style={{ ...skeletonLine, width: "4.5rem", height: "1.5rem", borderRadius: "999px" }} />
            <div style={{ ...skeletonLine, width: "5rem", height: "1.5rem", borderRadius: "999px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ConcoursPage() {
  const { state } = useAuth();
  const [list, setList] = useState<ConcoursDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingNumero, setEditingNumero] = useState<string | null>(null);
  const [nomConcours, setNomConcours] = useState("");
  const [numeroConcours, setNumeroConcours] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [centreRows, setCentreRows] = useState<CentreFormRow[]>([{ idCentre: "" }]);
  const [lieuxCentres, setLieuxCentres] = useState<CentreListItemDto[]>([]);
  const [saving, setSaving] = useState(false);

  const loadLieuxCentres = useCallback(async () => {
    try {
      const data = await fetchCentres();
      setLieuxCentres(data);
    } catch {
      setLieuxCentres([]);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConcours();
      setList(data);
    } catch (e) {
      setList(null);
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setError("Délai dépassé : redémarrez concours-service (8083) et lieux-service (8084), puis rechargez la page.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setError("Impossible de joindre concours-service (port 8083 ou proxy Vite).");
      } else {
        setError(e instanceof Error ? e.message : "Erreur de chargement.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const stats = useMemo(() => {
    const items = list ?? [];
    const upcoming = items.filter((c) => getExamTiming(c.dateHeureExamen) !== "past").length;
    const totalCentres = items.reduce((sum, c) => sum + c.centres.length, 0);
    return { total: items.length, upcoming, totalCentres };
  }, [list]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";

  function openCreate() {
    setActionError(null);
    setEditingNumero(null);
    setNomConcours("");
    setNumeroConcours("");
    setDateLocal("");
    setCentreRows([{ idCentre: "" }]);
    setFormOpen(true);
    void loadLieuxCentres();
  }

  function openEdit(c: ConcoursDto) {
    setActionError(null);
    setEditingNumero(c.numeroConcours);
    setNomConcours(c.nomConcours);
    setNumeroConcours(c.numeroConcours ?? "");
    setDateLocal(isoToDatetimeLocal(c.dateHeureExamen));
    setCentreRows(
      c.centres.length
        ? c.centres.map((x) => ({ idCentre: String(x.idCentre) }))
        : [{ idCentre: "" }],
    );
    setFormOpen(true);
    void loadLieuxCentres();
  }

  function closeForm() {
    setFormOpen(false);
    setEditingNumero(null);
    setSaving(false);
  }

  function addCentreRow() {
    setCentreRows((r) => [...r, { idCentre: "" }]);
  }

  function removeCentreRow(index: number) {
    setCentreRows((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== index)));
  }

  function setCentreRow(index: number, idCentre: string) {
    setCentreRows((rows) => rows.map((row, i) => (i === index ? { idCentre } : row)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);
    if (!dateLocal.trim()) {
      setActionError("Indiquez la date et l'heure d'examen.");
      setSaving(false);
      return;
    }
    if (!numeroConcours.trim()) {
      setActionError("Indiquez le numéro de concours.");
      setSaving(false);
      return;
    }
    const payload = rowsToPayload(nomConcours, numeroConcours, dateLocal, centreRows, lieuxCentres);
    if (!payload.centres.length) {
      setActionError("Ajoutez au moins un centre (choisi dans lieux-service).");
      setSaving(false);
      return;
    }
    try {
      if (editingNumero == null) {
        await createConcours(payload);
      } else {
        await updateConcours(editingNumero, payload);
      }
      closeForm();
      await loadList();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Modification réservée au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === "object" && "message" in err.response.data && typeof err.response.data.message === "string") {
        setActionError(err.response.data.message);
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: ConcoursDto) {
    if (!window.confirm(`Supprimer le concours « ${c.nomConcours} » ?`)) return;
    setActionError(null);
    try {
      await deleteConcours(c.numeroConcours);
      await loadList();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Suppression réservée au gestionnaire.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la suppression.");
      }
    }
  }

  return (
    <div style={page}>
      <AppHeader />
      <main style={main}>
        <div style={hero}>
          <div>
            <h1 style={h1}>Concours</h1>
          </div>
          <div style={heroActions}>
            <button type="button" style={btnGhost} onClick={() => void loadList()} disabled={loading}>
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
            {!readOnly ? (
              <button type="button" style={btnPrimary} onClick={openCreate} disabled={loading}>
                + Nouveau concours
              </button>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <p role="alert" style={alert}>
            {actionError}
          </p>
        ) : null}

        {!loading && !error && list ? (
          <section style={kpiGrid}>
            <KpiCard label="Total concours" value={stats.total} hint="enregistrés" accent="#7c3aed" />
            <KpiCard label="À venir" value={stats.upcoming} hint="examens planifiés" accent="#2563eb" />
            <KpiCard label="Centres assignés" value={stats.totalCentres} hint="liens concours ↔ lieux" accent="#0d9488" />
          </section>
        ) : null}

        <section style={section}>
          {loading ? <LoadingSkeleton /> : null}

          {!loading && error ? (
            <div style={errorState}>
              <span style={errorIcon} aria-hidden="true">
                ⚠
              </span>
              <p role="alert" style={errorText}>
                {error}
              </p>
              <button type="button" style={btnGhost} onClick={() => void loadList()}>
                Réessayer
              </button>
            </div>
          ) : null}

          {!loading && !error && list && list.length === 0 ? (
            <div style={emptyState}>
              <span style={emptyIcon} aria-hidden="true">
                📋
              </span>
              <h2 style={emptyTitle}>Aucun concours enregistré</h2>
              <p style={emptyDesc}>
                Créez votre premier concours pour définir une date d&apos;examen et y rattacher des centres.
              </p>
              {!readOnly ? (
                <button type="button" style={btnPrimary} onClick={openCreate}>
                  Créer un concours
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && list && list.length > 0 ? (
            <div style={cardGrid}>
              {list.map((c) => (
                <ConcoursCard
                  key={c.numeroConcours}
                  concours={c}
                  readOnly={readOnly}
                  onEdit={() => openEdit(c)}
                  onDelete={() => void handleDelete(c)}
                />
              ))}
            </div>
          ) : null}
        </section>

        {formOpen ? (
          <div style={modalBackdrop} role="presentation" onMouseDown={closeForm}>
            <div
              style={modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="concours-modal-title"
              onMouseDown={(ev) => ev.stopPropagation()}
            >
              <div style={modalHeader}>
                <div>
                  <h2 id="concours-modal-title" style={modalTitle}>
                    {editingNumero == null ? "Nouveau concours" : "Modifier le concours"}
                  </h2>
                  <p style={modalSubtitle}>
                    {editingNumero == null
                      ? "Renseignez les informations du concours et sélectionnez les centres."
                      : "Mettez à jour les informations du concours."}
                  </p>
                </div>
                <button type="button" style={closeBtn} onClick={closeForm} aria-label="Fermer">
                  ×
                </button>
              </div>

              <form onSubmit={(e) => void handleSubmit(e)}>
                <div style={formSection}>
                  <span style={formSectionLabel}>Informations générales</span>
                  <div style={formGrid}>
                    <label style={{ ...label, gridColumn: "1 / -1" }}>
                      Nom du concours
                      <input
                        style={input}
                        value={nomConcours}
                        onChange={(e) => setNomConcours(e.target.value)}
                        required
                        maxLength={200}
                        placeholder="Ex. Concours national d'accès…"
                      />
                    </label>
                    <label style={label}>
                      N° concours
                      <input
                        style={editingNumero != null ? inputDisabled : input}
                        value={numeroConcours}
                        onChange={(e) => setNumeroConcours(e.target.value)}
                        maxLength={80}
                        required
                        readOnly={editingNumero != null}
                        disabled={editingNumero != null}
                        placeholder="Ex. CONC-2025-01"
                      />
                    </label>
                    <label style={label}>
                      Date et heure d&apos;examen
                      <input
                        style={input}
                        type="datetime-local"
                        value={dateLocal}
                        onChange={(e) => setDateLocal(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                </div>

                <div style={formSection}>
                  <span style={formSectionLabel}>Centres d&apos;affectation</span>
                  <p style={hint}>
                    Sélectionnez des centres existants dans le service lieux. L&apos;identifiant centre est partagé entre
                    microservices ; le nom est enregistré pour l&apos;affichage.
                  </p>
                  {lieuxCentres.length === 0 ? (
                    <div style={hintBox}>
                      Aucun centre disponible.{" "}
                      <Link to="/lieux" style={inlineLink}>
                        Créez des centres
                      </Link>{" "}
                      avant de planifier un concours.
                    </div>
                  ) : null}
                  <div style={centreList}>
                    {centreRows.map((row, index) => (
                      <div key={index} style={centreRow}>
                        <label style={{ ...label, flex: 1 }}>
                          Centre {centreRows.length > 1 ? `#${index + 1}` : ""}
                          <select
                            style={input}
                            value={row.idCentre}
                            onChange={(e) => setCentreRow(index, e.target.value)}
                            required
                            disabled={readOnly || lieuxCentres.length === 0}
                          >
                            <option value="">— Choisir un centre —</option>
                            {lieuxCentres.map((c) => (
                              <option key={c.idCentre} value={String(c.idCentre)}>
                                {c.nomCentre}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!readOnly && centreRows.length > 1 ? (
                          <button type="button" style={btnRemove} onClick={() => removeCentreRow(index)}>
                            Retirer
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {!readOnly ? (
                    <button type="button" style={btnAddCentre} onClick={addCentreRow}>
                      + Ajouter un centre
                    </button>
                  ) : null}
                </div>

                <div style={modalActions}>
                  <button type="button" style={btnGhost} onClick={closeForm}>
                    Annuler
                  </button>
                  {!readOnly ? (
                    <button type="submit" style={btnPrimary} disabled={saving}>
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function timingBadge(timing: ExamTiming): CSSProperties {
  if (timing === "past") {
    return { ...badge, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" };
  }
  if (timing === "today") {
    return { ...badge, background: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d" };
  }
  return { ...badge, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
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

const inlineLink: CSSProperties = {
  color: "#2563eb",
  fontWeight: 600,
  textDecoration: "none",
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

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const cardGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: "1rem",
};

const concoursCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
  padding: "1.15rem",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const cardTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const cardTitleBlock: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  minWidth: 0,
};

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
  lineHeight: 1.3,
};

const numeroBadge: CSSProperties = {
  display: "inline-block",
  alignSelf: "flex-start",
  padding: "0.15rem 0.5rem",
  borderRadius: "6px",
  background: "#f1f5f9",
  color: "#475569",
  fontSize: "0.72rem",
  fontWeight: 700,
  fontFamily: "ui-monospace, monospace",
  letterSpacing: "0.02em",
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.7rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const dateBlock: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  padding: "0.65rem 0.75rem",
  background: "#fff",
  borderRadius: "8px",
  border: "1px solid #f1f5f9",
};

const dateIcon: CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1,
};

const dateLineStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#334155",
};

const timeLineStyle: CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "#64748b",
  marginTop: "0.1rem",
};

const centresBlock: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const centresLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const noCentres: CSSProperties = {
  fontSize: "0.8125rem",
  color: "#94a3b8",
  fontStyle: "italic",
};

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
};

const centreChip: CSSProperties = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  fontSize: "0.75rem",
  fontWeight: 600,
};

const cardActions: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "auto",
  paddingTop: "0.5rem",
  borderTop: "1px solid #f1f5f9",
};

const btnEdit: CSSProperties = {
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
  flex: 1,
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
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
  marginBottom: "0.5rem",
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

const modal: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "0",
  maxWidth: "580px",
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

const formSection: CSSProperties = {
  padding: "1.25rem 1.5rem 0",
};

const formSectionLabel: CSSProperties = {
  display: "block",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.75rem",
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem 1rem",
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
  background: "#fff",
  transition: "border-color 0.15s ease",
};

const inputDisabled: CSSProperties = {
  ...input,
  background: "#f8fafc",
  color: "#64748b",
  cursor: "not-allowed",
};

const hint: CSSProperties = {
  margin: "0 0 0.75rem",
  fontSize: "0.8rem",
  color: "#64748b",
  lineHeight: 1.5,
};

const hintBox: CSSProperties = {
  margin: "0 0 0.75rem",
  padding: "0.65rem 0.85rem",
  borderRadius: "8px",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  fontSize: "0.8125rem",
  color: "#92400e",
};

const centreList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const centreRow: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const btnRemove: CSSProperties = {
  padding: "0.45rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fff",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  marginBottom: "0.1rem",
};

const btnAddCentre: CSSProperties = {
  marginTop: "0.5rem",
  padding: "0.4rem 0.75rem",
  borderRadius: "8px",
  border: "1px dashed #93c5fd",
  background: "#eff6ff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
  width: "100%",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  padding: "1.25rem 1.5rem 1.5rem",
  marginTop: "0.5rem",
  borderTop: "1px solid #f1f5f9",
};
