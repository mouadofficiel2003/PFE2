import { apiClient } from "./httpClient";
import type { RoleUtilisateur } from "../auth/types";

export type GestionnaireDto = {
  id: number;
  username: string;
  role: RoleUtilisateur;
  actif: boolean;
  creeLe: string;
};

export type GestionnaireCreatePayload = {
  username: string;
  password: string;
};

export type GestionnaireUpdatePayload = {
  username?: string;
  actif?: boolean;
  password?: string;
};

export async function fetchGestionnaires(): Promise<GestionnaireDto[]> {
  const { data } = await apiClient.get<GestionnaireDto[]>("/auth/gestionnaires");
  return data;
}

export async function createGestionnaire(
  payload: GestionnaireCreatePayload,
): Promise<GestionnaireDto> {
  const { data } = await apiClient.post<GestionnaireDto>("/auth/gestionnaires", payload);
  return data;
}

export async function updateGestionnaire(
  id: number,
  payload: GestionnaireUpdatePayload,
): Promise<GestionnaireDto> {
  const { data } = await apiClient.put<GestionnaireDto>(`/auth/gestionnaires/${id}`, payload);
  return data;
}

export async function deleteGestionnaire(id: number): Promise<void> {
  await apiClient.delete(`/auth/gestionnaires/${id}`);
}
