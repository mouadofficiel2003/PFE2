package com.pfe.auth.dto;

import com.pfe.auth.domain.RoleUtilisateur;
import com.pfe.auth.domain.Utilisateur;
import java.time.Instant;

public record GestionnaireResponse(
        Long id, String username, RoleUtilisateur role, boolean actif, Instant creeLe) {

    public static GestionnaireResponse from(Utilisateur u) {
        return new GestionnaireResponse(
                u.getId(), u.getNomUtilisateur(), u.getRole(), u.isActif(), u.getCreeLe());
    }
}
