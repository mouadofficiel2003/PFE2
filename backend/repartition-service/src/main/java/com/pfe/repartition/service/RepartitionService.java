package com.pfe.repartition.service;

import com.pfe.repartition.domain.RepartitionAffectation;
import com.pfe.repartition.domain.RepartitionAlerte;
import com.pfe.repartition.domain.RepartitionRun;
import com.pfe.repartition.domain.RepartitionStatut;
import com.pfe.repartition.remote.CandidatRemoteClient;
import com.pfe.repartition.remote.ConcoursRemoteClient;
import com.pfe.repartition.remote.LieuxRemoteClient;
import com.pfe.repartition.remote.dto.AffectationBatchJson;
import com.pfe.repartition.remote.dto.CandidatJson;
import com.pfe.repartition.remote.dto.ConcoursJson;
import com.pfe.repartition.remote.dto.SalleAvecLieuxJson;
import com.pfe.repartition.service.RepartitionPlanner.AffectationPlanifiee;
import com.pfe.repartition.service.RepartitionPlanner.AlertePlanifiee;
import com.pfe.repartition.service.RepartitionPlanner.Plan;
import com.pfe.repartition.support.HttpRequestContext;
import com.pfe.repartition.web.dto.AffectationResponse;
import com.pfe.repartition.web.dto.AlerteResponse;
import com.pfe.repartition.remote.dto.AffectationBatchResultJson;
import com.pfe.repartition.web.dto.ReinitialisationResponse;
import com.pfe.repartition.web.dto.RepartitionRunResponse;
import com.pfe.repartition.web.dto.RepartitionRunSummaryResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Orchestration de la répartition automatique : lecture des référentiels (concours, lieux, candidats)
 * via REST (JWT du gestionnaire relayé), calcul du plan, écriture des affectations sur les candidats,
 * puis persistance d'un historique (run + affectations + alertes) dans la base dédiée.
 */
@Service
public class RepartitionService {

    private final ConcoursRemoteClient concoursRemoteClient;
    private final LieuxRemoteClient lieuxRemoteClient;
    private final CandidatRemoteClient candidatRemoteClient;
    private final RepartitionPlanner planner;
    private final RepartitionRunRepositoryFacade runFacade;

    public RepartitionService(
            ConcoursRemoteClient concoursRemoteClient,
            LieuxRemoteClient lieuxRemoteClient,
            CandidatRemoteClient candidatRemoteClient,
            RepartitionPlanner planner,
            RepartitionRunRepositoryFacade runFacade) {
        this.concoursRemoteClient = concoursRemoteClient;
        this.lieuxRemoteClient = lieuxRemoteClient;
        this.candidatRemoteClient = candidatRemoteClient;
        this.planner = planner;
        this.runFacade = runFacade;
    }

    /**
     * Déclenchement unique : exécute la répartition de bout en bout et renvoie la synthèse.
     *
     * <p>L'opération n'est pas atomique (lectures/écritures réparties sur plusieurs services, hors
     * d'une transaction unique). En cas d'erreur (service aval indisponible, échec de persistance…),
     * on historise un run au statut {@code ECHEC} portant la cause, puis on relaie l'erreur à
     * l'appelant pour qu'il reçoive le bon code HTTP.
     */
    public RepartitionRunResponse declencher() {
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        String user = HttpRequestContext.currentUsernameOrNull();
        Instant debut = Instant.now();

        try {
            List<ConcoursJson> concours = concoursRemoteClient.listConcours(auth);
            Map<String, List<SalleAvecLieuxJson>> sallesParConcours = new LinkedHashMap<>();
            for (ConcoursJson c : concours) {
                if (c != null && c.numeroConcours() != null && !c.numeroConcours().isBlank()) {
                    sallesParConcours.put(
                            c.numeroConcours(), lieuxRemoteClient.listSallesParConcours(c.numeroConcours(), auth));
                }
            }
            List<CandidatJson> candidats = candidatRemoteClient.listCandidats(auth);

            Plan plan = planner.planifier(concours, sallesParConcours, candidats);

            RepartitionRun run = construireRun(plan, candidats.size(), user, debut);

            // Effet de bord principal : reporter l'affectation sur chaque candidat. Redistribution
            // complète : les candidats non affectés ce run (alertes) voient leur ancienne affectation
            // remise à zéro pour rester cohérents avec l'historique.
            candidatRemoteClient.appliquerAffectations(construireBatch(plan, candidats), auth);

            RepartitionRun enregistre = runFacade.enregistrer(run);
            return toResponse(enregistre);
        } catch (RuntimeException ex) {
            enregistrerEchec(user, debut, ex);
            throw ex;
        }
    }

    /**
     * Historise un run au statut {@code ECHEC} (traçabilité). Si la persistance de l'échec échoue elle
     * aussi (ex. base indisponible), on n'éclipse pas l'erreur d'origine : on l'attache en suppressed.
     */
    private void enregistrerEchec(String user, Instant debut, RuntimeException cause) {
        try {
            RepartitionRun run = new RepartitionRun();
            run.setDeclenchePar(user);
            run.setStatut(RepartitionStatut.ECHEC);
            run.setDemarreLe(debut);
            run.setTermineLe(Instant.now());
            run.setMessage(resumeErreur(cause));
            runFacade.enregistrer(run);
        } catch (RuntimeException persistEx) {
            cause.addSuppressed(persistEx);
        }
    }

    private static String resumeErreur(RuntimeException ex) {
        String raison = ex instanceof ResponseStatusException rse && rse.getReason() != null
                ? rse.getReason()
                : ex.getMessage();
        if (raison == null || raison.isBlank()) {
            raison = ex.getClass().getSimpleName();
        }
        return raison.length() > 500 ? raison.substring(0, 500) : raison;
    }

    /**
     * Réinitialise la répartition : remet à zéro l'affectation (centre / établissement / salle / place)
     * de tous les candidats. Après cet appel, plus aucune répartition n'est « active » côté candidats ;
     * l'historique des exécutions, lui, reste consultable (utiliser la suppression d'un run pour le purger).
     */
    public ReinitialisationResponse reinitialiser() {
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        List<CandidatJson> candidats = candidatRemoteClient.listCandidats(auth);

        List<AffectationBatchJson.Item> items = new ArrayList<>();
        for (CandidatJson cand : candidats) {
            if (cand == null || cand.numeroInscription() == null || cand.numeroInscription().isBlank()) {
                continue;
            }
            items.add(new AffectationBatchJson.Item(cand.numeroInscription(), null, null, null, null));
        }

        AffectationBatchResultJson result =
                candidatRemoteClient.appliquerAffectations(new AffectationBatchJson(items), auth);
        return new ReinitialisationResponse(result != null ? result.misAJour() : 0);
    }

    /** Supprime une exécution historisée (avec ses affectations et alertes). */
    public void supprimerRun(Long id) {
        if (!runFacade.existe(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Run de répartition introuvable");
        }
        runFacade.supprimer(id);
    }

    @Transactional(readOnly = true)
    public List<RepartitionRunSummaryResponse> listerRuns() {
        return runFacade.listerTous().stream().map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public RepartitionRunResponse obtenirRun(Long id) {
        RepartitionRun run = runFacade
                .charger(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Run de répartition introuvable"));
        // Initialise les collections dans la transaction (open-in-view désactivé).
        run.getAffectations().size();
        run.getAlertes().size();
        return toResponse(run);
    }

    private RepartitionRun construireRun(Plan plan, int totalCandidats, String user, Instant debut) {
        RepartitionRun run = new RepartitionRun();
        run.setDeclenchePar(user);
        run.setDemarreLe(debut);
        run.setTotalCandidats(totalCandidats);
        run.setTotalAffectes(plan.affectations().size());
        run.setTotalAlertes(plan.alertes().size());
        run.setStatut(plan.alertes().isEmpty()
                ? RepartitionStatut.TERMINEE
                : RepartitionStatut.TERMINEE_AVEC_ALERTES);

        for (AffectationPlanifiee a : plan.affectations()) {
            run.ajouterAffectation(toAffectationEntity(a));
        }
        for (AlertePlanifiee al : plan.alertes()) {
            run.ajouterAlerte(toAlerteEntity(al));
        }
        run.setTermineLe(Instant.now());
        return run;
    }

    /**
     * Construit le lot d'affectations à reporter sur les candidats. Pour une redistribution complète,
     * on parcourt tous les candidats lus : ceux placés reçoivent leur centre/établissement/salle/place,
     * les autres (alertes) sont remis à zéro (valeurs {@code null}) pour effacer une affectation périmée.
     */
    private static AffectationBatchJson construireBatch(Plan plan, List<CandidatJson> candidats) {
        Map<String, AffectationPlanifiee> affecteParCandidat = new HashMap<>();
        for (AffectationPlanifiee a : plan.affectations()) {
            CandidatJson cand = a.candidat();
            if (cand != null && cand.numeroInscription() != null && !cand.numeroInscription().isBlank()) {
                affecteParCandidat.put(cand.numeroInscription(), a);
            }
        }

        List<AffectationBatchJson.Item> items = new ArrayList<>();
        for (CandidatJson cand : candidats) {
            if (cand == null || cand.numeroInscription() == null || cand.numeroInscription().isBlank()) {
                continue;
            }
            AffectationPlanifiee a = affecteParCandidat.get(cand.numeroInscription());
            if (a != null) {
                SalleAvecLieuxJson s = a.salle();
                items.add(new AffectationBatchJson.Item(
                        cand.numeroInscription(),
                        s.idCentre(),
                        s.idEtablissement(),
                        s.idSalle(),
                        a.numeroPlace()));
            } else {
                items.add(new AffectationBatchJson.Item(cand.numeroInscription(), null, null, null, null));
            }
        }
        return new AffectationBatchJson(items);
    }

    private static RepartitionAffectation toAffectationEntity(AffectationPlanifiee a) {
        CandidatJson cand = a.candidat();
        SalleAvecLieuxJson s = a.salle();
        RepartitionAffectation e = new RepartitionAffectation();
        e.setNumeroInscription(cand.numeroInscription());
        e.setCandidatNom(nomComplet(cand));
        e.setVille(cand.ville());
        e.setNumeroConcours(cand.numeroConcours());
        e.setNomConcours(a.nomConcours());
        e.setCentreId(s.idCentre());
        e.setNomCentre(s.nomCentre());
        e.setEtablissementId(s.idEtablissement());
        e.setNomEtablissement(s.nomEtablissement());
        e.setSalleId(s.idSalle());
        e.setNomSalle(s.nomSalle());
        e.setNumeroPlace(a.numeroPlace());
        return e;
    }

    private static RepartitionAlerte toAlerteEntity(AlertePlanifiee al) {
        CandidatJson cand = al.candidat();
        RepartitionAlerte e = new RepartitionAlerte();
        e.setType(al.type());
        e.setNumeroInscription(cand != null ? cand.numeroInscription() : null);
        e.setCandidatNom(cand != null ? nomComplet(cand) : null);
        e.setVille(cand != null ? cand.ville() : null);
        e.setNumeroConcours(cand != null ? cand.numeroConcours() : null);
        e.setNomConcours(cand != null ? cand.nomConcours() : null);
        e.setCentreId(al.centreId());
        e.setNomCentre(al.nomCentre());
        e.setMessage(al.message());
        return e;
    }

    private static String nomComplet(CandidatJson c) {
        String nom = c.nom() == null ? "" : c.nom();
        String prenom = c.prenom() == null ? "" : c.prenom();
        return (prenom + " " + nom).trim();
    }

    private RepartitionRunResponse toResponse(RepartitionRun run) {
        List<AffectationResponse> affectations = run.getAffectations().stream()
                .map(a -> new AffectationResponse(
                        a.getNumeroInscription(),
                        a.getCandidatNom(),
                        a.getVille(),
                        a.getNumeroConcours(),
                        a.getNomConcours(),
                        a.getCentreId(),
                        a.getNomCentre(),
                        a.getEtablissementId(),
                        a.getNomEtablissement(),
                        a.getSalleId(),
                        a.getNomSalle(),
                        a.getNumeroPlace()))
                .toList();
        List<AlerteResponse> alertes = run.getAlertes().stream()
                .map(al -> new AlerteResponse(
                        al.getType() != null ? al.getType().name() : null,
                        al.getNumeroInscription(),
                        al.getCandidatNom(),
                        al.getVille(),
                        al.getNumeroConcours(),
                        al.getNomConcours(),
                        al.getCentreId(),
                        al.getNomCentre(),
                        al.getMessage()))
                .toList();
        return new RepartitionRunResponse(
                run.getId(),
                run.getDeclenchePar(),
                run.getStatut() != null ? run.getStatut().name() : null,
                run.getTotalCandidats(),
                run.getTotalAffectes(),
                run.getTotalAlertes(),
                run.getDemarreLe(),
                run.getTermineLe(),
                run.getMessage(),
                affectations,
                alertes);
    }

    private RepartitionRunSummaryResponse toSummary(RepartitionRun run) {
        return new RepartitionRunSummaryResponse(
                run.getId(),
                run.getDeclenchePar(),
                run.getStatut() != null ? run.getStatut().name() : null,
                run.getTotalCandidats(),
                run.getTotalAffectes(),
                run.getTotalAlertes(),
                run.getDemarreLe(),
                run.getTermineLe(),
                run.getMessage());
    }
}
