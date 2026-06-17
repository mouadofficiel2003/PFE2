package com.pfe.candidats.remote.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Réponse de lieux-service pour GET /api/salles/{id}. Les clés JSON ({@code idSalle},
 * {@code idEtablissement}, {@code idCentre}) diffèrent des noms de champs locaux : on les mappe
 * explicitement, sinon Jackson laisse {@code etablissementId}/{@code centreId} à null et la
 * validation d'affectation échoue à tort.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SalleLieuxHeadJson(
        @JsonProperty("idSalle") Long id,
        String nomSalle,
        int nombrePlaces,
        String numeroConcours,
        @JsonProperty("idEtablissement") Long etablissementId,
        String nomEtablissement,
        @JsonProperty("idCentre") Long centreId,
        String nomCentre) {}
