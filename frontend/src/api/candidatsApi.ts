import { apiClient } from "./httpClient";



/** Même forme que la réponse JSON GET /api/candidats (camelCase, candidat-service). */

export type CandidatDto = {

  numeroInscription: string;

  nom: string;

  prenom: string;

  cin: string;

  numeroTelephone: string;

  ville: string;

  age: number;

  email: string;

  specialite: string;

  nomConcours: string;

  numeroConcours: string | null;

  idCentre: number | null;

  idEtablissement: number | null;

  idSalle: number | null;

  numeroPlace: number | null;

  creeLe: string;

  modifieLe: string;

};

/** Affectation complète (centre, établissement, salle et place) — même règle que convocation-service. */
export function isCandidatAffecte(c: CandidatDto): boolean {
  return c.idCentre != null && c.idEtablissement != null && c.idSalle != null && c.numeroPlace != null;
}

export type CandidatUpdatePayload = {

  nom: string;

  prenom: string;

  cin: string;

  numeroTelephone: string;

  ville: string;

  age: number;

  email: string;

  specialite: string;

  numeroInscription: string;

  nomConcours: string;

  numeroConcours: string | null;

  idCentre: number | null;

  idEtablissement: number | null;

  idSalle: number | null;

  numeroPlace: number | null;

};



export type ImportCandidatsResult = {

  inserted: number;

  updated: number;

  skipped: number;

  errors: { rowNumber: number; message: string }[];

};



export async function fetchCandidats(): Promise<CandidatDto[]> {

  const { data } = await apiClient.get<CandidatDto[]>("/api/candidats");

  return data;

}



export async function updateCandidat(

  numeroInscription: string,

  payload: CandidatUpdatePayload,

): Promise<CandidatDto> {

  const { data } = await apiClient.put<CandidatDto>(

    `/api/candidats/${encodeURIComponent(numeroInscription)}`,

    payload,

  );

  return data;

}



export async function deleteCandidat(numeroInscription: string): Promise<void> {

  await apiClient.delete(`/api/candidats/${encodeURIComponent(numeroInscription)}`);

}



export async function importCandidatsExcel(file: File): Promise<ImportCandidatsResult> {

  const form = new FormData();

  form.append("file", file);

  const { data } = await apiClient.post<ImportCandidatsResult>("/api/candidats/import", form);

  return data;

}



export type ReinitialisationCandidatsResult = {

  deleted: number;

};



/** Vide entièrement la liste des candidats (DELETE /api/candidats). */

export async function reinitialiserCandidats(): Promise<ReinitialisationCandidatsResult> {

  const { data } = await apiClient.delete<ReinitialisationCandidatsResult>("/api/candidats");

  return data;

}

