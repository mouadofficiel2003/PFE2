package com.pfe.candidats.service;



import com.pfe.candidats.domain.Candidat;

import com.pfe.candidats.repository.CandidatRepository;

import com.pfe.candidats.service.CandidatExcelParser.ParsedRow;

import com.pfe.candidats.service.CandidatExcelParser.SheetRow;

import com.pfe.candidats.web.dto.CandidatAffectationBatchRequest;

import com.pfe.candidats.web.dto.CandidatAffectationBatchResponse;

import com.pfe.candidats.web.dto.CandidatResponse;

import com.pfe.candidats.web.dto.CandidatUpdateRequest;

import com.pfe.candidats.web.dto.ImportCandidatsResponse;

import com.pfe.candidats.web.dto.ImportCandidatsResponse.ImportCandidatsError;

import com.pfe.candidats.web.dto.ReinitialisationCandidatsResponse;

import com.pfe.candidats.remote.dto.SalleLieuxHeadJson;

import java.io.IOException;

import java.time.Instant;

import java.util.ArrayList;

import java.util.List;

import java.util.Map;

import java.util.Optional;

import java.util.function.Function;

import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;

import org.springframework.http.HttpStatus;

import org.springframework.stereotype.Service;

import org.springframework.transaction.annotation.Transactional;

import org.springframework.web.multipart.MultipartFile;

import org.springframework.web.server.ResponseStatusException;



@Service

public class CandidatService {



    private final CandidatRepository candidatRepository;

    private final CandidatConcoursResolver candidatConcoursResolver;

    private final CandidatRemoteRefsValidator candidatRemoteRefsValidator;



    public CandidatService(

            CandidatRepository candidatRepository,

            CandidatConcoursResolver candidatConcoursResolver,

            CandidatRemoteRefsValidator candidatRemoteRefsValidator) {

        this.candidatRepository = candidatRepository;

        this.candidatConcoursResolver = candidatConcoursResolver;

        this.candidatRemoteRefsValidator = candidatRemoteRefsValidator;

    }



    @Transactional(readOnly = true)

    public List<CandidatResponse> listerTous() {

        return candidatRepository.findAll().stream().map(this::toResponse).toList();

    }



    @Transactional(readOnly = true)

    public CandidatResponse obtenir(String numeroInscription) {

        Candidat c = candidatRepository

                .findById(numeroInscription.trim())

                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidat introuvable"));

        return toResponse(c);

    }



    @Transactional

    public CandidatResponse mettreAJour(String numeroInscription, CandidatUpdateRequest req) {

        String pathNumero = numeroInscription.trim();

        String bodyNumero = req.numeroInscription().trim();

        if (!pathNumero.equals(bodyNumero)) {

            throw new ResponseStatusException(

                    HttpStatus.BAD_REQUEST,

                    "Le numéro d'inscription ne peut pas être modifié (supprimez et recréez).");

        }

        Candidat c = candidatRepository

                .findById(pathNumero)

                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidat introuvable"));

        if (candidatRepository.existsByCinAndNumeroInscriptionNot(req.cin().trim(), pathNumero)) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ce CIN est déjà utilisé par un autre candidat");

        }

        ResolvedConcours concours = candidatConcoursResolver.resolve(req.nomConcours(), req.numeroConcours());

        var salleInfo = candidatRemoteRefsValidator.validateLieux(req, concours);

        appliquerChamps(c, req, concours, salleInfo);

        candidatRepository.save(c);

        return toResponse(c);

    }



    @Transactional

    public void supprimer(String numeroInscription) {

        String numero = numeroInscription.trim();

        if (!candidatRepository.existsById(numero)) {

            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidat introuvable");

        }

        candidatRepository.deleteById(numero);

    }



    /** Vide entièrement la liste des candidats et renvoie le nombre de candidats supprimés. */

    @Transactional

    public ReinitialisationCandidatsResponse reinitialiserListe() {

        long total = candidatRepository.count();

        if (total > 0) {

            candidatRepository.deleteAllInBatch();

        }

        return new ReinitialisationCandidatsResponse(total);

    }



    /**

     * Applique un lot d'affectations calculé par repartition-service : pour chaque candidat trouvé,

     * on reporte centre / établissement / salle / place. Les candidats absents sont renvoyés dans

     * {@code introuvables} sans interrompre le traitement.

     */

    @Transactional

    public CandidatAffectationBatchResponse appliquerAffectations(CandidatAffectationBatchRequest req) {

        List<CandidatAffectationBatchRequest.Item> items = req.affectations();

        List<String> numeros = items.stream()

                .map(CandidatAffectationBatchRequest.Item::numeroInscription)

                .map(String::trim)

                .toList();

        Map<String, Candidat> parNumero = candidatRepository.findAllById(numeros).stream()

                .collect(Collectors.toMap(Candidat::getNumeroInscription, Function.identity()));



        List<Candidat> aSauver = new ArrayList<>();

        List<String> introuvables = new ArrayList<>();

        Instant now = Instant.now();

        for (CandidatAffectationBatchRequest.Item item : items) {

            String numero = item.numeroInscription().trim();

            Candidat c = parNumero.get(numero);

            if (c == null) {

                introuvables.add(numero);

                continue;

            }

            c.setIdCentre(item.idCentre());

            c.setIdEtablissement(item.idEtablissement());

            c.setIdSalle(item.idSalle());

            c.setNumeroPlace(item.numeroPlace());

            c.setModifieLe(now);

            aSauver.add(c);

        }

        candidatRepository.saveAll(aSauver);

        return new CandidatAffectationBatchResponse(aSauver.size(), introuvables);

    }



    @Transactional

    public ImportCandidatsResponse importerExcel(MultipartFile file) {

        if (file == null || file.isEmpty()) {

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fichier vide");

        }

        String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";

        if (!name.toLowerCase().endsWith(".xlsx")) {

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Format attendu : .xlsx");

        }

        List<SheetRow> rows;

        try {

            rows = CandidatExcelParser.parseAll(file.getInputStream());

        } catch (IOException e) {

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossible de lire le fichier Excel");

        }

        int inserted = 0;

        int updated = 0;

        int skipped = 0;

        List<ImportCandidatsError> errors = new ArrayList<>();

        for (SheetRow sr : rows) {

            Optional<String> validation = validerLigne(sr.data());

            if (validation.isPresent()) {

                errors.add(new ImportCandidatsError(sr.rowNumber(), validation.get()));

                skipped++;

                continue;

            }

            ParsedRow d = sr.data();

            short age;

            try {

                age = parseAge(d.ageRaw());

            } catch (IllegalArgumentException e) {

                errors.add(new ImportCandidatsError(sr.rowNumber(), "Âge invalide"));

                skipped++;

                continue;

            }

            String cin = d.cin().trim();

            Optional<Candidat> exist = candidatRepository.findByCin(cin);

            try {

                if (exist.isPresent()) {

                    appliquerImport(exist.get(), d, age, false);

                    candidatRepository.save(exist.get());

                    updated++;

                } else {

                    Candidat c = new Candidat();

                    Instant now = Instant.now();

                    c.setCreeLe(now);

                    c.setModifieLe(now);

                    appliquerImport(c, d, age, true);

                    candidatRepository.save(c);

                    inserted++;

                }

            } catch (DataIntegrityViolationException ex) {

                errors.add(new ImportCandidatsError(sr.rowNumber(), "Doublon ou contrainte base de données"));

                skipped++;

            }

        }

        return new ImportCandidatsResponse(inserted, updated, skipped, errors);

    }



    private void appliquerImport(Candidat c, ParsedRow d, short age, boolean nouveau) {

        c.setNom(truncate(d.nom().trim(), 120));

        c.setPrenom(truncate(d.prenom().trim(), 120));

        c.setCin(truncate(d.cin().trim(), 32));

        c.setNumeroTelephone(truncate(d.numeroTelephone().trim(), 32));

        c.setVille(truncate(d.ville().trim(), 120));

        c.setAge(age);

        c.setEmail(truncate(d.email().trim(), 255));

        c.setSpecialite(truncate(d.specialite().trim(), 200));

        c.setNumeroInscription(truncate(d.numeroInscription().trim(), 80));

        c.setNomConcours(truncate(d.nomConcours().trim(), 200));

        c.setNumeroConcours(emptyToNull(truncate(d.numeroConcours().trim(), 80)));

        if (nouveau) {

            c.setIdCentre(null);

            c.setIdEtablissement(null);

            c.setIdSalle(null);

            c.setNumeroPlace(null);

        }

    }



    private static String emptyToNull(String s) {

        return s == null || s.isBlank() ? null : s;

    }



    private static String truncate(String s, int max) {

        if (s.length() <= max) {

            return s;

        }

        return s.substring(0, max);

    }



    private void appliquerChamps(

            Candidat c,

            CandidatUpdateRequest req,

            ResolvedConcours concours,

            Optional<SalleLieuxHeadJson> salleResolue) {

        c.setNom(req.nom().trim());

        c.setPrenom(req.prenom().trim());

        c.setCin(req.cin().trim());

        c.setNumeroTelephone(req.numeroTelephone().trim());

        c.setVille(req.ville().trim());

        c.setAge(req.age().shortValue());

        c.setEmail(req.email().trim());

        c.setSpecialite(req.specialite().trim());

        c.setNumeroInscription(req.numeroInscription().trim());

        c.setNumeroConcours(concours.numeroConcours());

        c.setNomConcours(concours.nomConcours());

        if (req.idSalle() == null) {

            c.setIdCentre(req.idCentre());

            c.setIdEtablissement(req.idEtablissement());

            c.setIdSalle(null);

            c.setNumeroPlace(req.numeroPlace());

            return;

        }

        SalleLieuxHeadJson s = salleResolue.orElseThrow(

                () -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "État affectation incohérent"));

        Long centreId = req.idCentre() != null ? req.idCentre() : s.centreId();

        Long etabId = req.idEtablissement() != null ? req.idEtablissement() : s.etablissementId();

        c.setIdCentre(centreId);

        c.setIdEtablissement(etabId);

        c.setIdSalle(req.idSalle());

        c.setNumeroPlace(req.numeroPlace());

    }



    private static Optional<String> validerLigne(ParsedRow d) {

        if (d.nom().isBlank()) {

            return Optional.of("Nom manquant");

        }

        if (d.prenom().isBlank()) {

            return Optional.of("Prénom manquant");

        }

        if (d.cin().isBlank()) {

            return Optional.of("CIN manquant");

        }

        if (d.numeroTelephone().isBlank()) {

            return Optional.of("Téléphone manquant");

        }

        if (d.ville().isBlank()) {

            return Optional.of("Ville manquante");

        }

        if (d.ageRaw().isBlank()) {

            return Optional.of("Âge manquant");

        }

        if (d.email().isBlank()) {

            return Optional.of("Email manquant");

        }

        if (d.specialite().isBlank()) {

            return Optional.of("Spécialité manquante");

        }

        if (d.numeroInscription().isBlank()) {

            return Optional.of("Numéro d'inscription manquant");

        }

        if (d.nomConcours().isBlank() && d.numeroConcours().isBlank()) {

            return Optional.of("Nom ou numéro du concours manquant");

        }

        try {

            short a = parseAge(d.ageRaw());

            if (a < 10 || a > 120) {

                return Optional.of("Âge hors plage (10–120)");

            }

        } catch (IllegalArgumentException e) {

            return Optional.of("Âge invalide");

        }

        return Optional.empty();

    }



    private static short parseAge(String raw) {

        String s = raw.trim().replace(',', '.');

        double v = Double.parseDouble(s);

        int rounded = (int) Math.round(v);

        if (rounded < Short.MIN_VALUE || rounded > Short.MAX_VALUE) {

            throw new IllegalArgumentException();

        }

        return (short) rounded;

    }



    private CandidatResponse toResponse(Candidat c) {

        return new CandidatResponse(

                c.getNumeroInscription(),

                c.getNom(),

                c.getPrenom(),

                c.getCin(),

                c.getNumeroTelephone(),

                c.getVille(),

                c.getAge(),

                c.getEmail(),

                c.getSpecialite(),

                c.getNomConcours(),

                c.getNumeroConcours(),

                c.getIdCentre(),

                c.getIdEtablissement(),

                c.getIdSalle(),

                c.getNumeroPlace(),

                c.getCreeLe(),

                c.getModifieLe());

    }

}


