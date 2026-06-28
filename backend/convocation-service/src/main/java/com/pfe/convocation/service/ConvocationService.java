package com.pfe.convocation.service;

import com.pfe.convocation.domain.ConvocationEnvoi;
import com.pfe.convocation.domain.EnvoiStatut;
import com.pfe.convocation.repository.ConvocationEnvoiRepository;
import com.pfe.convocation.support.HttpRequestContext;
import com.pfe.convocation.web.dto.ConvocationResponse;
import com.pfe.convocation.web.dto.EnvoiDetailResponse;
import com.pfe.convocation.web.dto.EnvoiHistoriqueResponse;
import com.pfe.convocation.web.dto.EnvoiResponse;
import com.pfe.convocation.web.dto.ReinitialisationEnvoisResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Orchestration des convocations : agrégation des données (candidat + concours + lieux),
 * génération PDF, envoi groupé par e-mail et historisation des envois.
 */
@Service
public class ConvocationService {

    private final ConvocationAssembler assembler;
    private final ConvocationPdfGenerator pdfGenerator;
    private final ConvocationMailSender mailSender;
    private final ConvocationEnvoiRepository envoiRepository;
    private final ExecutorService envoiExecutor;

    public ConvocationService(
            ConvocationAssembler assembler,
            ConvocationPdfGenerator pdfGenerator,
            ConvocationMailSender mailSender,
            ConvocationEnvoiRepository envoiRepository,
            @Qualifier("convocationEnvoiExecutor") ExecutorService envoiExecutor) {
        this.assembler = assembler;
        this.pdfGenerator = pdfGenerator;
        this.mailSender = mailSender;
        this.envoiRepository = envoiRepository;
        this.envoiExecutor = envoiExecutor;
    }

    /** Aperçu de toutes les convocations prêtes (candidats affectés). */
    public List<ConvocationResponse> listerConvocations() {
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        return assembler.assemblerToutes(auth).stream().map(ConvocationService::toResponse).toList();
    }

    /** PDF de la convocation d'un candidat. 404 si le candidat est inconnu ou non affecté. */
    public byte[] genererPdf(String numeroInscription) {
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        ConvocationData data = assembler.assemblerUn(numeroInscription, auth);
        if (data == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Aucune convocation pour ce candidat (introuvable ou non affecté à une salle).");
        }
        return pdfGenerator.genererPdf(data);
    }

    /**
     * Envoie toutes les convocations par e-mail (« envoyer toutes les convocations »).
     *
     * <p>Chaque candidat est traité indépendamment : un échec d'envoi (e-mail manquant/invalide,
     * SMTP indisponible…) n'interrompt pas le lot, il est tracé en {@code ECHEC}. Chaque tentative
     * est historisée dans {@code convocation_envoi}.
     */
    public EnvoiResponse envoyerToutes() {
        if (!mailSender.estConfigure()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Service e-mail non configuré : définir MAIL_USERNAME et MAIL_PASSWORD (mot de passe"
                            + " d'application Gmail).");
        }
        String auth = HttpRequestContext.authorizationHeaderOrNull();
        String user = HttpRequestContext.currentUsernameOrNull();

        List<ConvocationData> convocations = assembler.assemblerToutes(auth);
        if (convocations.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Aucune convocation à envoyer : aucun candidat n'est affecté (lancez d'abord la répartition).");
        }

        Instant lanceLe = Instant.now();

        List<CompletableFuture<EnvoiCandidatResult>> futures = convocations.stream()
                .map(data -> CompletableFuture.supplyAsync(() -> envoyerUn(data), envoiExecutor))
                .toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();

        List<EnvoiCandidatResult> results = futures.stream()
                .map(CompletableFuture::join)
                .sorted(Comparator.comparing(
                        r -> r.data().numeroInscription(), String.CASE_INSENSITIVE_ORDER))
                .toList();

        int envoyes = 0;
        List<EnvoiDetailResponse> details = new ArrayList<>(results.size());
        List<ConvocationEnvoi> traces = new ArrayList<>(results.size());
        for (EnvoiCandidatResult result : results) {
            if (result.statut() == EnvoiStatut.ENVOYE) {
                envoyes++;
            }
            ConvocationData data = result.data();
            traces.add(toEnvoi(data, result.statut(), result.message(), user, lanceLe));
            details.add(new EnvoiDetailResponse(
                    data.numeroInscription(),
                    data.nomComplet(),
                    data.email(),
                    result.statut().name(),
                    result.message()));
        }

        envoiRepository.saveAll(traces);
        return new EnvoiResponse(convocations.size(), envoyes, convocations.size() - envoyes, lanceLe, details);
    }

    /** Génère le PDF et envoie un e-mail pour un candidat (appelé en parallèle). */
    private EnvoiCandidatResult envoyerUn(ConvocationData data) {
        try {
            if (data.email() == null || data.email().isBlank()) {
                throw new IllegalStateException("Adresse e-mail manquante pour le candidat.");
            }
            byte[] pdf = pdfGenerator.genererPdf(data);
            mailSender.envoyer(data.email(), sujet(data), corps(data), pdf, nomFichier(data));
            return new EnvoiCandidatResult(data, EnvoiStatut.ENVOYE, null);
        } catch (Exception e) {
            return new EnvoiCandidatResult(data, EnvoiStatut.ECHEC, resumeErreur(e));
        }
    }

    private record EnvoiCandidatResult(ConvocationData data, EnvoiStatut statut, String message) {}

    /** Historique des envois (du plus récent au plus ancien). */
    @Transactional(readOnly = true)
    public List<EnvoiHistoriqueResponse> listerHistorique() {
        return envoiRepository.findAllByOrderByEnvoyeLeDesc().stream()
                .map(ConvocationService::toHistorique)
                .toList();
    }

    /** Supprime tout l'historique des envois de convocations. */
    @Transactional
    public ReinitialisationEnvoisResponse reinitialiserHistorique() {
        long count = envoiRepository.count();
        envoiRepository.deleteAll();
        return new ReinitialisationEnvoisResponse(count);
    }

    private static String sujet(ConvocationData data) {
        String concours = data.nomConcours() != null && !data.nomConcours().isBlank()
                ? data.nomConcours()
                : "votre concours";
        return "Convocation à l'examen — " + concours;
    }

    private static String corps(ConvocationData data) {
        StringBuilder sb = new StringBuilder();
        sb.append("Bonjour ").append(data.nomComplet()).append(",\n\n");
        sb.append("Veuillez trouver ci-joint votre convocation à l'examen au format PDF.\n\n");
        sb.append("Récapitulatif :\n");
        sb.append("  • Numéro d'inscription : ").append(valeur(data.numeroInscription())).append('\n');
        sb.append("  • Concours : ")
                .append(valeur(data.nomConcours()))
                .append(" (")
                .append(valeur(data.numeroConcours()))
                .append(")\n");
        sb.append("  • Centre : ").append(valeur(data.nomCentre())).append('\n');
        sb.append("  • Établissement : ").append(valeur(data.nomEtablissement())).append('\n');
        sb.append("  • Salle : ").append(valeur(data.nomSalle())).append('\n');
        sb.append("  • Place : ")
                .append(data.numeroPlace() != null ? "N° " + data.numeroPlace() : "—")
                .append("\n\n");
        sb.append("Merci de vous présenter au moins 30 minutes avant le début de l'épreuve, muni(e) de"
                + " cette convocation et d'une pièce d'identité.\n\n");
        sb.append("Cordialement,\nL'organisation des concours.");
        return sb.toString();
    }

    private static String nomFichier(ConvocationData data) {
        String suffixe = data.numeroInscription() == null ? "candidat" : data.numeroInscription();
        return "convocation-" + suffixe.replaceAll("[^A-Za-z0-9_-]", "_") + ".pdf";
    }

    private static ConvocationEnvoi toEnvoi(
            ConvocationData data, EnvoiStatut statut, String message, String user, Instant date) {
        ConvocationEnvoi e = new ConvocationEnvoi();
        e.setNumeroInscription(data.numeroInscription());
        e.setCandidatNom(data.nomComplet());
        e.setEmail(data.email());
        e.setNumeroConcours(data.numeroConcours());
        e.setNomConcours(data.nomConcours());
        e.setStatut(statut);
        e.setMessage(message);
        e.setDeclenchePar(user);
        e.setEnvoyeLe(date);
        return e;
    }

    private static ConvocationResponse toResponse(ConvocationData d) {
        return new ConvocationResponse(
                d.numeroInscription(),
                d.nom(),
                d.prenom(),
                d.email(),
                d.numeroConcours(),
                d.nomConcours(),
                d.nomCentre(),
                d.nomEtablissement(),
                d.nomSalle(),
                d.dateHeureExamen(),
                d.numeroPlace());
    }

    private static EnvoiHistoriqueResponse toHistorique(ConvocationEnvoi e) {
        return new EnvoiHistoriqueResponse(
                e.getId(),
                e.getNumeroInscription(),
                e.getCandidatNom(),
                e.getEmail(),
                e.getNumeroConcours(),
                e.getNomConcours(),
                e.getStatut() != null ? e.getStatut().name() : null,
                e.getMessage(),
                e.getDeclenchePar(),
                e.getEnvoyeLe());
    }

    private static String resumeErreur(Exception ex) {
        String raison = ex.getMessage();
        if (raison == null || raison.isBlank()) {
            raison = ex.getClass().getSimpleName();
        }
        return raison.length() > 500 ? raison.substring(0, 500) : raison;
    }

    private static String valeur(String v) {
        return v == null || v.isBlank() ? "—" : v;
    }
}
