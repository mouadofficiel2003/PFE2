import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
  return c ? c.nomConcours : numero;
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

function ConcoursChips({ numeros, concours }: { numeros: string[]; concours: ConcoursDto[] }) {
  if (!numeros.length) {
    return <span style={mutedChip}>Aucun concours lié</span>;
  }
  return (
    <div style={chipRow}>
      {numeros.map((num) => (
        <span key={num} style={concoursChip} title={num}>
          {concoursLabel(num, concours)}
        </span>
      ))}
    </div>
  );
}

function ModalFrame({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div style={modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        style={modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lieux-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={modalHeader}>
          <div>
            <h2 id="lieux-modal-title" style={modalTitle}>
              {title}
            </h2>
            {subtitle ? <p style={modalSubtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={skeletonLine} />
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} aria-hidden="true">
      <div style={{ ...skeletonLine, width: "45%", height: "1.25rem" }} />
      <div style={{ ...skeletonLine, width: "70%" }} />
      <div style={{ ...skeletonLine, width: "100%", height: "5rem", marginTop: "0.5rem" }} />
    </div>
  );
}

function SalleCard({
  salle,
  concours,
  readOnly,
  onEdit,
  onDelete,
}: {
  salle: SalleDto;
  concours: ConcoursDto[];
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const linked = salle.numeroConcours ? concoursLabel(salle.numeroConcours, concours) : null;

  return (
    <div style={salleCard}>
      <div style={salleCardTop}>
        <span style={salleName}>{salle.nomSalle}</span>
        <span style={placesBadge}>{salle.nombrePlaces} places</span>
      </div>
      {linked ? (
        <span style={salleConcoursChip}>{linked}</span>
      ) : (
        <span style={mutedChip}>Sans concours</span>
      )}
      {!readOnly ? (
        <div style={salleActions}>
          <button type="button" style={btnEditSmall} onClick={onEdit}>
            Modifier
          </button>
          <button type="button" style={btnDeleteSmall} onClick={onDelete}>
            Supprimer
          </button>
        </div>
      ) : null}
    </div>
  );
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

  const stats = useMemo(() => {
    const items = centres ?? [];
    const totalEtab = items.reduce((sum, c) => sum + c.nombreEtablissements, 0);
    const linkedConcours = new Set(items.flatMap((c) => c.concoursNumeros)).size;
    const salles =
      detail?.etablissements.reduce((sum, e) => sum + e.salles.length, 0) ?? 0;
    const places =
      detail?.etablissements.reduce(
        (sum, e) => sum + e.salles.reduce((s, sal) => s + sal.nombrePlaces, 0),
        0,
      ) ?? 0;
    return {
      totalCentres: items.length,
      totalEtab,
      linkedConcours,
      selectedSalles: salles,
      selectedPlaces: places,
    };
  }, [centres, detail]);

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
        setActionError(err instanceof Error ? err.message : "Échec de l'enregistrement du centre.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEtabSubmit(e: FormEvent) {
    e.preventDefault();
    const nom = etabNom.trim();
    if (!nom) {
      setActionError("Indiquez le nom de l'établissement.");
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
        setActionError(err instanceof Error ? err.message : "Échec de l'enregistrement de l'établissement.");
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
        setActionError(err instanceof Error ? err.message : "Échec de l'enregistrement de la salle.");
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
    if (!window.confirm(`Supprimer l'établissement « ${etab.nomEtablissement} » et ses salles ?`)) return;
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

  const refreshing = loadingList || loadingDetail;

  return (
    <div style={page}>
      <AppHeader />

      <main style={main}>
        <div style={hero}>
          <div>
            <h1 style={h1}>Lieux</h1>
          </div>
          <div style={heroActions}>
            <button
              type="button"
              style={btnGhost}
              onClick={() => void refreshAll(selectedId)}
              disabled={refreshing}
            >
              {refreshing ? "Actualisation…" : "Actualiser"}
            </button>
            {!readOnly ? (
              <button type="button" style={btnPrimary} onClick={openCreateCentre} disabled={loadingList}>
                + Nouveau centre
              </button>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <p role="alert" style={alert}>
            {actionError}
          </p>
        ) : null}

        {!loadingList && !listError && centres ? (
          <section style={kpiGrid}>
            <KpiCard label="Centres" value={stats.totalCentres} hint="villes / pôles" accent="#0d9488" />
            <KpiCard label="Établissements" value={stats.totalEtab} hint="au total" accent="#2563eb" />
            <KpiCard label="Concours liés" value={stats.linkedConcours} hint="références actives" accent="#7c3aed" />
            {detail ? (
              <KpiCard
                label="Capacité (centre)"
                value={stats.selectedPlaces}
                hint={`${stats.selectedSalles} salle(s) · ${detail.nomCentre}`}
                accent="#d97706"
              />
            ) : null}
          </section>
        ) : null}

        <div style={layout}>
          <aside style={sidebar}>
            <div style={sidebarHeader}>
              <span style={sidebarLabel}>Centres</span>
              <span style={sidebarCount}>{centres?.length ?? 0}</span>
            </div>

            {loadingList ? <SidebarSkeleton /> : null}

            {!loadingList && listError ? (
              <div style={errorBox}>
                <p role="alert" style={errorBoxText}>
                  {listError}
                </p>
                <button type="button" style={btnGhostSmall} onClick={() => void loadCentres()}>
                  Réessayer
                </button>
              </div>
            ) : null}

            {!loadingList && !listError && centres && centres.length === 0 ? (
              <div style={emptySidebar}>
                <span style={emptyIcon} aria-hidden="true">
                  🏢
                </span>
                <p style={emptyText}>Aucun centre</p>
                {!readOnly ? (
                  <button type="button" style={btnPrimarySmall} onClick={openCreateCentre}>
                    Créer un centre
                  </button>
                ) : null}
              </div>
            ) : null}

            {!loadingList && centres && centres.length > 0 ? (
              <ul style={centreNavList}>
                {centres.map((c) => {
                  const active = selectedId === c.idCentre;
                  return (
                    <li key={c.idCentre}>
                      <button
                        type="button"
                        style={active ? centreNavItemActive : centreNavItem}
                        onClick={() => selectCentre(c.idCentre)}
                      >
                        <span style={centreNavIcon} aria-hidden="true">
                          📍
                        </span>
                        <span style={centreNavContent}>
                          <span style={centreNavName}>{c.nomCentre}</span>
                          <span style={centreNavMeta}>
                            {c.nombreEtablissements} établ.
                            {c.concoursNumeros.length ? ` · ${c.concoursNumeros.length} concours` : ""}
                          </span>
                        </span>
                        {active ? <span style={activeDot} aria-hidden="true" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </aside>

          <section style={detailPanel}>
            {loadingDetail ? <DetailSkeleton /> : null}

            {!loadingDetail && !detail && !loadingList && !listError ? (
              <div style={emptyDetail}>
                <span style={emptyIcon} aria-hidden="true">
                  🗺️
                </span>
                <h2 style={emptyTitle}>Sélectionnez un centre</h2>
                <p style={emptyDesc}>Choisissez un centre dans la liste ou créez-en un nouveau pour commencer.</p>
                {!readOnly && centres && centres.length === 0 ? (
                  <button type="button" style={btnPrimary} onClick={openCreateCentre}>
                    Créer un centre
                  </button>
                ) : null}
              </div>
            ) : null}

            {!loadingDetail && detail ? (
              <>
                <div style={detailHero}>
                  <div style={detailHeroMain}>
                    <span style={detailBadge}>Centre #{detail.idCentre}</span>
                    <h2 style={h2Detail}>{detail.nomCentre}</h2>
                    <div style={detailStatsRow}>
                      <span style={statPill}>
                        {detail.etablissements.length} établissement{detail.etablissements.length !== 1 ? "s" : ""}
                      </span>
                      <span style={statPill}>
                        {stats.selectedSalles} salle{stats.selectedSalles !== 1 ? "s" : ""}
                      </span>
                      <span style={statPillAccent}>{stats.selectedPlaces} places</span>
                    </div>
                    <div style={concoursSection}>
                      <span style={concoursSectionLabel}>Concours liés</span>
                      <ConcoursChips numeros={detail.concoursNumeros} concours={concoursList} />
                    </div>
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
                  <div style={emptyEtab}>
                    <p style={emptyEtabText}>Aucun établissement dans ce centre.</p>
                    {!readOnly ? (
                      <button type="button" style={btnAddDashed} onClick={openCreateEtab}>
                        + Ajouter un établissement
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div style={etabList}>
                  {detail.etablissements.map((etab) => (
                    <article key={etab.idEtablissement} style={etabCard}>
                      <div style={etabHeader}>
                        <div>
                          <h3 style={h3}>{etab.nomEtablissement}</h3>
                          <span style={etabMeta}>ID {etab.idEtablissement}</span>
                          <ConcoursChips numeros={etab.concoursNumeros} concours={concoursList} />
                        </div>
                        {!readOnly ? (
                          <div style={etabActions}>
                            <button type="button" style={btnAddSmall} onClick={() => openCreateSalle(etab)}>
                              + Salle
                            </button>
                            <button type="button" style={btnEditSmall} onClick={() => openEditEtab(etab)}>
                              Modifier
                            </button>
                            <button type="button" style={btnDeleteSmall} onClick={() => void handleDeleteEtab(etab)}>
                              Supprimer
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {etab.salles.length === 0 ? (
                        <p style={mutedSmall}>Aucune salle — ajoutez une salle pour définir la capacité.</p>
                      ) : (
                        <div style={salleGrid}>
                          {etab.salles.map((s) => (
                            <SalleCard
                              key={s.idSalle}
                              salle={s}
                              concours={concoursList}
                              readOnly={readOnly}
                              onEdit={() => openEditSalle(s)}
                              onDelete={() => void handleDeleteSalle(s)}
                            />
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </main>

      {modal === "centre" ? (
        <ModalFrame
          title={editingCentreId == null ? "Nouveau centre" : "Modifier le centre"}
          subtitle="Un centre représente une ville ou un pôle d'examen."
          onClose={closeModal}
        >
          <form style={modalForm} onSubmit={(e) => void handleCentreSubmit(e)}>
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
        </ModalFrame>
      ) : null}

      {modal === "etablissement" ? (
        <ModalFrame
          title={editingEtab == null ? "Nouvel établissement" : "Modifier l'établissement"}
          subtitle={detail ? `Dans le centre « ${detail.nomCentre} »` : undefined}
          onClose={closeModal}
        >
          <form style={modalForm} onSubmit={(e) => void handleEtabSubmit(e)}>
            <label style={labelFull}>
              Nom de l&apos;établissement
              <input
                style={input}
                value={etabNom}
                onChange={(e) => setEtabNom(e.target.value)}
                placeholder="Ex. Lycée Hassan II"
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
        </ModalFrame>
      ) : null}

      {modal === "salle" ? (
        <ModalFrame
          title={editingSalle == null ? "Nouvelle salle" : "Modifier la salle"}
          subtitle="Définissez la capacité et associez éventuellement un concours."
          onClose={closeModal}
        >
          <form style={modalForm} onSubmit={(e) => void handleSalleSubmit(e)}>
            <div style={formGrid}>
              <label style={label}>
                Nom de la salle
                <input
                  style={input}
                  value={salleNom}
                  onChange={(e) => setSalleNom(e.target.value)}
                  placeholder="Ex. Salle A12"
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
                Concours (optionnel)
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
              <p style={hint}>
                <Link to="/concours" style={inlineLink}>
                  Créez des concours
                </Link>{" "}
                pour les associer aux salles.
              </p>
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
        </ModalFrame>
      ) : null}
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
};

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

const btnGhostSmall: CSSProperties = {
  ...btnGhost,
  padding: "0.35rem 0.65rem",
  fontSize: "0.8125rem",
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

const btnPrimarySmall: CSSProperties = {
  ...btnPrimary,
  padding: "0.35rem 0.75rem",
  fontSize: "0.8125rem",
};

const btnDangerOutline: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
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

const alert: CSSProperties = {
  color: "#b45309",
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  margin: "0 0 1rem",
};

const layout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 280px) 1fr",
  gap: "1.25rem",
  alignItems: "start",
};

const sidebar: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "1rem",
  position: "sticky",
  top: "5rem",
  maxHeight: "calc(100vh - 6rem)",
  overflowY: "auto",
};

const sidebarHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
  paddingBottom: "0.65rem",
  borderBottom: "1px solid #f1f5f9",
};

const sidebarLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const sidebarCount: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#64748b",
  background: "#f1f5f9",
  padding: "0.1rem 0.45rem",
  borderRadius: "999px",
};

const centreNavList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const centreNavItem: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.65rem 0.75rem",
  borderRadius: "10px",
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const centreNavItemActive: CSSProperties = {
  ...centreNavItem,
  background: "linear-gradient(135deg, #eff6ff 0%, #ecfdf5 100%)",
  borderColor: "#bfdbfe",
  boxShadow: "0 1px 3px rgba(37,99,235,0.08)",
};

const centreNavIcon: CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1,
  flexShrink: 0,
};

const centreNavContent: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
  minWidth: 0,
  flex: 1,
};

const centreNavName: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.875rem",
  color: "#0f172a",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const centreNavMeta: CSSProperties = {
  fontSize: "0.72rem",
  color: "#64748b",
};

const activeDot: CSSProperties = {
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: "#2563eb",
  flexShrink: 0,
};

const detailPanel: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "1.25rem",
  minHeight: "280px",
};

const detailHero: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
  padding: "1.15rem",
  borderRadius: "12px",
  background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
  border: "1px solid #e2e8f0",
};

const detailHeroMain: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minWidth: 0,
};

const detailBadge: CSSProperties = {
  alignSelf: "flex-start",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#64748b",
  background: "#fff",
  padding: "0.15rem 0.5rem",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  fontFamily: "ui-monospace, monospace",
};

const h2Detail: CSSProperties = {
  margin: 0,
  fontSize: "1.35rem",
  fontWeight: 800,
  color: "#0f172a",
};

const detailStatsRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const statPill: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#475569",
  background: "#fff",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  border: "1px solid #e2e8f0",
};

const statPillAccent: CSSProperties = {
  ...statPill,
  color: "#b45309",
  background: "#fffbeb",
  borderColor: "#fcd34d",
};

const concoursSection: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginTop: "0.25rem",
};

const concoursSectionLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
};

const concoursChip: CSSProperties = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  background: "#eef2ff",
  color: "#4338ca",
  border: "1px solid #c7d2fe",
  fontSize: "0.72rem",
  fontWeight: 600,
};

const mutedChip: CSSProperties = {
  fontSize: "0.75rem",
  color: "#94a3b8",
  fontStyle: "italic",
};

const detailActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  alignItems: "flex-start",
};

const etabList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const etabCard: CSSProperties = {
  padding: "1.15rem",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
};

const etabHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.85rem",
};

const h3: CSSProperties = {
  margin: "0 0 0.2rem",
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const etabMeta: CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  color: "#94a3b8",
  marginBottom: "0.4rem",
  fontFamily: "ui-monospace, monospace",
};

const etabActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
  alignItems: "center",
};

const salleGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "0.65rem",
};

const salleCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  padding: "0.85rem",
  borderRadius: "10px",
  background: "#fff",
  border: "1px solid #e2e8f0",
};

const salleCardTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const salleName: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.875rem",
  color: "#0f172a",
};

const placesBadge: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#047857",
  background: "#ecfdf5",
  padding: "0.15rem 0.45rem",
  borderRadius: "999px",
  border: "1px solid #a7f3d0",
  whiteSpace: "nowrap",
};

const salleConcoursChip: CSSProperties = {
  alignSelf: "flex-start",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#4338ca",
  background: "#eef2ff",
  padding: "0.15rem 0.45rem",
  borderRadius: "6px",
};

const salleActions: CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  marginTop: "auto",
  paddingTop: "0.35rem",
  borderTop: "1px solid #f1f5f9",
};

const btnEditSmall: CSSProperties = {
  flex: 1,
  padding: "0.3rem 0.5rem",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.75rem",
};

const btnDeleteSmall: CSSProperties = {
  flex: 1,
  padding: "0.3rem 0.5rem",
  borderRadius: "6px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.75rem",
};

const btnAddSmall: CSSProperties = {
  padding: "0.35rem 0.65rem",
  borderRadius: "8px",
  border: "1px dashed #93c5fd",
  background: "#eff6ff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};

const btnAddDashed: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  border: "1px dashed #93c5fd",
  background: "#eff6ff",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
  width: "100%",
};

const mutedSmall: CSSProperties = {
  color: "#64748b",
  fontSize: "0.8125rem",
  margin: 0,
};

const emptySidebar: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "1.5rem 0.5rem",
  gap: "0.5rem",
};

const emptyDetail: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "3rem 1.5rem",
  gap: "0.5rem",
};

const emptyEtab: CSSProperties = {
  textAlign: "center",
  padding: "2rem 1rem",
  marginBottom: "1rem",
  borderRadius: "10px",
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
};

const emptyEtabText: CSSProperties = {
  margin: "0 0 0.75rem",
  color: "#64748b",
  fontSize: "0.9rem",
};

const emptyIcon: CSSProperties = {
  fontSize: "2rem",
};

const emptyText: CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "0.875rem",
};

const emptyTitle: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const emptyDesc: CSSProperties = {
  margin: "0 0 0.75rem",
  color: "#64748b",
  fontSize: "0.9rem",
  maxWidth: "24rem",
};

const errorBox: CSSProperties = {
  padding: "0.75rem",
  borderRadius: "8px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  textAlign: "center",
};

const errorBoxText: CSSProperties = {
  margin: "0 0 0.5rem",
  color: "#b91c1c",
  fontSize: "0.8125rem",
};

const skeletonLine: CSSProperties = {
  height: "2.75rem",
  borderRadius: "10px",
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

const modalPanel: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  maxWidth: "520px",
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

const modalForm: CSSProperties = {
  padding: "1.25rem 1.5rem 1.5rem",
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const labelFull: CSSProperties = {
  ...label,
  marginBottom: "0.5rem",
};

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "0.875rem",
  background: "#fff",
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
  paddingTop: "1rem",
  borderTop: "1px solid #f1f5f9",
};

const hint: CSSProperties = {
  margin: "0.75rem 0 0",
  fontSize: "0.8rem",
  color: "#64748b",
};
