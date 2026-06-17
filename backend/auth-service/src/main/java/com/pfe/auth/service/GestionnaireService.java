package com.pfe.auth.service;

import com.pfe.auth.domain.RoleUtilisateur;
import com.pfe.auth.domain.Utilisateur;
import com.pfe.auth.dto.GestionnaireCreateRequest;
import com.pfe.auth.dto.GestionnaireResponse;
import com.pfe.auth.dto.GestionnaireUpdateRequest;
import com.pfe.auth.repository.UtilisateurRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Gestion par l'administrateur des comptes ayant le rôle {@link RoleUtilisateur#GESTIONNAIRE}.
 * Seuls ces comptes sont visibles et modifiables via ce service.
 */
@Service
public class GestionnaireService {

    private final UtilisateurRepository utilisateurRepository;
    private final PasswordEncoder passwordEncoder;

    public GestionnaireService(
            UtilisateurRepository utilisateurRepository, PasswordEncoder passwordEncoder) {
        this.utilisateurRepository = utilisateurRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<GestionnaireResponse> lister() {
        return utilisateurRepository
                .findByRoleOrderByNomUtilisateurAsc(RoleUtilisateur.GESTIONNAIRE)
                .stream()
                .map(GestionnaireResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public GestionnaireResponse obtenir(Long id) {
        return GestionnaireResponse.from(charger(id));
    }

    @Transactional
    public GestionnaireResponse creer(GestionnaireCreateRequest request) {
        String username = request.username().trim();
        if (utilisateurRepository.existsByNomUtilisateur(username)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Ce nom d'utilisateur est déjà utilisé.");
        }
        Utilisateur u = new Utilisateur();
        u.setNomUtilisateur(username);
        u.setPasswordHash(passwordEncoder.encode(request.password()));
        u.setRole(RoleUtilisateur.GESTIONNAIRE);
        u.setActif(true);
        u.setCreeLe(Instant.now());
        return GestionnaireResponse.from(utilisateurRepository.save(u));
    }

    @Transactional
    public GestionnaireResponse mettreAJour(Long id, GestionnaireUpdateRequest request) {
        Utilisateur u = charger(id);

        if (request.username() != null && !request.username().isBlank()) {
            String nouveauNom = request.username().trim();
            if (!nouveauNom.equals(u.getNomUtilisateur())
                    && utilisateurRepository.existsByNomUtilisateur(nouveauNom)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "Ce nom d'utilisateur est déjà utilisé.");
            }
            u.setNomUtilisateur(nouveauNom);
        }

        if (request.actif() != null) {
            u.setActif(request.actif());
        }

        if (request.password() != null && !request.password().isBlank()) {
            u.setPasswordHash(passwordEncoder.encode(request.password()));
        }

        return GestionnaireResponse.from(utilisateurRepository.save(u));
    }

    @Transactional
    public void supprimer(Long id) {
        Utilisateur u = charger(id);
        utilisateurRepository.delete(u);
    }

    private Utilisateur charger(Long id) {
        Utilisateur u =
                utilisateurRepository
                        .findById(id)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Gestionnaire introuvable."));
        if (u.getRole() != RoleUtilisateur.GESTIONNAIRE) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Gestionnaire introuvable.");
        }
        return u;
    }
}
