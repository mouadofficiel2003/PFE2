package com.pfe.repartition.service;

import com.pfe.repartition.domain.RepartitionRun;
import com.pfe.repartition.repository.RepartitionRunRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Accès transactionnel au dépôt des runs, isolé de l'orchestration (qui réalise des appels REST
 * hors transaction). Le {@code save} cascade les affectations et alertes.
 */
@Component
public class RepartitionRunRepositoryFacade {

    private final RepartitionRunRepository repository;

    public RepartitionRunRepositoryFacade(RepartitionRunRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public RepartitionRun enregistrer(RepartitionRun run) {
        return repository.save(run);
    }

    @Transactional(readOnly = true)
    public List<RepartitionRun> listerTous() {
        return repository.findAllByOrderByDemarreLeDesc();
    }

    @Transactional(readOnly = true)
    public Optional<RepartitionRun> charger(Long id) {
        return repository.findById(id);
    }

    @Transactional(readOnly = true)
    public boolean existe(Long id) {
        return repository.existsById(id);
    }

    /** Supprime une exécution (les affectations/alertes liées sont supprimées en cascade). */
    @Transactional
    public void supprimer(Long id) {
        repository.deleteById(id);
    }
}
