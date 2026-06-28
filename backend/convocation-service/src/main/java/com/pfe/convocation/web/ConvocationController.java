package com.pfe.convocation.web;

import com.pfe.convocation.service.ConvocationService;
import com.pfe.convocation.web.dto.ConvocationResponse;
import com.pfe.convocation.web.dto.EnvoiHistoriqueResponse;
import com.pfe.convocation.web.dto.EnvoiResponse;
import com.pfe.convocation.web.dto.ReinitialisationEnvoisResponse;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/convocations")
public class ConvocationController {

    private final ConvocationService convocationService;

    public ConvocationController(ConvocationService convocationService) {
        this.convocationService = convocationService;
    }

    /** Aperçu de toutes les convocations prêtes (candidats affectés). */
    @GetMapping
    public List<ConvocationResponse> lister() {
        return convocationService.listerConvocations();
    }

    /** Téléchargement (aperçu) de la convocation d'un candidat au format PDF. */
    @GetMapping("/{numeroInscription}/pdf")
    public ResponseEntity<byte[]> telechargerPdf(@PathVariable String numeroInscription) {
        byte[] pdf = convocationService.genererPdf(numeroInscription);
        ContentDisposition disposition = ContentDisposition.inline()
                .filename("convocation-" + numeroInscription.replaceAll("[^A-Za-z0-9_-]", "_") + ".pdf")
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(pdf);
    }

    /** Envoie toutes les convocations aux candidats par e-mail (« envoyer toutes les convocations »). */
    @PostMapping("/envoyer")
    public EnvoiResponse envoyerToutes() {
        return convocationService.envoyerToutes();
    }

    /** Historique des envois de convocations. */
    @GetMapping("/envois")
    public List<EnvoiHistoriqueResponse> historique() {
        return convocationService.listerHistorique();
    }

    /** Supprime tout l'historique des envois de convocations. */
    @PostMapping("/envois/reinitialiser")
    public ReinitialisationEnvoisResponse reinitialiserHistorique() {
        return convocationService.reinitialiserHistorique();
    }
}
