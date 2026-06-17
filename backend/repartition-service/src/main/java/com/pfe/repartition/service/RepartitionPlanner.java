package com.pfe.repartition.service;



import com.pfe.repartition.domain.AlerteType;

import com.pfe.repartition.geo.CarteMaroc;

import com.pfe.repartition.geo.Coordonnee;

import com.pfe.repartition.geo.ReferentielRegionsMaroc;

import com.pfe.repartition.remote.dto.CandidatJson;

import com.pfe.repartition.remote.dto.ConcoursJson;

import com.pfe.repartition.remote.dto.SalleAvecLieuxJson;

import java.util.ArrayList;

import java.util.Comparator;

import java.util.HashMap;

import java.util.LinkedHashMap;

import java.util.List;

import java.util.Map;

import java.util.Optional;

import org.springframework.stereotype.Component;



/**

 * Algorithme pur de répartition (sans I/O). Pour chaque candidat :

 * <ol>

 *   <li>on repère le centre le plus adapté : même ville, puis même région administrative

 *       ({@link ReferentielRegionsMaroc}), puis région la plus proche (distance réelle en km via

 *       {@link CarteMaroc}) ;</li>

 *   <li>on lui réserve une place dans la première salle de ce centre ayant de la capacité restante ;</li>

 *   <li>sinon on émet une alerte (capacité dépassée, aucun centre, concours inconnu).</li>

 * </ol>

 */

@Component

public class RepartitionPlanner {



    private final CarteMaroc carteMaroc;

    private final ReferentielRegionsMaroc referentielRegions;



    public RepartitionPlanner(CarteMaroc carteMaroc, ReferentielRegionsMaroc referentielRegions) {

        this.carteMaroc = carteMaroc;

        this.referentielRegions = referentielRegions;

    }



    public Plan planifier(

            List<ConcoursJson> concours,

            Map<String, List<SalleAvecLieuxJson>> sallesParConcours,

            List<CandidatJson> candidats) {



        Map<String, ConcoursJson> concoursByNumero = new HashMap<>();

        for (ConcoursJson c : concours) {

            if (c != null && c.numeroConcours() != null && !c.numeroConcours().isBlank()) {

                concoursByNumero.put(c.numeroConcours(), c);

            }

        }



        Map<String, ContexteConcours> contexteParConcours = new HashMap<>();

        Map<Long, Integer> usageParSalle = new HashMap<>();



        List<AffectationPlanifiee> affectations = new ArrayList<>();

        List<AlertePlanifiee> alertes = new ArrayList<>();



        List<CandidatJson> ordonnes = new ArrayList<>(candidats);

        ordonnes.sort(Comparator.comparing(

                CandidatJson::numeroInscription, Comparator.nullsLast(Comparator.naturalOrder())));



        for (CandidatJson cand : ordonnes) {

            String numeroConcours = cand.numeroConcours();

            if (numeroConcours == null

                    || numeroConcours.isBlank()

                    || !concoursByNumero.containsKey(numeroConcours)) {

                alertes.add(new AlertePlanifiee(

                        AlerteType.CONCOURS_INCONNU,

                        cand,

                        null,

                        null,

                        "Candidat rattaché à un concours inconnu ou non planifié (numeroConcours="

                                + numeroConcours + ")."));

                continue;

            }

            ConcoursJson c = concoursByNumero.get(numeroConcours);

            ContexteConcours ctx = contexteParConcours.computeIfAbsent(

                    numeroConcours,

                    num -> construireContexte(sallesParConcours.getOrDefault(num, List.of())));



            if (ctx.centres().isEmpty()) {

                alertes.add(new AlertePlanifiee(

                        AlerteType.AUCUN_CENTRE_DISPONIBLE,

                        cand,

                        null,

                        null,

                        "Aucune salle disponible pour le concours « " + c.nomConcours() + " »."));

                continue;

            }



            Optional<Coordonnee> villeCoord = carteMaroc.coord(cand.ville());

            if (villeCoord.isEmpty() && referentielRegions.regionDe(cand.ville()).isEmpty()) {

                alertes.add(new AlertePlanifiee(

                        AlerteType.VILLE_NON_GEOLOCALISEE,

                        cand,

                        null,

                        null,

                        "Ville « " + safe(cand.ville())

                                + " » inconnue (ni géolocalisée ni rattachée à une région) :"

                                + " impossible de déterminer le centre le plus proche."));

                continue;

            }



            CentreCible centre = null;

            SalleAvecLieuxJson salle = null;

            for (CentreCible candidatCentre : centresParProximite(ctx.centres(), cand.ville(), villeCoord)) {

                salle = premiereSalleLibre(candidatCentre, usageParSalle);

                if (salle != null) {

                    centre = candidatCentre;

                    break;

                }

            }

            if (centre == null) {

                CentreCible plusProche = centreLePlusProche(ctx.centres(), cand.ville(), villeCoord);

                alertes.add(new AlertePlanifiee(

                        AlerteType.CAPACITE_DEPASSEE,

                        cand,

                        plusProche != null ? plusProche.centreId() : null,

                        plusProche != null ? plusProche.nomCentre() : null,

                        "Tous les centres disponibles sont pleins pour le concours « " + c.nomConcours()

                                + " » (candidat de « " + safe(cand.ville()) + " »)."));

                continue;

            }

            int place = usageParSalle.merge(salle.idSalle(), 1, Integer::sum);

            affectations.add(new AffectationPlanifiee(cand, c.nomConcours(), salle, place));

        }



        return new Plan(List.copyOf(affectations), List.copyOf(alertes));

    }



    private static ContexteConcours construireContexte(List<SalleAvecLieuxJson> salles) {

        Map<Long, CentreEnConstruction> parCentre = new LinkedHashMap<>();

        for (SalleAvecLieuxJson s : salles) {

            if (s == null || s.idCentre() == null || s.nombrePlaces() <= 0) {

                continue;

            }

            parCentre

                    .computeIfAbsent(s.idCentre(), id -> new CentreEnConstruction(id, s.nomCentre()))

                    .salles

                    .add(s);

        }

        List<CentreCible> centres = new ArrayList<>();

        for (CentreEnConstruction c : parCentre.values()) {

            c.salles.sort(Comparator.comparing(

                            (SalleAvecLieuxJson s) -> s.nomSalle(),

                            Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER))

                    .thenComparing(SalleAvecLieuxJson::idSalle, Comparator.nullsLast(Comparator.naturalOrder())));

            centres.add(new CentreCible(c.centreId, c.nomCentre, List.copyOf(c.salles)));

        }

        centres.sort(Comparator.comparing(CentreCible::centreId, Comparator.nullsLast(Comparator.naturalOrder())));

        return new ContexteConcours(List.copyOf(centres));

    }



    private List<CentreCible> centresParProximite(

            List<CentreCible> centres, String villeCandidat, Optional<Coordonnee> villeCoord) {

        List<String> noms = centres.stream().map(CentreCible::nomCentre).toList();

        boolean privilegierRegion = referentielRegions.auMoinsUnCentreDansRegion(villeCandidat, noms);

        List<CentreCible> tries = new ArrayList<>(centres);

        tries.sort(Comparator.comparingDouble(c -> referentielRegions.scoreProximite(

                villeCandidat, c.nomCentre(), villeCoord, privilegierRegion)));

        return tries;

    }



    private CentreCible centreLePlusProche(

            List<CentreCible> centres, String villeCandidat, Optional<Coordonnee> villeCoord) {

        List<CentreCible> tries = centresParProximite(centres, villeCandidat, villeCoord);

        return tries.isEmpty() ? null : tries.get(0);

    }



    private static SalleAvecLieuxJson premiereSalleLibre(CentreCible centre, Map<Long, Integer> usageParSalle) {

        for (SalleAvecLieuxJson s : centre.salles()) {

            int utilise = usageParSalle.getOrDefault(s.idSalle(), 0);

            if (utilise < s.nombrePlaces()) {

                return s;

            }

        }

        return null;

    }



    private static String safe(String s) {

        return s == null ? "" : s;

    }



    private static final class CentreEnConstruction {

        private final Long centreId;

        private final String nomCentre;

        private final List<SalleAvecLieuxJson> salles = new ArrayList<>();



        private CentreEnConstruction(Long centreId, String nomCentre) {

            this.centreId = centreId;

            this.nomCentre = nomCentre;

        }

    }



    record CentreCible(Long centreId, String nomCentre, List<SalleAvecLieuxJson> salles) {}



    record ContexteConcours(List<CentreCible> centres) {}



    public record AffectationPlanifiee(

            CandidatJson candidat, String nomConcours, SalleAvecLieuxJson salle, int numeroPlace) {}



    public record AlertePlanifiee(

            AlerteType type, CandidatJson candidat, Long centreId, String nomCentre, String message) {}



    public record Plan(List<AffectationPlanifiee> affectations, List<AlertePlanifiee> alertes) {}

}


