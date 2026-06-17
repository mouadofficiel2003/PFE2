package com.pfe.repartition.web.dto;

/**
 * Résultat d'une réinitialisation de la répartition : nombre de candidats dont l'affectation
 * (centre / établissement / salle / place) a été remise à zéro.
 */
public record ReinitialisationResponse(int candidatsReinitialises) {}
