package com.pfe.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GestionnaireCreateRequest(
        @NotBlank(message = "Le nom d'utilisateur est obligatoire")
                @Size(min = 3, max = 100, message = "Le nom d'utilisateur doit contenir entre 3 et 100 caractères")
                String username,
        @NotBlank(message = "Le mot de passe est obligatoire")
                @Size(min = 8, max = 100, message = "Le mot de passe doit contenir au moins 8 caractères")
                String password) {}
