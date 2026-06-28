package com.pfe.convocation.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Envoie une convocation (PDF en pièce jointe) par e-mail via SMTP (Gmail).
 *
 * <p>L'envoi n'est possible que si les identifiants Gmail sont configurés
 * ({@code spring.mail.username} / {@code spring.mail.password}). Sinon {@link #estConfigure()}
 * renvoie {@code false} et le service amont court-circuite l'opération avec un 503 explicite.
 *
 * <p>Les erreurs SMTP temporaires (421 Gmail, timeout réseau…) déclenchent des nouvelles tentatives
 * avec un délai croissant avant d'échouer définitivement.
 */
@Component
public class ConvocationMailSender {

    private final JavaMailSender mailSender;
    private final String from;
    private final boolean configure;
    private final int retryMax;
    private final long retryDelayMs;

    public ConvocationMailSender(
            JavaMailSender mailSender,
            @Value("${spring.mail.username:}") String username,
            @Value("${convocation.mail.from:}") String from,
            @Value("${convocation.envoi.retry.max:3}") int retryMax,
            @Value("${convocation.envoi.retry.delay-ms:3000}") long retryDelayMs) {
        this.mailSender = mailSender;
        this.from = (from == null || from.isBlank()) ? username : from;
        this.configure = username != null && !username.isBlank();
        this.retryMax = Math.max(1, retryMax);
        this.retryDelayMs = Math.max(500L, retryDelayMs);
    }

    /** Les identifiants SMTP sont-ils renseignés (envoi possible) ? */
    public boolean estConfigure() {
        return configure;
    }

    /**
     * Envoie un e-mail avec le PDF de convocation en pièce jointe.
     *
     * @throws MessagingException si la composition ou l'envoi échoue (e-mail invalide, SMTP KO…)
     */
    public void envoyer(String destinataire, String sujet, String corps, byte[] pdf, String nomFichier)
            throws MessagingException {
        MessagingException derniereErreur = null;
        for (int tentative = 1; tentative <= retryMax; tentative++) {
            try {
                envoyerUneFois(destinataire, sujet, corps, pdf, nomFichier);
                return;
            } catch (MessagingException e) {
                derniereErreur = e;
                if (tentative >= retryMax || !estErreurTransitoire(e)) {
                    throw e;
                }
                pause(retryDelayMs * tentative);
            }
        }
        if (derniereErreur != null) {
            throw derniereErreur;
        }
    }

    private void envoyerUneFois(String destinataire, String sujet, String corps, byte[] pdf, String nomFichier)
            throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        if (from != null && !from.isBlank()) {
            helper.setFrom(from);
        }
        helper.setTo(destinataire);
        helper.setSubject(sujet);
        helper.setText(corps, false);
        helper.addAttachment(nomFichier, new ByteArrayResource(pdf));
        mailSender.send(message);
    }

    /** Erreurs réseau ou limites Gmail temporaires — une nouvelle tentative peut réussir. */
    private static boolean estErreurTransitoire(Throwable erreur) {
        for (Throwable courant = erreur; courant != null; courant = courant.getCause()) {
            String message = courant.getMessage();
            if (message != null) {
                String m = message.toLowerCase();
                if (m.contains("421")
                        || m.contains("try again later")
                        || m.contains("temporary system problem")
                        || m.contains("read timed out")
                        || m.contains("connect timed out")
                        || m.contains("connection reset")
                        || m.contains("broken pipe")
                        || m.contains("421-4.3.0")) {
                    return true;
                }
            }
            if (courant instanceof java.net.SocketTimeoutException) {
                return true;
            }
        }
        return false;
    }

    private static void pause(long delayMs) throws MessagingException {
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MessagingException("Envoi interrompu pendant l'attente avant nouvelle tentative.", e);
        }
    }
}
