package com.pfe.lieux.service;

import com.pfe.lieux.domain.Centre;
import com.pfe.lieux.domain.Etablissement;
import com.pfe.lieux.domain.Salle;
import com.pfe.lieux.concours.ConcoursExistenceClient;
import com.pfe.lieux.support.HttpRequestContext;
import com.pfe.lieux.repository.CentreRepository;
import com.pfe.lieux.repository.EtablissementRepository;
import com.pfe.lieux.repository.SalleRepository;
import com.pfe.lieux.web.dto.CentreDetailResponse;
import com.pfe.lieux.web.dto.CentreListItemResponse;
import com.pfe.lieux.web.dto.CentreNomRequest;
import com.pfe.lieux.web.dto.EtablissementDetailResponse;
import com.pfe.lieux.web.dto.EtablissementNomRequest;
import com.pfe.lieux.web.dto.SalleAvecLieuxResponse;
import com.pfe.lieux.web.dto.SalleResponse;
import com.pfe.lieux.web.dto.SalleWriteRequest;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LieuxApplicationService {

    private final CentreRepository centreRepository;
    private final EtablissementRepository etablissementRepository;
    private final SalleRepository salleRepository;
    private final ConcoursExistenceClient concoursExistenceClient;

    public LieuxApplicationService(
            CentreRepository centreRepository,
            EtablissementRepository etablissementRepository,
            SalleRepository salleRepository,
            ConcoursExistenceClient concoursExistenceClient) {
        this.centreRepository = centreRepository;
        this.etablissementRepository = etablissementRepository;
        this.salleRepository = salleRepository;
        this.concoursExistenceClient = concoursExistenceClient;
    }

    public List<CentreListItemResponse> listerCentres() {
        List<Centre> centres = listerCentresDepuisBase();
        return centres.stream()
                .map(c -> new CentreListItemResponse(
                        c.getIdCentre(),
                        c.getNomCentre(),
                        etablissementRepository.countByCentreId(c.getIdCentre()),
                        concoursNumerosPourCentre(c.getIdCentre())))
                .toList();
    }

    @Transactional(readOnly = true)
    List<Centre> listerCentresDepuisBase() {
        return centreRepository.findAllOrderByNom();
    }

    @Transactional(readOnly = true)
    public CentreDetailResponse obtenirCentre(Long idCentre) {
        Centre centre = centreRepository
                .findById(idCentre)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Centre introuvable"));
        List<EtablissementDetailResponse> etabs =
                etablissementRepository.findByCentreIdWithSalles(centre.getIdCentre()).stream()
                        .sorted(Comparator.comparing(Etablissement::getNomEtablissement, String.CASE_INSENSITIVE_ORDER))
                        .map(this::toEtablissementDetail)
                        .toList();
        return new CentreDetailResponse(
                centre.getIdCentre(), centre.getNomCentre(), concoursNumerosPourCentre(centre.getIdCentre()), etabs);
    }

    @Transactional
    public CentreDetailResponse creerCentre(CentreNomRequest req) {
        String nom = req.nomCentre().trim();
        assertNomCentreLibre(nom, null);
        Instant now = Instant.now();
        Centre c = new Centre();
        c.setNomCentre(nom);
        c.setCreeLe(now);
        c.setModifieLe(now);
        try {
            centreRepository.save(c);
        } catch (DataIntegrityViolationException e) {
            throw conflitNomCentre();
        }
        return obtenirCentre(c.getIdCentre());
    }

    @Transactional
    public CentreDetailResponse mettreAJourCentre(Long idCentre, CentreNomRequest req) {
        Centre centre = centreRepository
                .findById(idCentre)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Centre introuvable"));
        String nom = req.nomCentre().trim();
        assertNomCentreLibre(nom, idCentre);
        centre.setNomCentre(nom);
        centre.setModifieLe(Instant.now());
        try {
            centreRepository.save(centre);
        } catch (DataIntegrityViolationException e) {
            throw conflitNomCentre();
        }
        concoursExistenceClient.renommerCentreDansConcours(
                idCentre, nom, HttpRequestContext.authorizationHeaderOrNull());
        return obtenirCentre(idCentre);
    }

    @Transactional
    public void supprimerCentre(Long idCentre) {
        if (!centreRepository.existsById(idCentre)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Centre introuvable");
        }
        centreRepository.deleteById(idCentre);
    }

    @Transactional
    public EtablissementDetailResponse creerEtablissement(Long centreId, EtablissementNomRequest req) {
        Centre centre = centreRepository
                .findById(centreId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Centre introuvable"));
        String nom = req.nomEtablissement().trim();
        if (etablissementRepository.existsByCentre_IdCentreAndNomEtablissementIgnoreCase(centreId, nom)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Un établissement avec ce nom existe déjà dans ce centre");
        }
        Instant now = Instant.now();
        Etablissement e = new Etablissement();
        e.setCentre(centre);
        e.setNomEtablissement(nom);
        e.setCreeLe(now);
        e.setModifieLe(now);
        try {
            etablissementRepository.save(e);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Un établissement avec ce nom existe déjà dans ce centre");
        }
        return toEtablissementDetail(etablissementRepository.findByIdWithSalles(e.getIdEtablissement()).orElse(e));
    }

    @Transactional(readOnly = true)
    public EtablissementDetailResponse obtenirEtablissement(Long idEtablissement) {
        Etablissement e = etablissementRepository
                .findByIdWithSalles(idEtablissement)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable"));
        return toEtablissementDetail(e);
    }

    @Transactional
    public EtablissementDetailResponse mettreAJourEtablissement(Long idEtablissement, EtablissementNomRequest req) {
        Etablissement e = etablissementRepository
                .findById(idEtablissement)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable"));
        Long centreId = e.getCentre().getIdCentre();
        String nom = req.nomEtablissement().trim();
        if (etablissementRepository.existsByCentre_IdCentreAndNomEtablissementIgnoreCaseAndIdEtablissementNot(
                centreId, nom, idEtablissement)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Un établissement avec ce nom existe déjà dans ce centre");
        }
        e.setNomEtablissement(nom);
        e.setModifieLe(Instant.now());
        try {
            etablissementRepository.save(e);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Un établissement avec ce nom existe déjà dans ce centre");
        }
        return obtenirEtablissement(idEtablissement);
    }

    @Transactional
    public void supprimerEtablissement(Long idEtablissement) {
        if (!etablissementRepository.existsById(idEtablissement)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable");
        }
        etablissementRepository.deleteById(idEtablissement);
    }

    @Transactional
    public SalleResponse creerSalle(Long etablissementId, SalleWriteRequest req) {
        Etablissement etab = etablissementRepository
                .findById(etablissementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable"));
        String nom = req.nomSalle().trim();
        if (salleRepository.existsByEtablissement_IdEtablissementAndNomSalleIgnoreCase(etablissementId, nom)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Une salle avec ce nom existe déjà dans cet établissement");
        }
        String numeroConcours = blankToNull(req.numeroConcours());
        validerNumeroConcours(numeroConcours);
        Instant now = Instant.now();
        Salle s = new Salle();
        s.setEtablissement(etab);
        s.setNomSalle(nom);
        s.setNombrePlaces(req.nombrePlaces());
        s.setNumeroConcours(numeroConcours);
        s.setCreeLe(now);
        s.setModifieLe(now);
        try {
            salleRepository.save(s);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Une salle avec ce nom existe déjà dans cet établissement");
        }
        synchroniserAffectationConcours(etab.getCentre(), numeroConcours);
        return toSalleResponse(s);
    }

    @Transactional(readOnly = true)
    public List<SalleAvecLieuxResponse> listerSallesParConcours(String numeroConcours) {
        validerNumeroConcours(numeroConcours);
        return salleRepository.findByNumeroConcoursOrderByNomSalleAsc(numeroConcours.trim()).stream()
                .map(this::toSalleAvecLieux)
                .toList();
    }

    @Transactional(readOnly = true)
    public SalleAvecLieuxResponse obtenirSalle(Long idSalle) {
        Salle s = salleRepository
                .findByIdWithEtablissementAndCentre(idSalle)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Salle introuvable"));
        return toSalleAvecLieux(s);
    }

    @Transactional
    public SalleResponse mettreAJourSalle(Long idSalle, SalleWriteRequest req) {
        Salle s = salleRepository
                .findById(idSalle)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Salle introuvable"));
        Long etabId = s.getEtablissement().getIdEtablissement();
        String nom = req.nomSalle().trim();
        if (salleRepository.existsByEtablissement_IdEtablissementAndNomSalleIgnoreCaseAndIdSalleNot(
                etabId, nom, idSalle)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Une salle avec ce nom existe déjà dans cet établissement");
        }
        String numeroConcours = blankToNull(req.numeroConcours());
        validerNumeroConcours(numeroConcours);
        s.setNomSalle(nom);
        s.setNombrePlaces(req.nombrePlaces());
        s.setNumeroConcours(numeroConcours);
        s.setModifieLe(Instant.now());
        try {
            salleRepository.save(s);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Une salle avec ce nom existe déjà dans cet établissement");
        }
        synchroniserAffectationConcours(s.getEtablissement().getCentre(), numeroConcours);
        return toSalleResponse(s);
    }

    @Transactional
    public void supprimerSalle(Long idSalle) {
        if (!salleRepository.existsById(idSalle)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Salle introuvable");
        }
        salleRepository.deleteById(idSalle);
    }

    /** {@code numero_concours} est une référence logique vers concours-service (pas de FK inter-bases). */
    private void validerNumeroConcours(String numeroConcours) {
        concoursExistenceClient.assertConcoursExists(numeroConcours, HttpRequestContext.authorizationHeaderOrNull());
    }

    /**
     * Rattacher une salle à un concours fait apparaître son centre dans la liste des concours :
     * on ajoute (de façon idempotente) le centre aux affectations du concours côté concours-service.
     * Ajout uniquement : la suppression d'un centre reste pilotée manuellement via le formulaire concours.
     */
    private void synchroniserAffectationConcours(Centre centre, String numeroConcours) {
        if (numeroConcours == null || centre == null) {
            return;
        }
        concoursExistenceClient.ajouterAffectationConcours(
                numeroConcours,
                centre.getIdCentre(),
                centre.getNomCentre(),
                HttpRequestContext.authorizationHeaderOrNull());
    }

    private void assertNomCentreLibre(String nom, Long excludeIdCentre) {
        boolean taken =
                excludeIdCentre == null
                        ? centreRepository.existsByNomCentreIgnoreCase(nom)
                        : centreRepository.existsByNomCentreIgnoreCaseAndIdCentreNot(nom, excludeIdCentre);
        if (taken) {
            throw conflitNomCentre();
        }
    }

    private static ResponseStatusException conflitNomCentre() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Un centre avec ce nom existe déjà");
    }

    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private EtablissementDetailResponse toEtablissementDetail(Etablissement e) {
        List<SalleResponse> salles = e.getSalles().stream()
                .sorted(Comparator.comparing(Salle::getNomSalle, String.CASE_INSENSITIVE_ORDER))
                .map(this::toSalleResponse)
                .toList();
        return new EtablissementDetailResponse(
                e.getIdEtablissement(),
                e.getNomEtablissement(),
                concoursNumerosPourEtablissement(e.getIdEtablissement()),
                salles);
    }

    private List<String> concoursNumerosPourCentre(Long centreId) {
        TreeSet<String> numeros = new TreeSet<>(salleRepository.findDistinctConcoursNumerosByCentreId(centreId));
        numeros.addAll(concoursExistenceClient.listConcoursNumerosByCentre(
                centreId, HttpRequestContext.authorizationHeaderOrNull()));
        return List.copyOf(numeros);
    }

    /** Concours d'un établissement : distincts des salles de l'établissement. */
    private List<String> concoursNumerosPourEtablissement(Long etablissementId) {
        return salleRepository.findDistinctConcoursNumerosByEtablissementId(etablissementId);
    }

    private SalleResponse toSalleResponse(Salle s) {
        return new SalleResponse(s.getIdSalle(), s.getNomSalle(), s.getNombrePlaces(), s.getNumeroConcours());
    }

    private SalleAvecLieuxResponse toSalleAvecLieux(Salle s) {
        Etablissement e = s.getEtablissement();
        Centre c = e.getCentre();
        return new SalleAvecLieuxResponse(
                s.getIdSalle(),
                s.getNomSalle(),
                s.getNombrePlaces(),
                s.getNumeroConcours(),
                e.getIdEtablissement(),
                e.getNomEtablissement(),
                c.getIdCentre(),
                c.getNomCentre());
    }
}
