package com.pfe.concours.web;



import com.pfe.concours.service.ConcoursService;

import com.pfe.concours.web.dto.CentreAffectationRequest;

import com.pfe.concours.web.dto.CentreRenommageRequest;

import com.pfe.concours.web.dto.ConcoursHeadResponse;

import com.pfe.concours.web.dto.ConcoursResponse;

import com.pfe.concours.web.dto.ConcoursWriteRequest;

import jakarta.validation.Valid;

import java.util.List;

import org.springframework.http.HttpStatus;

import org.springframework.web.bind.annotation.DeleteMapping;

import org.springframework.web.bind.annotation.GetMapping;

import org.springframework.web.bind.annotation.PatchMapping;

import org.springframework.web.bind.annotation.PathVariable;

import org.springframework.web.bind.annotation.PostMapping;

import org.springframework.web.bind.annotation.PutMapping;

import org.springframework.web.bind.annotation.RequestBody;

import org.springframework.web.bind.annotation.RequestMapping;

import org.springframework.web.bind.annotation.ResponseStatus;

import org.springframework.web.bind.annotation.RestController;



@RestController

@RequestMapping("/api/concours")

public class ConcoursController {



    private final ConcoursService concoursService;



    public ConcoursController(ConcoursService concoursService) {

        this.concoursService = concoursService;

    }



    @GetMapping

    public List<ConcoursResponse> lister() {

        return concoursService.listerTous();

    }



    @GetMapping("/by-centre/{idCentre}")

    public List<ConcoursHeadResponse> listerParCentre(@PathVariable Long idCentre) {

        return concoursService.listerEnTeteParCentre(idCentre);

    }



    @GetMapping("/{numeroConcours}")

    public ConcoursResponse obtenir(@PathVariable String numeroConcours) {

        return concoursService.obtenir(numeroConcours);

    }



    @PostMapping

    @ResponseStatus(HttpStatus.CREATED)

    public ConcoursResponse creer(@Valid @RequestBody ConcoursWriteRequest body) {

        return concoursService.creer(body);

    }



    @PutMapping("/{numeroConcours}")

    public ConcoursResponse mettreAJour(

            @PathVariable String numeroConcours, @Valid @RequestBody ConcoursWriteRequest body) {

        return concoursService.mettreAJour(numeroConcours, body);

    }



    @PostMapping("/{numeroConcours}/affectations")

    public ConcoursResponse ajouterAffectation(
            @PathVariable String numeroConcours, @Valid @RequestBody CentreAffectationRequest body) {

        return concoursService.ajouterAffectation(numeroConcours, body);

    }



    @PatchMapping("/affectations/centre/{idCentre}")

    public void renommerCentre(
            @PathVariable Long idCentre, @Valid @RequestBody CentreRenommageRequest body) {

        concoursService.renommerCentre(idCentre, body.nomCentre());

    }



    @DeleteMapping("/{numeroConcours}")

    public void supprimer(@PathVariable String numeroConcours) {

        concoursService.supprimer(numeroConcours);

    }

}


