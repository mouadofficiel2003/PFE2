package com.pfe.repartition.web;

import com.pfe.repartition.service.RepartitionService;
import com.pfe.repartition.web.dto.ReinitialisationResponse;
import com.pfe.repartition.web.dto.RepartitionRunResponse;
import com.pfe.repartition.web.dto.RepartitionRunSummaryResponse;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/repartition")
public class RepartitionController {

    private final RepartitionService repartitionService;

    public RepartitionController(RepartitionService repartitionService) {
        this.repartitionService = repartitionService;
    }

    /** Déclenchement unique de la répartition automatique (« Commencer répartition »). */
    @PostMapping("/run")
    @ResponseStatus(HttpStatus.CREATED)
    public RepartitionRunResponse declencher() {
        return repartitionService.declencher();
    }

    /** Réinitialise la répartition : remet à zéro l'affectation de tous les candidats. */
    @PostMapping("/reset")
    public ReinitialisationResponse reinitialiser() {
        return repartitionService.reinitialiser();
    }

    /** Historique des exécutions (vue allégée). */
    @GetMapping("/runs")
    public List<RepartitionRunSummaryResponse> listerRuns() {
        return repartitionService.listerRuns();
    }

    /** Synthèse complète d'une exécution (affectations + alertes). */
    @GetMapping("/runs/{id}")
    public RepartitionRunResponse obtenirRun(@PathVariable Long id) {
        return repartitionService.obtenirRun(id);
    }

    /** Suppression d'une exécution historisée. */
    @DeleteMapping("/runs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void supprimerRun(@PathVariable Long id) {
        repartitionService.supprimerRun(id);
    }
}
