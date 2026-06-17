package com.pfe.lieux.concours;



import java.util.ArrayList;

import java.util.List;

import org.springframework.http.HttpHeaders;

import org.springframework.http.HttpStatus;

import org.springframework.http.HttpStatusCode;

import org.springframework.http.MediaType;

import org.springframework.stereotype.Component;

import org.springframework.web.client.ResourceAccessException;

import org.springframework.web.client.RestClient;

import org.springframework.web.server.ResponseStatusException;



/**

 * Vérifie auprès du service concours qu'un numéro de concours existe (pour {@code salle.numero_concours}).

 */

@Component

public class ConcoursExistenceClient {



    private final RestClient concoursRestClient;



    public ConcoursExistenceClient(RestClient concoursRestClient) {

        this.concoursRestClient = concoursRestClient;

    }



    public List<String> listConcoursNumerosByCentre(Long centreId, String authorizationHeader) {

        if (centreId == null

                || authorizationHeader == null

                || authorizationHeader.isBlank()

                || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {

            return List.of();

        }

        try {

            ConcoursHeadJson[] body = concoursRestClient

                    .get()

                    .uri("/api/concours/by-centre/{centreId}", centreId)

                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader)

                    .retrieve()

                    .onStatus(

                            status -> status.value() == 404,

                            (request, response) -> {

                                throw new EmptyConcoursList();

                            })

                    .onStatus(

                            status -> status.value() == 401 || status.value() == 403,

                            (request, response) -> {

                                throw new ResponseStatusException(

                                        HttpStatus.BAD_GATEWAY,

                                        "Le service concours a refusé l'authentification lors de la récupération des concours du centre");

                            })

                    .onStatus(

                            HttpStatusCode::is5xxServerError,

                            (request, response) -> {

                                throw new ResponseStatusException(

                                        HttpStatus.BAD_GATEWAY,

                                        "Le service concours a renvoyé une erreur lors de la récupération des concours du centre");

                            })

                    .body(ConcoursHeadJson[].class);

            if (body == null || body.length == 0) {

                return List.of();

            }

            List<String> numeros = new ArrayList<>(body.length);

            for (ConcoursHeadJson head : body) {

                if (head.numeroConcours() != null && !head.numeroConcours().isBlank()) {

                    numeros.add(head.numeroConcours());

                }

            }

            return numeros;

        } catch (EmptyConcoursList e) {

            return List.of();

        } catch (ResourceAccessException e) {

            throw new ResponseStatusException(

                    HttpStatus.SERVICE_UNAVAILABLE,

                    "Service concours indisponible : " + e.getMessage());

        }

    }



    /**
     * Ajoute (de façon idempotente) un centre aux affectations d'un concours dans le service concours.
     * Utilisé quand une salle est rattachée à un concours : le centre apparaît alors dans la liste des concours.
     */
    public void ajouterAffectationConcours(
            String numeroConcours, Long idCentre, String nomCentre, String authorizationHeader) {
        if (numeroConcours == null || numeroConcours.isBlank() || idCentre == null) {
            return;
        }
        if (authorizationHeader == null
                || authorizationHeader.isBlank()
                || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "En-tête Authorization (Bearer) requis pour synchroniser le centre avec le service concours");
        }
        try {
            concoursRestClient
                    .post()
                    .uri("/api/concours/{numeroConcours}/affectations", numeroConcours.trim())
                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new AffectationJson(idCentre, nomCentre))
                    .retrieve()
                    .onStatus(
                            status -> status.value() == 401 || status.value() == 403,
                            (request, response) -> {
                                throw new ResponseStatusException(
                                        HttpStatus.BAD_GATEWAY,
                                        "Le service concours a refusé l'authentification lors de la synchronisation du centre");
                            })
                    .onStatus(
                            HttpStatusCode::is5xxServerError,
                            (request, response) -> {
                                throw new ResponseStatusException(
                                        HttpStatus.BAD_GATEWAY,
                                        "Le service concours a renvoyé une erreur lors de la synchronisation du centre");
                            })
                    .toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Service concours indisponible : " + e.getMessage());
        }
    }

    /** Corps JSON envoyé à concours-service (aligné sur CentreAffectationRequest). */
    private record AffectationJson(Long idCentre, String nomCentre) {}

    /**
     * Propage le renommage d'un centre vers concours-service : {@code nom_centre} y est dénormalisé,
     * donc les affectations existantes doivent être mises à jour pour rester cohérentes.
     */
    public void renommerCentreDansConcours(Long idCentre, String nouveauNom, String authorizationHeader) {
        if (idCentre == null || nouveauNom == null || nouveauNom.isBlank()) {
            return;
        }
        if (authorizationHeader == null
                || authorizationHeader.isBlank()
                || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "En-tête Authorization (Bearer) requis pour propager le renommage au service concours");
        }
        try {
            concoursRestClient
                    .patch()
                    .uri("/api/concours/affectations/centre/{idCentre}", idCentre)
                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new RenommageJson(nouveauNom))
                    .retrieve()
                    .onStatus(
                            status -> status.value() == 401 || status.value() == 403,
                            (request, response) -> {
                                throw new ResponseStatusException(
                                        HttpStatus.BAD_GATEWAY,
                                        "Le service concours a refusé l'authentification lors du renommage du centre");
                            })
                    .onStatus(
                            HttpStatusCode::is5xxServerError,
                            (request, response) -> {
                                throw new ResponseStatusException(
                                        HttpStatus.BAD_GATEWAY,
                                        "Le service concours a renvoyé une erreur lors du renommage du centre");
                            })
                    .toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Service concours indisponible : " + e.getMessage());
        }
    }

    /** Corps JSON du renommage envoyé à concours-service (aligné sur CentreRenommageRequest). */
    private record RenommageJson(String nomCentre) {}

    /** Signale en interne qu'un 404 du service concours doit être traité comme une liste vide. */

    private static final class EmptyConcoursList extends RuntimeException {

        EmptyConcoursList() {

            super(null, null, false, false);

        }

    }



    public void assertConcoursExists(String numeroConcours, String authorizationHeader) {

        if (numeroConcours == null || numeroConcours.isBlank()) {

            return;

        }

        if (authorizationHeader == null || authorizationHeader.isBlank()) {

            throw new ResponseStatusException(

                    HttpStatus.UNAUTHORIZED,

                    "En-tête Authorization (Bearer) requis pour valider le concours auprès du service concours");

        }

        if (!authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {

            throw new ResponseStatusException(

                    HttpStatus.UNAUTHORIZED,

                    "En-tête Authorization doit être de type Bearer pour valider le concours");

        }

        try {

            concoursRestClient

                    .get()

                    .uri("/api/concours/{numeroConcours}", numeroConcours.trim())

                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader)

                    .retrieve()

                    .onStatus(

                            status -> status.value() == 404,

                            (request, response) -> {

                                throw new ResponseStatusException(

                                        HttpStatus.BAD_REQUEST,

                                        "Le concours « "

                                                + numeroConcours.trim()

                                                + " » n'existe pas dans le service concours");

                            })

                    .onStatus(

                            status -> status.value() == 401 || status.value() == 403,

                            (request, response) -> {

                                throw new ResponseStatusException(

                                        HttpStatus.BAD_GATEWAY,

                                        "Le service concours a refusé l'authentification lors de la validation");

                            })

                    .onStatus(

                            HttpStatusCode::is5xxServerError,

                            (request, response) -> {

                                throw new ResponseStatusException(

                                        HttpStatus.BAD_GATEWAY,

                                        "Le service concours a renvoyé une erreur lors de la validation");

                            })

                    .toBodilessEntity();

        } catch (ResourceAccessException e) {

            throw new ResponseStatusException(

                    HttpStatus.SERVICE_UNAVAILABLE,

                    "Service concours indisponible : " + e.getMessage());

        }

    }

}


