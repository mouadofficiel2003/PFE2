package com.pfe.auth.dto;

import jakarta.validation.constraints.Size;

/**
 * Mise à jour partielle d'un gestionnaire. Tous les champs sont optionnels : seuls les champs non
 * nuls sont appliqués. Laisser {@code password} nul/vide conserve le mot de passe existant.
 */
public record GestionnaireUpdateRequest(
        @Size(min = 3, max = 100, message = "Le nom d'utilisateur doit contenir entre 3 et 100 caractères")
                String username,
        Boolean actif,
        @Size(min = 8, max = 100, message = "Le mot de passe doit contenir au moins 8 caractères")
                String password) {}
