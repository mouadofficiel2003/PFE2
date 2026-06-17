package com.pfe.auth.repository;

import com.pfe.auth.domain.RoleUtilisateur;
import com.pfe.auth.domain.Utilisateur;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UtilisateurRepository extends JpaRepository<Utilisateur, Long> {

    Optional<Utilisateur> findByNomUtilisateur(String nomUtilisateur);

    boolean existsByNomUtilisateur(String nomUtilisateur);

    List<Utilisateur> findByRoleOrderByNomUtilisateurAsc(RoleUtilisateur role);
}
