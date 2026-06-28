import { apiClient } from "./httpClient";

export type CentreListItemDto = {
  idCentre: number;
  nomCentre: string;
  nombreEtablissements: number;
  concoursNumeros: string[];
};

export type SalleDto = {
  idSalle: number;
  nomSalle: string;
  nombrePlaces: number;
  numeroConcours: string | null;
};

export type SalleAvecLieuxDto = {
  idSalle: number;
  nomSalle: string;
  nombrePlaces: number;
  numeroConcours: string | null;
  idEtablissement: number;
  nomEtablissement: string;
  idCentre: number;
  nomCentre: string;
};

export type EtablissementDetailDto = {
  idEtablissement: number;
  nomEtablissement: string;
  concoursNumeros: string[];
  salles: SalleDto[];
};

export type CentreDetailDto = {
  idCentre: number;
  nomCentre: string;
  concoursNumeros: string[];
  etablissements: EtablissementDetailDto[];
};

export type CentreNomPayload = { nomCentre: string };
export type EtablissementNomPayload = { nomEtablissement: string };
export type SalleWritePayload = {
  nomSalle: string;
  nombrePlaces: number;
  numeroConcours: string | null;
};

export async function fetchCentres(): Promise<CentreListItemDto[]> {
  const { data } = await apiClient.get<CentreListItemDto[]>("/api/centres");
  return data;
}

export async function fetchCentre(idCentre: number): Promise<CentreDetailDto> {
  const { data } = await apiClient.get<CentreDetailDto>(`/api/centres/${idCentre}`);
  return data;
}

export async function createCentre(payload: CentreNomPayload): Promise<CentreDetailDto> {
  const { data } = await apiClient.post<CentreDetailDto>("/api/centres", payload);
  return data;
}

export async function updateCentre(idCentre: number, payload: CentreNomPayload): Promise<CentreDetailDto> {
  const { data } = await apiClient.put<CentreDetailDto>(`/api/centres/${idCentre}`, payload);
  return data;
}

export async function deleteCentre(idCentre: number): Promise<void> {
  await apiClient.delete(`/api/centres/${idCentre}`);
}

export async function createEtablissement(
  centreId: number,
  payload: EtablissementNomPayload,
): Promise<EtablissementDetailDto> {
  const { data } = await apiClient.post<EtablissementDetailDto>(
    `/api/centres/${centreId}/etablissements`,
    payload,
  );
  return data;
}

export async function updateEtablissement(
  idEtablissement: number,
  payload: EtablissementNomPayload,
): Promise<EtablissementDetailDto> {
  const { data } = await apiClient.put<EtablissementDetailDto>(
    `/api/etablissements/${idEtablissement}`,
    payload,
  );
  return data;
}

export async function deleteEtablissement(idEtablissement: number): Promise<void> {
  await apiClient.delete(`/api/etablissements/${idEtablissement}`);
}

export async function createSalle(
  etablissementId: number,
  payload: SalleWritePayload,
): Promise<SalleDto> {
  const { data } = await apiClient.post<SalleDto>(
    `/api/etablissements/${etablissementId}/salles`,
    payload,
  );
  return data;
}

export async function updateSalle(idSalle: number, payload: SalleWritePayload): Promise<SalleDto> {
  const { data } = await apiClient.put<SalleDto>(`/api/salles/${idSalle}`, payload);
  return data;
}

export async function deleteSalle(idSalle: number): Promise<void> {
  await apiClient.delete(`/api/salles/${idSalle}`);
}

export async function fetchSallesByConcours(numeroConcours: string): Promise<SalleAvecLieuxDto[]> {
  const { data } = await apiClient.get<SalleAvecLieuxDto[]>("/api/salles", {
    params: { numeroConcours },
  });
  return data;
}
