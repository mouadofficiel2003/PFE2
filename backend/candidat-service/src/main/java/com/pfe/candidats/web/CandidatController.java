package com.pfe.candidats.web;



import com.pfe.candidats.service.CandidatService;

import com.pfe.candidats.web.dto.CandidatAffectationBatchRequest;

import com.pfe.candidats.web.dto.CandidatAffectationBatchResponse;

import com.pfe.candidats.web.dto.CandidatResponse;

import com.pfe.candidats.web.dto.CandidatUpdateRequest;

import com.pfe.candidats.web.dto.ImportCandidatsResponse;

import com.pfe.candidats.web.dto.ReinitialisationCandidatsResponse;

import jakarta.validation.Valid;

import java.util.List;

import org.springframework.http.MediaType;

import org.springframework.web.bind.annotation.DeleteMapping;

import org.springframework.web.bind.annotation.GetMapping;

import org.springframework.web.bind.annotation.PatchMapping;

import org.springframework.web.bind.annotation.PathVariable;

import org.springframework.web.bind.annotation.PostMapping;

import org.springframework.web.bind.annotation.PutMapping;

import org.springframework.web.bind.annotation.RequestBody;

import org.springframework.web.bind.annotation.RequestMapping;

import org.springframework.web.bind.annotation.RequestPart;

import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.multipart.MultipartFile;



@RestController

@RequestMapping("/api/candidats")

public class CandidatController {



    private final CandidatService candidatService;



    public CandidatController(CandidatService candidatService) {

        this.candidatService = candidatService;

    }



    @GetMapping

    public List<CandidatResponse> lister() {

        return candidatService.listerTous();

    }



    @GetMapping("/{numeroInscription}")

    public CandidatResponse obtenir(@PathVariable String numeroInscription) {

        return candidatService.obtenir(numeroInscription);

    }



    @PutMapping("/{numeroInscription}")

    public CandidatResponse mettreAJour(

            @PathVariable String numeroInscription, @Valid @RequestBody CandidatUpdateRequest body) {

        return candidatService.mettreAJour(numeroInscription, body);

    }



    /** Report en lot des affectations issues de la répartition automatique (repartition-service). */

    @PatchMapping("/affectations")

    public CandidatAffectationBatchResponse appliquerAffectations(

            @Valid @RequestBody CandidatAffectationBatchRequest body) {

        return candidatService.appliquerAffectations(body);

    }



    @DeleteMapping("/{numeroInscription}")

    public void supprimer(@PathVariable String numeroInscription) {

        candidatService.supprimer(numeroInscription);

    }



    /** Réinitialise (vide) toute la liste des candidats. */

    @DeleteMapping

    public ReinitialisationCandidatsResponse reinitialiser() {

        return candidatService.reinitialiserListe();

    }



    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)

    public ImportCandidatsResponse importer(@RequestPart("file") MultipartFile file) {

        return candidatService.importerExcel(file);

    }

}


