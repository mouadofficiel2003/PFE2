import axios from "axios";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  deleteCandidat,
  fetchCandidats,
  importCandidatsExcel,
  isCandidatAffecte,
  reinitialiserCandidats,
  updateCandidat,
  type CandidatDto,
  type CandidatUpdatePayload,
} from "../api/candidatsApi";
import { fetchConcours, type ConcoursDto } from "../api/concoursApi";
import {
  fetchCentre,
  fetchCentres,
  type CentreDetailDto,
  type CentreListItemDto,
  type EtablissementDetailDto,
  type SalleDto,
} from "../api/lieuxApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

function dtoToForm(c: CandidatDto): CandidatUpdatePayload {
  return {
    nom: c.nom,
    prenom: c.prenom,
    cin: c.cin,
    numeroTelephone: c.numeroTelephone,
    ville: c.ville,
    age: c.age,
    email: c.email,
    specialite: c.specialite,
    numeroInscription: c.numeroInscription,
    nomConcours: c.nomConcours,
    numeroConcours: c.numeroConcours,
    idCentre: c.idCentre,
    idEtablissement: c.idEtablissement,
    idSalle: c.idSalle,
    numeroPlace: c.numeroPlace,
  };
}

export default function CandidatsPage() {
  const { state } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [candidats, setCandidats] = useState<CandidatDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CandidatDto | null>(null);
  const [editForm, setEditForm] = useState<CandidatUpdatePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [concoursList, setConcoursList] = useState<ConcoursDto[]>([]);
  const [centresList, setCentresList] = useState<CentreListItemDto[]>([]);
  const [centreDetail, setCentreDetail] = useState<CentreDetailDto | null>(null);
  const [centreDetailLoading, setCentreDetailLoading] = useState(false);
  const [centreNameById, setCentreNameById] = useState<Map<number, string>>(new Map());
  const [etabNameById, setEtabNameById] = useState<Map<number, string>>(new Map());
  const [salleNameById, setSalleNameById] = useState<Map<number, string>>(new Map());

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchCandidats();
      setCandidats(list);
    } catch (e) {
      setCandidats(null);
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setLoadError("L’API GET /api/candidats n’est pas disponible (404).");
      } else if (axios.isAxiosError(e) && e.response?.status === 403) {
        setLoadError("Accès refusé (403). Vérifiez le rôle ou le jeton.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setLoadError(
          "Impossible de joindre candidat-service (réseau ou service arrêté). Vérifiez le proxy et le port 8082.",
        );
      } else {
        setLoadError(e instanceof Error ? e.message : "Erreur lors du chargement.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadList();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchConcours();
        if (!cancelled) setConcoursList(list);
      } catch {
        if (!cancelled) setConcoursList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchCentres();
        if (cancelled) return;
        setCentresList(list);
        const details = await Promise.all(
          list.map((c) => fetchCentre(c.idCentre).catch(() => null)),
        );
        if (cancelled) return;
        const cMap = new Map<number, string>();
        const eMap = new Map<number, string>();
        const sMap = new Map<number, string>();
        for (const d of details) {
          if (!d) continue;
          cMap.set(d.idCentre, d.nomCentre);
          for (const etab of d.etablissements) {
            eMap.set(etab.idEtablissement, etab.nomEtablissement);
            for (const s of etab.salles) {
              sMap.set(s.idSalle, s.nomSalle);
            }
          }
        }
        setCentreNameById(cMap);
        setEtabNameById(eMap);
        setSalleNameById(sMap);
      } catch {
        if (!cancelled) {
          setCentresList([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";

  const loadCentreDetail = useCallback(async (idCentre: number | null) => {
    if (idCentre == null) {
      setCentreDetail(null);
      return;
    }
    setCentreDetailLoading(true);
    try {
      const d = await fetchCentre(idCentre);
      setCentreDetail(d);
    } catch {
      setCentreDetail(null);
    } finally {
      setCentreDetailLoading(false);
    }
  }, []);

  function openEdit(c: CandidatDto) {
    setActionError(null);
    setEditing(c);
    setEditForm(dtoToForm(c));
    setCentreDetail(null);
    if (c.idCentre != null) {
      void loadCentreDetail(c.idCentre);
    }
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
    setSaving(false);
    setCentreDetail(null);
  }

  function handleCentreChange(value: string) {
    if (!editForm) return;
    const idCentre = value === "" ? null : Number(value);
    setEditForm({
      ...editForm,
      idCentre,
      idEtablissement: null,
      idSalle: null,
      numeroPlace: null,
    });
    void loadCentreDetail(idCentre);
  }

  function handleEtablissementChange(value: string) {
    if (!editForm) return;
    const idEtablissement = value === "" ? null : Number(value);
    setEditForm({
      ...editForm,
      idEtablissement,
      idSalle: null,
      numeroPlace: null,
    });
  }

  function handleSalleChange(value: string) {
    if (!editForm) return;
    const idSalle = value === "" ? null : Number(value);
    setEditForm({
      ...editForm,
      idSalle,
      numeroPlace: null,
    });
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateCandidat(editing.numeroInscription, editForm);
      setCandidats((prev) =>
        prev
          ? prev.map((x) => (x.numeroInscription === updated.numeroInscription ? updated : x))
          : [updated],
      );
      closeEdit();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setActionError(
          (err.response?.data as { message?: string })?.message ??
            "Conflit : CIN ou numéro d’inscription déjà utilisé.",
        );
      } else if (axios.isAxiosError(err) && err.response?.data) {
        const d = err.response.data as { message?: string; detail?: string };
        setActionError(d.message ?? d.detail ?? "Erreur lors de l’enregistrement.");
      } else {
        setActionError(err instanceof Error ? err.message : "Erreur lors de l’enregistrement.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: CandidatDto) {
    const ok = window.confirm(
      `Supprimer le candidat ${c.prenom} ${c.nom} (CIN ${c.cin}) ? Cette action est définitive.`,
    );
    if (!ok) return;
    setActionError(null);
    try {
      await deleteCandidat(c.numeroInscription);
      setCandidats((prev) => (prev ? prev.filter((x) => x.numeroInscription !== c.numeroInscription) : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    }
  }

  function triggerImportClick() {
    setImportFeedback(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportFeedback("Veuillez choisir un fichier Excel au format .xlsx.");
      return;
    }
    setImportBusy(true);
    setImportFeedback(null);
    setActionError(null);
    try {
      const res = await importCandidatsExcel(file);
      const parts = [
        `${res.inserted} créé(s)`,
        `${res.updated} mis à jour`,
        res.skipped > 0 ? `${res.skipped} ignoré(s)` : null,
      ].filter(Boolean);
      setImportFeedback(parts.join(" · ") + ".");
      if (res.errors.length > 0) {
        const preview = res.errors
          .slice(0, 5)
          .map((x) => `Ligne ${x.rowNumber}: ${x.message}`)
          .join(" — ");
        setImportFeedback((prev) => `${prev} Détails : ${preview}${res.errors.length > 5 ? " …" : ""}`);
      }
      await loadList();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setImportFeedback("Import réservé au gestionnaire (403).");
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        const d = err.response.data as { message?: string; detail?: string };
        setImportFeedback(d.message ?? d.detail ?? "Fichier refusé (400).");
      } else {
        setImportFeedback(err instanceof Error ? err.message : "Échec de l’import.");
      }
    } finally {
      setImportBusy(false);
    }
  }

  async function handleReset() {
    const total = candidats?.length ?? 0;
    const ok = window.confirm(
      total > 0
        ? `Réinitialiser la liste ? Les ${total} candidat${total > 1 ? "s" : ""} seront définitivement supprimés.`
        : "Réinitialiser la liste des candidats ? Cette action est définitive.",
    );
    if (!ok) return;
    setResetBusy(true);
    setActionError(null);
    setImportFeedback(null);
    try {
      const res = await reinitialiserCandidats();
      setCandidats([]);
      setImportFeedback(
        res.deleted > 0
          ? `Liste réinitialisée : ${res.deleted} candidat${res.deleted > 1 ? "s" : ""} supprimé${res.deleted > 1 ? "s" : ""}.`
          : "La liste était déjà vide.",
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Réinitialisation réservée au gestionnaire (403).");
      } else if (axios.isAxiosError(err) && err.response?.data) {
        const d = err.response.data as { message?: string; detail?: string };
        setActionError(d.message ?? d.detail ?? "Échec de la réinitialisation.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la réinitialisation.");
      }
    } finally {
      setResetBusy(false);
    }
  }

  const etablissements: EtablissementDetailDto[] = centreDetail?.etablissements ?? [];
  const selectedEtab: EtablissementDetailDto | null = editForm
    ? etablissements.find((e) => e.idEtablissement === editForm.idEtablissement) ?? null
    : null;
  const sallesDisponibles: SalleDto[] = (selectedEtab?.salles ?? []).filter(
    (s) =>
      s.idSalle === editForm?.idSalle ||
      s.numeroConcours == null ||
      s.numeroConcours === "" ||
      s.numeroConcours === (editForm?.numeroConcours ?? null),
  );
  const selectedSalle: SalleDto | null = editForm
    ? sallesDisponibles.find((s) => s.idSalle === editForm.idSalle) ?? null
    : null;

  return (
    <div style={page}>
      <AppHeader />
      <main style={main}>
        <section style={section}>
          <div style={toolbar}>
            <h2 style={h2Inline}>Liste des candidats</h2>
            {!readOnly ? (
              <div style={toolbarRight}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={{ display: "none" }}
                  onChange={handleFileSelected}
                />
                <button
                  type="button"
                  style={btnReset}
                  onClick={() => void handleReset()}
                  disabled={resetBusy || importBusy || loading || !candidats || candidats.length === 0}
                >
                  {resetBusy ? "Réinitialisation…" : "Réinitialiser la liste"}
                </button>
                <button
                  type="button"
                  style={btnPrimary}
                  onClick={triggerImportClick}
                  disabled={importBusy || resetBusy || loading}
                >
                  {importBusy ? "Import…" : "Importer fichier Excel"}
                </button>
              </div>
            ) : null}
          </div>
          {importFeedback ? (
            <p role="status" style={infoBanner}>
              {importFeedback}
            </p>
          ) : null}
          {actionError ? (
            <p role="alert" style={alert}>
              {actionError}
            </p>
          ) : null}
          {loading ? <p style={muted}>Chargement…</p> : null}
          {!loading && loadError ? (
            <p role="alert" style={alert}>
              {loadError}
            </p>
          ) : null}
          {!loading && !loadError && candidats && candidats.length === 0 ? (
            <p style={muted}>Aucun candidat. Importez un fichier Excel ou ajoutez des données côté serveur.</p>
          ) : null}
          {!loading && !loadError && candidats && candidats.length > 0 ? (
            <>
              <p style={countLine}>
                {candidats.length} candidat{candidats.length > 1 ? "s" : ""}
              </p>
              <div style={cardGrid}>
                {candidats.map((c) => {
                  const initials =
                    `${(c.prenom?.[0] ?? "").toUpperCase()}${(c.nom?.[0] ?? "").toUpperCase()}` || "?";
                  const affecte = isCandidatAffecte(c);
                  return (
                    <article key={c.numeroInscription} style={candidateCard}>
                      <div style={cardTop}>
                        <span style={avatar} aria-hidden="true">
                          {initials}
                        </span>
                        <div style={cardIdentity}>
                          <h3 style={cardName}>
                            {c.prenom} {c.nom}
                          </h3>
                          <span style={cardSub}>
                            CIN {c.cin} · N° {c.numeroInscription}
                          </span>
                        </div>
                      </div>

                      <dl style={infoList}>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Téléphone</dt>
                          <dd style={infoValue}>{c.numeroTelephone || "—"}</dd>
                        </div>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Email</dt>
                          <dd style={infoValueBreak}>{c.email || "—"}</dd>
                        </div>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Ville</dt>
                          <dd style={infoValue}>{c.ville || "—"}</dd>
                        </div>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Âge</dt>
                          <dd style={infoValue}>{c.age ? `${c.age} ans` : "—"}</dd>
                        </div>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Spécialité</dt>
                          <dd style={infoValue}>{c.specialite || "—"}</dd>
                        </div>
                        <div style={infoRow}>
                          <dt style={infoLabel}>Concours</dt>
                          <dd style={infoValue}>
                            {c.nomConcours || "—"}
                            {c.numeroConcours ? ` (${c.numeroConcours})` : ""}
                          </dd>
                        </div>
                      </dl>

                      <div style={affecte ? locationLine : locationLineEmpty}>
                        <svg
                          style={locationPin}
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {affecte ? (
                          <div style={locationChips}>
                            <span style={locChip}>
                              Centre {c.idCentre != null ? (centreNameById.get(c.idCentre) ?? c.idCentre) : "—"}
                            </span>
                            <span style={locChip}>
                              Établissement{" "}
                              {c.idEtablissement != null
                                ? (etabNameById.get(c.idEtablissement) ?? c.idEtablissement)
                                : "—"}
                            </span>
                            <span style={locChip}>
                              Salle {c.idSalle != null ? (salleNameById.get(c.idSalle) ?? c.idSalle) : "—"}
                            </span>
                            <span style={locChipAccent}>Place {c.numeroPlace ?? "—"}</span>
                          </div>
                        ) : (
                          <span style={locationEmptyText}>Non encore affecté à un lieu</span>
                        )}
                      </div>

                      {!readOnly ? (
                        <div style={cardActions}>
                          <button type="button" style={btnEdit} onClick={() => openEdit(c)}>
                            Modifier
                          </button>
                          <button type="button" style={btnDelete} onClick={() => void handleDelete(c)}>
                            Supprimer
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      </main>

      {editing && editForm ? (
        <div style={modalBackdrop} onClick={closeEdit} role="presentation">
          <div
            style={modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-candidat-title"
          >
            <h2 id="edit-candidat-title" style={modalTitle}>
              Modifier le candidat
            </h2>
            <form onSubmit={(e) => void handleSaveEdit(e)}>
              <div style={formGrid}>
                <label style={label}>
                  Nom
                  <input
                    style={input}
                    value={editForm.nom}
                    onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  Prénom
                  <input
                    style={input}
                    value={editForm.prenom}
                    onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  CIN
                  <input
                    style={input}
                    value={editForm.cin}
                    onChange={(e) => setEditForm({ ...editForm, cin: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  Téléphone
                  <input
                    style={input}
                    value={editForm.numeroTelephone}
                    onChange={(e) => setEditForm({ ...editForm, numeroTelephone: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  Ville
                  <input
                    style={input}
                    value={editForm.ville}
                    onChange={(e) => setEditForm({ ...editForm, ville: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  Âge
                  <input
                    style={input}
                    type="number"
                    min={10}
                    max={120}
                    value={editForm.age}
                    onChange={(e) => setEditForm({ ...editForm, age: Number(e.target.value) })}
                    required
                  />
                </label>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  Email
                  <input
                    style={input}
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                  />
                </label>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  Spécialité
                  <input
                    style={input}
                    value={editForm.specialite}
                    onChange={(e) => setEditForm({ ...editForm, specialite: e.target.value })}
                    required
                  />
                </label>
                <label style={label}>
                  N° inscription
                  <input
                    style={input}
                    value={editForm.numeroInscription}
                    onChange={(e) => setEditForm({ ...editForm, numeroInscription: e.target.value })}
                    required
                  />
                </label>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  Concours
                  <select
                    style={input}
                    value={editForm.numeroConcours ?? ""}
                    onChange={(e) => {
                      const numero = e.target.value === "" ? null : e.target.value;
                      const co = concoursList.find((x) => x.numeroConcours === numero);
                      setEditForm({
                        ...editForm,
                        numeroConcours: numero,
                        nomConcours: co?.nomConcours ?? editForm.nomConcours,
                      });
                    }}
                    required
                  >
                    <option value="" disabled>
                      Choisir un concours…
                    </option>
                    {concoursList.map((co) => (
                      <option key={co.numeroConcours} value={co.numeroConcours}>
                        {co.nomConcours}
                        {co.numeroConcours ? ` (${co.numeroConcours})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ ...label, gridColumn: "1 / -1", gap: "0.35rem" }}>
                  <span style={sectionLabel}>Affectation du lieu (optionnel)</span>
                  <span style={sectionHint}>
                    Choisissez par nom : centre, puis établissement, puis salle. Laissez « — Aucun — »
                    pour ne pas affecter de lieu.
                  </span>
                </div>
                <label style={label}>
                  Centre
                  <select
                    style={input}
                    value={editForm.idCentre ?? ""}
                    onChange={(e) => handleCentreChange(e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {centresList.map((c) => (
                      <option key={c.idCentre} value={c.idCentre}>
                        {c.nomCentre}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={label}>
                  Établissement
                  <select
                    style={input}
                    value={editForm.idEtablissement ?? ""}
                    onChange={(e) => handleEtablissementChange(e.target.value)}
                    disabled={editForm.idCentre == null || centreDetailLoading}
                  >
                    <option value="">
                      {editForm.idCentre == null
                        ? "Choisir un centre d’abord…"
                        : centreDetailLoading
                          ? "Chargement…"
                          : "— Aucun —"}
                    </option>
                    {etablissements.map((etab) => (
                      <option key={etab.idEtablissement} value={etab.idEtablissement}>
                        {etab.nomEtablissement}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={label}>
                  Salle
                  <select
                    style={input}
                    value={editForm.idSalle ?? ""}
                    onChange={(e) => handleSalleChange(e.target.value)}
                    disabled={editForm.idEtablissement == null}
                  >
                    <option value="">
                      {editForm.idEtablissement == null ? "Choisir un établissement d’abord…" : "— Aucune —"}
                    </option>
                    {sallesDisponibles.map((s) => (
                      <option key={s.idSalle} value={s.idSalle}>
                        {s.nomSalle} ({s.nombrePlaces} places)
                      </option>
                    ))}
                  </select>
                </label>
                <label style={label}>
                  N° place (optionnel)
                  <input
                    style={input}
                    type="number"
                    min={1}
                    max={selectedSalle?.nombrePlaces ?? undefined}
                    value={editForm.numeroPlace ?? ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        numeroPlace: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={editForm.idSalle == null}
                    placeholder={
                      selectedSalle ? `1 à ${selectedSalle.nombrePlaces}` : "Affectez une salle d’abord"
                    }
                  />
                </label>
              </div>
              {actionError ? (
                <p role="alert" style={{ ...alert, marginTop: "1rem" }}>
                  {actionError}
                </p>
              ) : null}
              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={closeEdit} disabled={saving}>
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
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#0f172a",
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
  color: "#dc2626",
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

const toolbarRight: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
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

const infoBanner: CSSProperties = {
  color: "#1e40af",
  background: "#eff6ff",
  border: "1px solid #93c5fd",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
  fontSize: "0.9rem",
};

const countLine: CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#64748b",
};

const cardGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: "1.25rem",
};

const candidateCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1.25rem",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const cardTop: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
};

const avatar: CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.75rem",
  height: "2.75rem",
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "1rem",
  letterSpacing: "0.02em",
};

const cardIdentity: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  minWidth: 0,
};

const cardName: CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
  fontWeight: 700,
  color: "#0f172a",
};

const cardSub: CSSProperties = {
  fontSize: "0.8rem",
  color: "#64748b",
};

const infoList: CSSProperties = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const infoRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "7rem 1fr",
  alignItems: "baseline",
  gap: "0.5rem",
};

const infoLabel: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#94a3b8",
};

const infoValue: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#1e293b",
};

const infoValueBreak: CSSProperties = {
  ...infoValue,
  wordBreak: "break-word",
};

const locationLine: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
  padding: "0.75rem 0.85rem",
  background: "#f0f9ff",
  border: "1px solid #bae6fd",
  borderRadius: "10px",
};

const locationLineEmpty: CSSProperties = {
  ...locationLine,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
};

const locationPin: CSSProperties = {
  flexShrink: 0,
  marginTop: "0.1rem",
  color: "#0284c7",
};

const locationChips: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const locChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  background: "#fff",
  border: "1px solid #bae6fd",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#0369a1",
};

const locChipAccent: CSSProperties = {
  ...locChip,
  background: "#0284c7",
  border: "1px solid #0284c7",
  color: "#fff",
};

const locationEmptyText: CSSProperties = {
  fontSize: "0.8rem",
  color: "#64748b",
  fontStyle: "italic",
};

const cardActions: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  paddingTop: "0.85rem",
  borderTop: "1px solid #f1f5f9",
  marginTop: "auto",
};

const btnEdit: CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#1e293b",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const btnDelete: CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
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
  maxWidth: "560px",
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

const input: CSSProperties = {
  padding: "0.45rem 0.55rem",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
};

const sectionLabel: CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "#0f172a",
};

const sectionHint: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 400,
  color: "#64748b",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  marginTop: "1.25rem",
};
