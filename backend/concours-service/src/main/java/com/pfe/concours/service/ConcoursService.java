package com.pfe.concours.service;

import com.pfe.concours.domain.Concours;
import com.pfe.concours.domain.ConcoursAffectationCentre;
import com.pfe.concours.lieux.LieuxCentreClient;
import com.pfe.concours.repository.ConcoursRepository;
import com.pfe.concours.support.HttpRequestContext;
import com.pfe.concours.web.dto.CentreAffectationRequest;
import com.pfe.concours.web.dto.CentreAffectationResponse;
import com.pfe.concours.web.dto.ConcoursHeadResponse;
import com.pfe.concours.web.dto.ConcoursResponse;
import com.pfe.concours.web.dto.ConcoursWriteRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConcoursService {

    private final ConcoursRepository concoursRepository;
    private final LieuxCentreClient lieuxCentreClient;

    public ConcoursService(ConcoursRepository concoursRepository, LieuxCentreClient lieuxCentreClient) {
        this.concoursRepository = concoursRepository;
        this.lieuxCentreClient = lieuxCentreClient;
    }

    @Transactional(readOnly = true)
    public List<ConcoursResponse> listerTous() {
        return concoursRepository.findAllWithAffectationsOrderByDateDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Concours planifiés dans un centre (affectations avec {@code id_centre}).
     * Pas d'appel HTTP vers lieux-service : évite un deadlock avec {@code GET /api/centres}
     * (lieux appelle ce endpoint pendant la liste des centres).
     */
    @Transactional(readOnly = true)
    public List<ConcoursHeadResponse> listerEnTeteParCentre(Long idCentre) {
        return concoursRepository.findDistinctByAffectationIdCentre(idCentre).stream()
                .map(c -> new ConcoursHeadResponse(c.getNumeroConcours(), c.getNomConcours()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ConcoursResponse obtenir(String numeroConcours) {
        Concours c = concoursRepository
                .findByIdWithAffectations(numeroConcours.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concours introuvable"));
        return toResponse(c);
    }

    @Transactional
    public ConcoursResponse creer(ConcoursWriteRequest req) {
        validerCentresDistincts(req.centres());
        validerCentresExistantsDansLieux(req.centres());
        String numero = req.numeroConcours().trim();
        if (concoursRepository.existsById(numero)) {
            throw conflictNumeroConcours();
        }
        Instant now = Instant.now();
        Concours c = new Concours();
        c.setNumeroConcours(numero);
        c.setNomConcours(req.nomConcours().trim());
        c.setDateHeureExamen(req.dateHeureExamen());
        c.setCreeLe(now);
        c.setModifieLe(now);
        c.setAffectationsCentres(mapAffectations(req.centres()));
        c.lierAffectations();
        try {
            return toResponse(concoursRepository.save(c));
        } catch (DataIntegrityViolationException e) {
            throw conflictNumeroConcours();
        }
    }

    @Transactional
    public ConcoursResponse mettreAJour(String numeroConcours, ConcoursWriteRequest req) {
        validerCentresDistincts(req.centres());
        validerCentresExistantsDansLieux(req.centres());
        String pathNumero = numeroConcours.trim();
        String bodyNumero = req.numeroConcours().trim();
        if (!pathNumero.equals(bodyNumero)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Le numéro de concours ne peut pas être modifié (supprimez et recréez).");
        }
        Concours c = concoursRepository
                .findByIdWithAffectations(pathNumero)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concours introuvable"));
        c.setNomConcours(req.nomConcours().trim());
        c.setDateHeureExamen(req.dateHeureExamen());
        c.setModifieLe(Instant.now());
        remplacerAffectations(c, req.centres());
        return toResponse(concoursRepository.save(c));
    }

    /**
     * Ajoute un centre aux affectations d'un concours s'il n'y figure pas déjà (idempotent).
     * Appelé par lieux-service quand une salle est rattachée à ce concours, afin que le centre
     * apparaisse dans la liste des concours. Ne retire jamais de centre (la liste reste pilotée
     * manuellement via le formulaire concours).
     */
    @Transactional
    public ConcoursResponse ajouterAffectation(String numeroConcours, CentreAffectationRequest req) {
        Concours c = concoursRepository
                .findByIdWithAffectations(numeroConcours.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concours introuvable"));
        boolean dejaPresent = c.getAffectationsCentres().stream()
                .anyMatch(a -> a.getIdCentre().equals(req.idCentre()));
        if (!dejaPresent) {
            ConcoursAffectationCentre a = new ConcoursAffectationCentre();
            a.setIdCentre(req.idCentre());
            a.setNomCentre(req.nomCentre().trim());
            a.setConcours(c);
            c.getAffectationsCentres().add(a);
            c.setModifieLe(Instant.now());
            try {
                return toResponse(concoursRepository.save(c));
            } catch (DataIntegrityViolationException e) {
                // Centre déjà lié (uq_concours_affectation_nom) : on reste idempotent.
            }
        }
        return toResponse(c);
    }

    /**
     * Propage le renommage d'un centre (lieux-service) sur toutes les affectations qui le référencent,
     * car {@code nom_centre} est une copie dénormalisée. Retourne le nombre d'affectations mises à jour.
     */
    @Transactional
    public int renommerCentre(Long idCentre, String nouveauNom) {
        if (idCentre == null || nouveauNom == null || nouveauNom.isBlank()) {
            return 0;
        }
        return concoursRepository.renommerCentre(idCentre, nouveauNom.trim());
    }

    @Transactional
    public void supprimer(String numeroConcours) {
        String numero = numeroConcours.trim();
        if (!concoursRepository.existsById(numero)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Concours introuvable");
        }
        concoursRepository.deleteById(numero);
    }

    private static void validerCentresDistincts(List<CentreAffectationRequest> centres) {
        Set<Long> vus = new HashSet<>();
        for (CentreAffectationRequest a : centres) {
            if (!vus.add(a.idCentre())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Liste des centres : doublon sur id_centre « " + a.idCentre() + " »");
            }
        }
    }

    /** Vérifie que chaque {@code idCentre} existe dans lieux-service (même JWT que l'appelant). */
    private void validerCentresExistantsDansLieux(List<CentreAffectationRequest> centres) {
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        Set<Long> idsDistincts =
                centres.stream().map(CentreAffectationRequest::idCentre).collect(Collectors.toSet());
        for (Long idCentre : idsDistincts) {
            lieuxCentreClient.assertCentreExists(idCentre, auth);
        }
    }

    private static ResponseStatusException conflictNumeroConcours() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Ce numéro de concours est déjà utilisé");
    }

    /**
     * Met à jour les affectations sans {@code clear()} + {@code addAll()} : Hibernate insérerait les nouvelles
     * lignes avant de supprimer les anciennes, ce qui viole {@code uq_concours_affectation_centre}.
     */
    private static void remplacerAffectations(Concours c, List<CentreAffectationRequest> centres) {
        Set<Long> idsDemandes =
                centres.stream().map(CentreAffectationRequest::idCentre).collect(Collectors.toSet());
        c.getAffectationsCentres().removeIf(a -> !idsDemandes.contains(a.getIdCentre()));

        Map<Long, ConcoursAffectationCentre> existantes = c.getAffectationsCentres().stream()
                .collect(Collectors.toMap(ConcoursAffectationCentre::getIdCentre, a -> a));

        for (CentreAffectationRequest r : centres) {
            ConcoursAffectationCentre existante = existantes.get(r.idCentre());
            if (existante != null) {
                existante.setNomCentre(r.nomCentre().trim());
            } else {
                ConcoursAffectationCentre nouvelle = new ConcoursAffectationCentre();
                nouvelle.setIdCentre(r.idCentre());
                nouvelle.setNomCentre(r.nomCentre().trim());
                nouvelle.setConcours(c);
                c.getAffectationsCentres().add(nouvelle);
            }
        }
    }

    private static List<ConcoursAffectationCentre> mapAffectations(List<CentreAffectationRequest> centres) {
        List<ConcoursAffectationCentre> list = new ArrayList<>();
        for (CentreAffectationRequest r : centres) {
            ConcoursAffectationCentre a = new ConcoursAffectationCentre();
            a.setIdCentre(r.idCentre());
            a.setNomCentre(r.nomCentre().trim());
            list.add(a);
        }
        return list;
    }

    private ConcoursResponse toResponse(Concours c) {
        List<CentreAffectationResponse> centres =
                c.getAffectationsCentres().stream()
                        .map(a -> new CentreAffectationResponse(a.getId(), a.getIdCentre(), a.getNomCentre()))
                        .toList();
        return new ConcoursResponse(
                c.getNumeroConcours(),
                c.getNomConcours(),
                c.getDateHeureExamen(),
                centres,
                c.getCreeLe(),
                c.getModifieLe());
    }
}
