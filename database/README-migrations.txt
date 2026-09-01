Migrations base de données (Flyway)
====================================

Les scripts SQL ne sont plus appliqués à la main depuis ce dossier. Chaque microservice
applique ses migrations au démarrage (table flyway_schema_history dans la base ciblée).

  • Auth (base PFE_Data)
      backend/auth-service/src/main/resources/db/migration/
      V1__init_auth_schema.sql — table utilisateur + comptes admin / gestionnaire

  • Candidats (base data_candidats)
      backend/candidat-service/src/main/resources/db/migration/
      V1__init_candidat.sql — PK numero_inscription ; ref concours via numero_concours

  • Concours (base data_concours)
      backend/concours-service/src/main/resources/db/migration/
      V1__init_concours.sql — PK numero_concours, table concours_affectation_centre
      V2__concours_centre_lien.sql — index centre_id, commentaires lien centre ↔ concours
      V3__concours_affectation_id_centre.sql — renommage centre_id → id_centre (NOT NULL),
          contrainte unique (numero_concours, id_centre)

  • Lieux — centres, établissements, salles (base data_lieux)
      backend/lieux-service/src/main/resources/db/migration/
      V1__init_lieux.sql — PK id_centre / id_etablissement / id_salle ; salle.numero_concours

  • Répartition automatique (base data_repartition)
      backend/repartition-service/src/main/resources/db/migration/
      V1__init_repartition.sql — historique runs, affectations, alertes (refs logiques)
      V2__repartition_run_message.sql — colonne message sur repartition_run (échecs)

  • Convocations (base data_convocations)
      backend/convocation-service/src/main/resources/db/migration/
      V1__init_convocation.sql — table convocation_envoi (tentatives ENVOYE / ECHEC)

Identifiants partagés (références logiques, pas de FK inter-bases)
------------------------------------------------------------------
  numero_inscription  — candidat (PK candidat-service)
  numero_concours     — concours (PK concours-service) ; ref dans candidat, salle, repartition
  id_centre           — centre (PK lieux-service) ; ref dans concours_affectation_centre, candidat
  id_etablissement    — établissement (PK lieux-service)
  id_salle            — salle (PK lieux-service)

Ordre d'exploitation
--------------------
  1. Créer les bases PostgreSQL vides (CREATE DATABASE …) :
       PFE_Data, data_candidats, data_concours, data_lieux, data_repartition,
       data_convocations.
  2. Démarrer les services (run-backend.ps1 ou un par un). Flyway s'exécute au boot.
     L'ordre entre services n'a pas d'importance pour Flyway (bases indépendantes).

Ordre logique pour les données métier (après migration)
-------------------------------------------------------
  1. Centres (lieux-service)
  2. Concours + affectation centres par id_centre (concours-service)
  3. Établissements et salles liées à un numero_concours (lieux-service)
  4. Candidats (candidat-service — import Excel ou mise à jour)
  5. Répartition (repartition-service — POST /api/repartition/run)
  6. Convocations (convocation-service — aperçu puis POST /api/convocations/envoyer)

Évolution du schéma
-------------------
Ajouter V4__….sql, V5__….sql, etc. dans le service concerné. Flyway n'exécute chaque
fichier qu'une seule fois par base ; pas besoin de DROP pour rejouer l'historique.

Base déjà initialisée sans Flyway
---------------------------------
Si les tables existent déjà mais sans table flyway_schema_history, soit recréer la
base en développement, soit utiliser une baseline Flyway (voir documentation Flyway
« baseline ») pour marquer les versions déjà appliquées sans réexécuter les scripts.
