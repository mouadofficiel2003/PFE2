import axios from "axios";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { fetchConcours, type ConcoursDto } from "../api/concoursApi";
import {
  createCentre,
  createEtablissement,
  createSalle,
  deleteCentre,
  deleteEtablissement,
  deleteSalle,
  fetchCentre,
  fetchCentres,
  updateCentre,
  updateEtablissement,
  updateSalle,
  type CentreDetailDto,
  type CentreListItemDto,
  type EtablissementDetailDto,
  type SalleDto,
} from "../api/lieuxApi";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";

type ModalKind = "centre" | "etablissement" | "salle" | null;

function concoursLabel(numero: string | null, concours: ConcoursDto[]): string {
  if (numero == null || numero === "") return "—";
  const c = concours.find((x) => x.numeroConcours === numero);
  return c ? `${c.nomConcours} (${numero})` : numero;
}

function formatConcoursNumeros(numeros: string[], concours: ConcoursDto[]): string {
  if (!numeros.length) return "—";
  return numeros.map((num) => concoursLabel(num, concours)).join(", ");
}

export default function LieuxPage() {
  const { state } = useAuth();

  const [centres, setCentres] = useState<CentreListItemDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CentreDetailDto | null>(null);
  const [concoursList, setConcoursList] = useState<ConcoursDto[]>([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [saving, setSaving] = useState(false);

  const [centreNom, setCentreNom] = useState("");
  const [editingCentreId, setEditingCentreId] = useState<number | null>(null);

  const [etabNom, setEtabNom] = useState("");
  const [editingEtab, setEditingEtab] = useState<EtablissementDetailDto | null>(null);
  const [etabCentreId, setEtabCentreId] = useState<number | null>(null);

  const [salleNom, setSalleNom] = useState("");
  const [sallePlaces, setSallePlaces] = useState("30");
  const [salleConcoursId, setSalleConcoursId] = useState("");
  const [editingSalle, setEditingSalle] = useState<SalleDto | null>(null);
  const [salleEtabId, setSalleEtabId] = useState<number | null>(null);

  const loadCentres = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await fetchCentres();
      setCentres(data);
      return data;
    } catch (e) {
      setCentres(null);
      if (axios.isAxiosError(e) && e.code === "ECONNABORTED") {
        setListError("Délai dépassé : redémarrez concours-service (8083) et lieux-service (8084), puis rechargez la page.");
      } else if (axios.isAxiosError(e) && !e.response) {
        setListError("Impossible de joindre lieux-service (port 8084 ou proxy Vite).");
      } else {
        setListError(e instanceof Error ? e.message : "Erreur de chargement des centres.");
      }
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setActionError(null);
    try {
      const d = await fetchCentre(id);
      setDetail(d);
      setSelectedId(id);
    } catch (e) {
      setDetail(null);
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setActionError("Centre introuvable.");
        setSelectedId(null);
      } else {
        setActionError(e instanceof Error ? e.message : "Erreur de chargement du centre.");
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await loadCentres();
      try {
        const concours = await fetchConcours();
        setConcoursList(concours);
      } catch {
        setConcoursList([]);
      }
      if (list.length > 0) {
        await loadDetail(list[0].idCentre);
      }
    })();
  }, [loadCentres, loadDetail]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { user } = state;
  const readOnly = user.role === "ADMINISTRATEUR";

  async function refreshAll(keepId?: number | null) {
    const list = await loadCentres();
    const id = keepId ?? selectedId;
    if (id != null && list.some((c) => c.idCentre === id)) {
      await loadDetail(id);
    } else if (list.length > 0) {
      await loadDetail(list[0].idCentre);
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }

  function selectCentre(id: number) {
    if (id === selectedId && detail) return;
    void loadDetail(id);
  }

  function closeModal() {
    setModal(null);
    setSaving(false);
    setEditingCentreId(null);
    setEditingEtab(null);
    setEditingSalle(null);
  }

  function openCreateCentre() {
    setActionError(null);
    setEditingCentreId(null);
    setCentreNom("");
    setModal("centre");
  }

  function openEditCentre() {
    if (!detail) return;
    setActionError(null);
    setEditingCentreId(detail.idCentre);
    setCentreNom(detail.nomCentre);
    setModal("centre");
  }

  function openCreateEtab() {
    if (!detail) return;
    setActionError(null);
    setEditingEtab(null);
    setEtabCentreId(detail.idCentre);
    setEtabNom("");
    setModal("etablissement");
  }

  function openEditEtab(etab: EtablissementDetailDto) {
    setActionError(null);
    setEditingEtab(etab);
    setEtabCentreId(null);
    setEtabNom(etab.nomEtablissement);
    setModal("etablissement");
  }

  function openCreateSalle(etab: EtablissementDetailDto) {
    setActionError(null);
    setEditingSalle(null);
    setSalleEtabId(etab.idEtablissement);
    setSalleNom("");
    setSallePlaces("30");
    setSalleConcoursId("");
    setModal("salle");
  }

  function openEditSalle(salle: SalleDto) {
    setActionError(null);
    setEditingSalle(salle);
    setSalleEtabId(null);
    setSalleNom(salle.nomSalle);
    setSallePlaces(String(salle.nombrePlaces));
    setSalleConcoursId(salle.numeroConcours ?? "");
    setModal("salle");
  }

  async function handleCentreSubmit(e: FormEvent) {
    e.preventDefault();
    const nom = centreNom.trim();
    if (!nom) {
      setActionError("Indiquez le nom du centre.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      if (editingCentreId == null) {
        const created = await createCentre({ nomCentre: nom });
        closeModal();
        await loadCentres();
        await loadDetail(created.idCentre);
      } else {
        await updateCentre(editingCentreId, { nomCentre: nom });
        closeModal();
        await refreshAll(editingCentreId);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setActionError("Un centre avec ce nom existe déjà.");
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Modification réservée au gestionnaire.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l’enregistrement du centre.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEtabSubmit(e: FormEvent) {
    e.preventDefault();
    const nom = etabNom.trim();
    if (!nom) {
      setActionError("Indiquez le nom de l’établissement.");
      return;
    }
    if (editingEtab == null && etabCentreId == null) {
      setActionError("Centre non sélectionné.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const centreId = editingEtab == null ? etabCentreId : selectedId;
      if (editingEtab == null) {
        await createEtablissement(etabCentreId!, { nomEtablissement: nom });
      } else {
        await updateEtablissement(editingEtab.idEtablissement, { nomEtablissement: nom });
      }
      closeModal();
      if (centreId != null) {
        await loadDetail(centreId);
        await loadCentres();
      } else {
        await refreshAll(selectedId);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setActionError("Un établissement avec ce nom existe déjà dans ce centre.");
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Modification réservée au gestionnaire.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l’enregistrement de l’établissement.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSalleSubmit(e: FormEvent) {
    e.preventDefault();
    const nom = salleNom.trim();
    const places = Number(sallePlaces);
    if (!nom) {
      setActionError("Indiquez le nom de la salle.");
      return;
    }
    if (!Number.isInteger(places) || places < 1) {
      setActionError("Le nombre de places doit être un entier ≥ 1.");
      return;
    }
    const numeroConcours = salleConcoursId.trim() || null;
    if (editingSalle == null && salleEtabId == null) {
      setActionError("Établissement non sélectionné.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const payload = { nomSalle: nom, nombrePlaces: places, numeroConcours };
      if (editingSalle == null) {
        await createSalle(salleEtabId!, payload);
      } else {
        await updateSalle(editingSalle.idSalle, payload);
      }
      closeModal();
      await refreshAll(selectedId);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        const msg =
          typeof err.response.data === "object" && err.response.data && "message" in err.response.data
            ? String((err.response.data as { message: string }).message)
            : "Données invalides (concours ou capacité).";
        setActionError(msg);
      } else if (axios.isAxiosError(err) && err.response?.status === 409) {
        setActionError("Une salle avec ce nom existe déjà dans cet établissement.");
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Modification réservée au gestionnaire.");
      } else if (axios.isAxiosError(err) && err.response?.status === 502) {
        setActionError("Service concours indisponible pour valider le concours.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de l’enregistrement de la salle.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCentre() {
    if (!detail) return;
    if (!window.confirm(`Supprimer le centre « ${detail.nomCentre} » et tout son contenu ?`)) return;
    setActionError(null);
    try {
      await deleteCentre(detail.idCentre);
      setSelectedId(null);
      setDetail(null);
      await refreshAll(null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Suppression réservée au gestionnaire.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la suppression.");
      }
    }
  }

  async function handleDeleteEtab(etab: EtablissementDetailDto) {
    if (!window.confirm(`Supprimer l’établissement « ${etab.nomEtablissement} » et ses salles ?`)) return;
    setActionError(null);
    try {
      await deleteEtablissement(etab.idEtablissement);
      await refreshAll(selectedId);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setActionError("Suppression réservée au gestionnaire.");
      } else {
        setActionError(err instanceof Error ? err.message : "Échec de la suppression.");
      }
    }
  }

  async function handleDeleteSalle(salle: SalleDto) {
    if (!window.confirm(`Supprimer la salle « ${salle.nomSalle} » ?`)) return;
    setActionError(null);
    try {
      await deleteSalle(salle.idSalle);
      await refreshAll(selectedId);
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
        {actionError ? (
          <p role="alert" style={alert}>
            {actionError}
          </p>
        ) : null}

        <div style={layout}>
          <aside style={sidebar}>
            <div style={sidebarToolbar}>
              <h2 style={h2Sidebar}>Centres</h2>
              {!readOnly ? (
                <button type="button" style={btnPrimarySmall} onClick={openCreateCentre} disabled={loadingList}>
                  + Centre
                </button>
              ) : null}
            </div>
            {loadingList ? <p style={muted}>Chargement…</p> : null}
            {!loadingList && listError ? (
              <p role="alert" style={alertSmall}>
                {listError}
              </p>
            ) : null}
            {!loadingList && !listError && centres && centres.length === 0 ? (
              <p style={muted}>Aucun centre. Créez un centre pour commencer.</p>
            ) : null}
            {!loadingList && centres && centres.length > 0 ? (
              <ul style={centreList}>
                {centres.map((c) => (
                  <li key={c.idCentre}>
                    <button
                      type="button"
                      style={selectedId === c.idCentre ? centreItemActive : centreItem}
                      onClick={() => selectCentre(c.idCentre)}
                    >
                      <span style={centreItemName}>{c.nomCentre}</span>
                      <span style={centreItemMeta}>
                        {c.nombreEtablissements} établ.
                        {c.concoursNumeros.length ? ` · ${c.concoursNumeros.length} concours` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>

          <section style={detailPanel}>
            {loadingDetail ? <p style={muted}>Chargement du centre…</p> : null}
            {!loadingDetail && !detail && !loadingList ? (
              <p style={muted}>Sélectionnez ou créez un centre.</p>
            ) : null}
            {!loadingDetail && detail ? (
              <>
                <div style={detailHeader}>
                  <div>
                    <h2 style={h2Detail}>{detail.nomCentre}</h2>
                    <p style={detailMeta}>
                      ID {detail.idCentre} · Concours liés : {formatConcoursNumeros(detail.concoursNumeros, concoursList)}
                    </p>
                  </div>
                  {!readOnly ? (
                    <div style={detailActions}>
                      <button type="button" style={btnGhost} onClick={openEditCentre}>
                        Modifier
                      </button>
                      <button type="button" style={btnDangerOutline} onClick={() => void handleDeleteCentre()}>
                        Supprimer
                      </button>
                      <button type="button" style={btnPrimary} onClick={openCreateEtab}>
                        + Établissement
                      </button>
                    </div>
                  ) : null}
                </div>

                {detail.etablissements.length === 0 ? (
                  <p style={muted}>Aucun établissement dans ce centre.</p>
                ) : null}

                {detail.etablissements.map((etab) => (
                  <article key={etab.idEtablissement} style={etabCard}>
                    <div style={etabHeader}>
                      <div>
                        <h3 style={h3}>{etab.nomEtablissement}</h3>
                        <span style={etabMeta}>
                          ID {etab.idEtablissement} · Concours : {formatConcoursNumeros(etab.concoursNumeros, concoursList)}
                        </span>
                      </div>
                      {!readOnly ? (
                        <div style={etabActions}>
                          <button type="button" style={btnLink} onClick={() => openCreateSalle(etab)}>
                            + Salle
                          </button>
                          <button type="button" style={btnLink} onClick={() => openEditEtab(etab)}>
                            Modifier
                          </button>
                          <button type="button" style={btnDanger} onClick={() => void handleDeleteEtab(etab)}>
                            Supprimer
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {etab.salles.length === 0 ? (
                      <p style={mutedSmall}>Aucune salle.</p>
                    ) : (
                      <div style={tableWrap}>
                        <table style={table}>
                          <thead>
                            <tr>
                              <th style={th}>Salle</th>
                              <th style={th}>Places</th>
                              <th style={th}>Concours</th>
                              {!readOnly ? <th style={thActions}>Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {etab.salles.map((s) => (
                              <tr key={s.idSalle}>
                                <td style={td}>{s.nomSalle}</td>
                                <td style={td}>{s.nombrePlaces}</td>
                                <td style={td}>{concoursLabel(s.numeroConcours, concoursList)}</td>
                                {!readOnly ? (
                                  <td style={tdActions}>
                                    <button type="button" style={btnLink} onClick={() => openEditSalle(s)}>
                                      Modifier
                                    </button>
                                    <button type="button" style={btnDanger} onClick={() => void handleDeleteSalle(s)}>
                                      Supprimer
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))}
              </>
            ) : null}
          </section>
        </div>
      </main>

      {modal === "centre" ? (
        <div style={modalBackdrop} role="presentation" onClick={closeModal}>
          <div
            style={modalPanel}
            role="dialog"
            aria-labelledby="modal-centre-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-centre-title" style={modalTitle}>
              {editingCentreId == null ? "Nouveau centre" : "Modifier le centre"}
            </h2>
            <form onSubmit={(e) => void handleCentreSubmit(e)}>
              <label style={labelFull}>
                Nom du centre (ville / pôle)
                <input
                  style={input}
                  value={centreNom}
                  onChange={(e) => setCentreNom(e.target.value)}
                  placeholder="Ex. Centre Rabat"
                  maxLength={200}
                  required
                />
              </label>
              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={closeModal} disabled={saving}>
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

      {modal === "etablissement" ? (
        <div style={modalBackdrop} role="presentation" onClick={closeModal}>
          <div
            style={modalPanel}
            role="dialog"
            aria-labelledby="modal-etab-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-etab-title" style={modalTitle}>
              {editingEtab == null ? "Nouvel établissement" : "Modifier l’établissement"}
            </h2>
            <form onSubmit={(e) => void handleEtabSubmit(e)}>
              <label style={labelFull}>
                Nom de l’établissement
                <input
                  style={input}
                  value={etabNom}
                  onChange={(e) => setEtabNom(e.target.value)}
                  maxLength={200}
                  required
                />
              </label>
              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={closeModal} disabled={saving}>
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

      {modal === "salle" ? (
        <div style={modalBackdrop} role="presentation" onClick={closeModal}>
          <div style={modalPanel} role="dialog" aria-labelledby="modal-salle-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="modal-salle-title" style={modalTitle}>
              {editingSalle == null ? "Nouvelle salle" : "Modifier la salle"}
            </h2>
            <form onSubmit={(e) => void handleSalleSubmit(e)}>
              <div style={formGrid}>
                <label style={label}>
                  Nom de la salle
                  <input
                    style={input}
                    value={salleNom}
                    onChange={(e) => setSalleNom(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label style={label}>
                  Nombre de places
                  <input
                    style={input}
                    type="number"
                    min={1}
                    max={1000000}
                    value={sallePlaces}
                    onChange={(e) => setSallePlaces(e.target.value)}
                    required
                  />
                </label>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  Concours (optionnel — un seul concours par salle)
                  <select
                    style={input}
                    value={salleConcoursId}
                    onChange={(e) => setSalleConcoursId(e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {concoursList.map((c) => (
                      <option key={c.numeroConcours} value={c.numeroConcours}>
                        {c.nomConcours}
                        {c.numeroConcours ? ` (${c.numeroConcours})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {concoursList.length === 0 ? (
                <p style={hint}>Créez d’abord des concours pour les associer aux salles.</p>
              ) : null}
              <div style={modalActions}>
                <button type="button" style={btnGhost} onClick={closeModal} disabled={saving}>
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

const btnPrimarySmall: CSSProperties = {
  ...btnPrimary,
  padding: "0.35rem 0.65rem",
  fontSize: "0.8125rem",
};

const btnDangerOutline: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fff",
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

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const alertSmall: CSSProperties = {
  ...alert,
  fontSize: "0.8125rem",
  padding: "0.5rem 0.75rem",
};

const muted: CSSProperties = {
  color: "#64748b",
  margin: 0,
};

const mutedSmall: CSSProperties = {
  ...muted,
  fontSize: "0.8125rem",
  margin: "0.5rem 0 0",
};

const layout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 280px) 1fr",
  gap: "1.25rem",
  alignItems: "start",
};

const sidebar: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "1rem",
};

const sidebarToolbar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  marginBottom: "0.75rem",
};

const h2Sidebar: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 700,
};

const centreList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const centreItem: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.65rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

const centreItemActive: CSSProperties = {
  ...centreItem,
  background: "#eff6ff",
  borderColor: "#bfdbfe",
};

const centreItemName: CSSProperties = {
  fontWeight: 600,
  fontSize: "0.9rem",
  color: "#0f172a",
};

const centreItemMeta: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
};

const detailPanel: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "1.25rem",
  minHeight: "200px",
};

const detailHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.25rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid #f1f5f9",
};

const h2Detail: CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "1.2rem",
};

const detailMeta: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  color: "#64748b",
};

const detailActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  alignItems: "center",
};

const etabCard: CSSProperties = {
  marginTop: "1rem",
  padding: "1rem",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  background: "#fafbfc",
};

const etabHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};

const h3: CSSProperties = {
  margin: "0 0 0.2rem",
  fontSize: "1rem",
};

const etabMeta: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
};

const etabActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.25rem",
  alignItems: "center",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
  background: "#fff",
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
  minWidth: "160px",
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

const modalPanel: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  padding: "1.5rem",
  maxWidth: "520px",
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

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const labelFull: CSSProperties = {
  ...label,
  marginBottom: "0.5rem",
};

const input: CSSProperties = {
  padding: "0.45rem 0.55rem",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem 1rem",
};

const modalActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  marginTop: "1.25rem",
};

const hint: CSSProperties = {
  margin: "0.5rem 0 0",
  fontSize: "0.8rem",
  color: "#64748b",
};
