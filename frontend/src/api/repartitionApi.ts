import { apiClient } from "./httpClient";



export type RepartitionStatut = "TERMINEE" | "TERMINEE_AVEC_ALERTES" | "ECHEC";



export type AlerteType =

  | "CAPACITE_DEPASSEE"

  | "AUCUN_CENTRE_DISPONIBLE"

  | "CONCOURS_INCONNU"

  | "VILLE_NON_GEOLOCALISEE";



export type RepartitionRunSummary = {

  id: number;

  declenchePar: string;

  statut: RepartitionStatut;

  totalCandidats: number;

  totalAffectes: number;

  totalAlertes: number;

  demarreLe: string;

  termineLe: string | null;

  message: string | null;

};



export type AffectationDto = {

  numeroInscription: string;

  candidatNom: string;

  ville: string;

  numeroConcours: string | null;

  nomConcours: string;

  idCentre: number | null;

  nomCentre: string;

  idEtablissement: number | null;

  nomEtablissement: string;

  idSalle: number | null;

  nomSalle: string;

  numeroPlace: number | null;

};



export type AlerteDto = {

  type: AlerteType | string;

  numeroInscription: string | null;

  candidatNom: string;

  ville: string;

  numeroConcours: string | null;

  nomConcours: string;

  idCentre: number | null;

  nomCentre: string;

  message: string;

};



export type RepartitionRunDetail = RepartitionRunSummary & {

  affectations: AffectationDto[];

  alertes: AlerteDto[];

};



export async function declencherRepartition(): Promise<RepartitionRunDetail> {

  const { data } = await apiClient.post<RepartitionRunDetail>("/api/repartition/run");

  return data;

}



export async function fetchRuns(): Promise<RepartitionRunSummary[]> {

  const { data } = await apiClient.get<RepartitionRunSummary[]>("/api/repartition/runs");

  return data;

}



export async function fetchRun(id: number): Promise<RepartitionRunDetail> {

  const { data } = await apiClient.get<RepartitionRunDetail>(`/api/repartition/runs/${id}`);

  return data;

}



export type ReinitialisationResult = {

  candidatsReinitialises: number;

};



export async function reinitialiserRepartition(): Promise<ReinitialisationResult> {

  const { data } = await apiClient.post<ReinitialisationResult>("/api/repartition/reset");

  return data;

}



export async function supprimerRun(id: number): Promise<void> {

  await apiClient.delete(`/api/repartition/runs/${id}`);

}

