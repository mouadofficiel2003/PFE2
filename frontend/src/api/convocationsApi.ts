import { apiClient } from "./httpClient";

export type EnvoiStatut = "ENVOYE" | "ECHEC";

export type Convocation = {
  numeroInscription: string;
  nom: string;
  prenom: string;
  email: string | null;
  numeroConcours: string | null;
  nomConcours: string | null;
  nomCentre: string | null;
  nomEtablissement: string | null;
  nomSalle: string | null;
  dateHeureExamen: string | null;
  numeroPlace: number | null;
};

export type EnvoiDetail = {
  numeroInscription: string;
  candidatNom: string;
  email: string | null;
  statut: EnvoiStatut | string;
  message: string | null;
};

export type EnvoiResult = {
  total: number;
  envoyes: number;
  echecs: number;
  lanceLe: string;
  details: EnvoiDetail[];
};

export type EnvoiHistorique = {
  id: number;
  numeroInscription: string;
  candidatNom: string | null;
  email: string | null;
  numeroConcours: string | null;
  nomConcours: string | null;
  statut: EnvoiStatut | string;
  message: string | null;
  declenchePar: string | null;
  envoyeLe: string;
};

export async function fetchConvocations(): Promise<Convocation[]> {
  const { data } = await apiClient.get<Convocation[]>("/api/convocations");
  return data;
}

export async function envoyerToutesConvocations(): Promise<EnvoiResult> {
  // L'envoi groupé (un e-mail SMTP par candidat) peut durer bien plus que le timeout
  // par défaut (20 s) : on laisse jusqu'à 5 min pour cette requête uniquement.
  const { data } = await apiClient.post<EnvoiResult>("/api/convocations/envoyer", null, {
    timeout: 300_000,
  });
  return data;
}

export async function fetchEnvois(): Promise<EnvoiHistorique[]> {
  const { data } = await apiClient.get<EnvoiHistorique[]>("/api/convocations/envois");
  return data;
}

export type ReinitialisationEnvoisResult = {
  supprimes: number;
};

export async function reinitialiserHistoriqueEnvois(): Promise<ReinitialisationEnvoisResult> {
  const { data } = await apiClient.post<ReinitialisationEnvoisResult>(
    "/api/convocations/envois/reinitialiser",
  );
  return data;
}

/** Récupère le PDF d'une convocation (avec JWT) sous forme de Blob. */
export async function fetchConvocationPdf(numeroInscription: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(
    `/api/convocations/${encodeURIComponent(numeroInscription)}/pdf`,
    { responseType: "blob" },
  );
  return data;
}
