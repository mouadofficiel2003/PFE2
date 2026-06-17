package com.pfe.auth.web;

import com.pfe.auth.dto.GestionnaireCreateRequest;
import com.pfe.auth.dto.GestionnaireResponse;
import com.pfe.auth.dto.GestionnaireUpdateRequest;
import com.pfe.auth.service.GestionnaireService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints réservés à l'administrateur pour gérer les comptes gestionnaires. L'accès est restreint
 * au rôle ADMINISTRATEUR par {@code SecurityConfig}.
 */
@RestController
@RequestMapping("/auth/gestionnaires")
public class GestionnaireController {

    private final GestionnaireService gestionnaireService;

    public GestionnaireController(GestionnaireService gestionnaireService) {
        this.gestionnaireService = gestionnaireService;
    }

    @GetMapping
    public List<GestionnaireResponse> lister() {
        return gestionnaireService.lister();
    }

    @GetMapping("/{id}")
    public GestionnaireResponse obtenir(@PathVariable Long id) {
        return gestionnaireService.obtenir(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GestionnaireResponse creer(@Valid @RequestBody GestionnaireCreateRequest body) {
        return gestionnaireService.creer(body);
    }

    @PutMapping("/{id}")
    public GestionnaireResponse mettreAJour(
            @PathVariable Long id, @Valid @RequestBody GestionnaireUpdateRequest body) {
        return gestionnaireService.mettreAJour(id, body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void supprimer(@PathVariable Long id) {
        gestionnaireService.supprimer(id);
    }
}
