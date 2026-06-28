# PFE — Plateforme de gestion de concours

Application full-stack (microservices) pour la gestion de **concours**, **candidats**,
**lieux** (centres, établissements, salles), de la **répartition automatique** des
candidats dans les salles et de l'envoi des **convocations** par e-mail, avec
authentification JWT.

- **Frontend** : React 19 + TypeScript (Vite), SPA sur le port `5173`.
- **Backend** : une **API Gateway** (Spring Cloud Gateway) devant **6 microservices**
  Spring Boot 3.4.4 (Java 17), modules Maven sous un POM parent (`backend/pom.xml`).
- **Base de données** : PostgreSQL, **une base par service** (database-per-service).
- **Auth** : JWT HS256 sans état, secret partagé validé par chaque service ressource.

> Pour la description détaillée de l'architecture (flux, communication inter-services,
> règles de répartition, schémas, API), voir [`ARCHITECTURE.md`](ARCHITECTURE.md).

## État du projet

Revu le **25 juin 2026** — le dépôt est cohérent et prêt pour le développement local :

| Vérification | Résultat |
|--------------|----------|
| Modules Maven (gateway + 6 services) | 7 modules alignés dans `backend/pom.xml` |
| Tests backend (`.\mvnw.cmd test`) | OK — 8 classes de tests (candidat, concours, lieux, repartition) |
| Build frontend (`npm run build`) | OK — TypeScript + bundle Vite |
| Routage gateway ↔ services | Préfixes documentés = `application.yml` |
| Migrations Flyway | 9 scripts répartis sur les 6 services |
| TODO / FIXME dans le code | Aucun repéré |

Points d'attention (non bloquants) :

- Les diagrammes UML sont fournis en **sources PlantUML** (`.puml`) ; les PNG ne sont
  pas versionnés — génération optionnelle via `scripts/plantuml-png.mjs`.
- L'envoi de convocations nécessite `MAIL_USERNAME` / `MAIL_PASSWORD` (Gmail) ;
  sans cela le service démarre mais renvoie `503` à l'envoi.
- La répartition n'est **pas atomique** : un échec après l'écriture des affectations
  peut laisser des candidats mis à jour sans run complet (voir ARCHITECTURE.md).

## Structure du projet

| Dossier / fichier | Description |
|-------------------|-------------|
| `backend/` | API Gateway + microservices Spring Boot (auth, candidat, concours, lieux, repartition, convocation) |
| `frontend/` | Interface React + TypeScript (Vite) |
| `database/` | Documentation des migrations Flyway (scripts dans chaque service) |
| `scripts/` | Scripts utilitaires (seed de démo, génération PNG PlantUML, corps JSON d'exemple) |
| `ARCHITECTURE.md` | Document de référence de l'architecture (en anglais) |
| `verify-env.ps1` | Vérification de l'environnement de développement (Java, Maven, Node, PostgreSQL) |
| `diagramme-*.puml` | Diagrammes UML (cas d'utilisation, classes, séquences) |

## Prérequis

- **Java 17+** (JDK complet, pas seulement JRE)
- **Maven** (ou le wrapper `mvnw` / `mvnw.cmd` fourni dans `backend/`)
- **Node.js 18+** et npm
- **PostgreSQL 14+** (le trigger candidat utilise `EXECUTE FUNCTION`, requis depuis PG 14)

Vérifier l'environnement :

```powershell
.\verify-env.ps1
```

## Services backend

| Service | Port | Base de données | Responsabilité |
|---------|------|-----------------|----------------|
| api-gateway | 8080 | — | Point d'entrée unique : routage par préfixe + CORS |
| auth-service | 8081 | `PFE_Data` | Connexion, émission JWT, comptes utilisateurs |
| candidat-service | 8082 | `data_candidats` | CRUD candidats + import Excel + affectation par lot |
| concours-service | 8083 | `data_concours` | Concours + affectation des centres |
| lieux-service | 8084 | `data_lieux` | Centres, établissements, salles |
| repartition-service | 8085 | `data_repartition` | Répartition automatique (orchestration + historique) |
| convocation-service | 8086 | `data_convocations` | Convocations PDF + envoi e-mail (Gmail) + historique des envois |

### Routage API Gateway

Le front (via le proxy Vite) appelle la gateway sur `8080`, qui route par préfixe.
L'en-tête `Authorization: Bearer <jwt>` est transmis tel quel ; chaque service valide le JWT lui-même.

  in | Service cible |
|-------------------|---------------|
| `/auth/**` | auth-service (8081) |
| `/api/candidats/**` | candidat-service (8082) |
| `/api/concours/**` | concours-service (8083) |
| `/api/centres/**`, `/api/etablissements/**`, `/api/salles/**` | lieux-service (8084) |
| `/api/repartition/**` | repartition-service (8085) |
| `/api/convocations/**` | convocation-service (8086) |

Les appels **inter-services** (validation croisée, répartition, assemblage des convocations)
passent directement entre services (`RestClient` sur les ports 8081–8086), pas par la gateway.

La gateway expose aussi les endpoints Actuator : `/actuator/health`, `/actuator/info`, `/actuator/gateway`.

## Démarrage

### 1. Base de données

Créer les 6 bases PostgreSQL vides (identifiants par défaut en dev : `postgres` / `postgres`
sur `localhost:5432`) :

```sql
CREATE DATABASE "PFE_Data";
CREATE DATABASE data_candidats;
CREATE DATABASE data_concours;
CREATE DATABASE data_lieux;
CREATE DATABASE data_repartition;
CREATE DATABASE data_convocations;
```

Le schéma est géré par **Flyway** : chaque service applique ses migrations
(`classpath:db/migration`) à son démarrage. Aucun script SQL n'est à exécuter à la main.
Détails dans [`database/README-migrations.txt`](database/README-migrations.txt).

### 2. Backend

```powershell
cd backend
.\run-backend.ps1
```

Le script lance la gateway et les 6 services dans des fenêtres PowerShell séparées
(nécessite un JDK 17+ via `JAVA_HOME` ou `java` dans le `PATH`).

**Envoi des convocations (Gmail)** : `convocation-service` envoie les convocations par
SMTP Gmail. Pour activer l'envoi, définir ces variables **avant** de lancer `run-backend.ps1`
(les fenêtres filles en héritent) ; sinon tous les services démarrent mais l'envoi renvoie un
`503` explicite :

```powershell
$env:MAIL_USERNAME = "mon.adresse@gmail.com"
$env:MAIL_PASSWORD = "xxxxxxxxxxxxxxxx"   # mot de passe d'application Gmail (16 caractères, pas le mot de passe du compte)
.\run-backend.ps1
```

Un mot de passe d'application Gmail nécessite la **validation en 2 étapes** activée
(Compte Google → Sécurité → Mots de passe des applications).

**Configuration locale** : chaque module lit `application.properties`. Pour surcharger en local,
copier `application-local.properties.example` → `application-local.properties` dans le
module concerné (fichier gitignoré).

**Configuration par variables d'environnement** : les valeurs sensibles utilisent la syntaxe
`${VARIABLE:valeur-par-défaut}`. En développement, les valeurs par défaut suffisent (aucune
variable à définir). En production, définir ces variables d'environnement pour **surcharger**
les défauts sans modifier le code :

| Variable | Propriété | Défaut (dev) | Portée |
|----------|-----------|--------------|--------|
| `JWT_SECRET` | `auth.jwt.secret` | `pfe-dev-jwt-secret-key-change-me-min-32b!!` | **identique** dans les 6 services ressource |
| `DB_URL` | `spring.datasource.url` | `jdbc:postgresql://localhost:5432/<base du service>` | par service |
| `DB_USERNAME` | `spring.datasource.username` | `postgres` | par service |
| `DB_PASSWORD` | `spring.datasource.password` | `postgres` | par service |
| `AUTH_SERVICE_URI`, `CANDIDAT_SERVICE_URI`, `CONCOURS_SERVICE_URI`, `LIEUX_SERVICE_URI`, `REPARTITION_SERVICE_URI`, `CONVOCATION_SERVICE_URI` | routes de l'API Gateway | ports `8081`–`8086` | api-gateway |
| `MAIL_USERNAME` | `spring.mail.username` | _(vide)_ | convocation-service |
| `MAIL_PASSWORD` | `spring.mail.password` | _(vide)_ | convocation-service |
| `MAIL_FROM` | `convocation.mail.from` | = `MAIL_USERNAME` | convocation-service |

Le **secret JWT** (`auth.jwt.secret` / `JWT_SECRET`) doit être **identique dans les 6 services
ressource** (auth, candidat, concours, lieux, repartition, convocation) pour que la validation
inter-services fonctionne. Le secret HS256 doit faire **au moins 32 octets UTF-8**.

> Les valeurs par défaut (`postgres` / `postgres`, secret de dev, comptes seedés) ne sont **que
> pour le développement local** : en production, fournir un secret JWT fort et des identifiants
> de base de données réels via les variables d'environnement (ou un gestionnaire de secrets).

### 3. Frontend

```powershell
cd frontend
Copy-Item .env.example .env.development.local
npm install
npm run dev
```

Le proxy Vite redirige `/auth`, `/api/candidats`, `/api/concours`, `/api/centres`,
`/api/etablissements`, `/api/salles`, `/api/repartition` et `/api/convocations` vers la gateway
(`VITE_GATEWAY_ORIGIN`, par défaut `http://localhost:8080`).

L'application est disponible sur http://localhost:5173.

### 4. Données de démonstration (optionnel)

Une fois auth, concours et lieux démarrés :

```powershell
.\scripts\seed-demo-data.ps1
```

Ce script crée des centres (Rabat, Casablanca, Fès), des concours, des établissements
et des salles via l'API (compte `gestionnaire`). Il appelle les services directement
sur leurs ports (8081, 8083, 8084), pas via la gateway.

### Ordre logique pour saisir des données

1. Centres (lieux)
2. Concours avec centres affectés (`id_centre`)
3. Établissements et salles (lieux), chaque salle liée à un `numero_concours`
4. Candidats (import Excel ou CRUD)
5. Répartition automatique (`POST /api/repartition/run`, rôle gestionnaire)
6. Convocations : aperçu et envoi par e-mail (`POST /api/convocations/envoyer`, rôle gestionnaire)

Pour réinitialiser les affectations sans relancer la répartition :
`POST /api/repartition/reset` (gestionnaire).

## Comptes par défaut

Créés par la migration Flyway de l'auth-service (**à changer en production**) :

| Utilisateur | Mot de passe | Rôle |
|-------------|--------------|------|
| `admin` | `Admin123!` | ADMINISTRATEUR |
| `gestionnaire` | `Gest123!` | GESTIONNAIRE |

- **ADMINISTRATEUR** : lecture seule sur les ressources métier, mais **seul** rôle
  habilité à gérer les comptes gestionnaires (`/auth/gestionnaires`, page `/gestionnaires`).
- **GESTIONNAIRE** : lecture + écriture + déclenchement de la répartition et de l'envoi des convocations.

## Pages du frontend

| Route | Page | Accès |
|-------|------|-------|
| `/` | Redirection vers `/candidats` ou `/login` | Public / authentifié |
| `/login` | Connexion | Public |
| `/candidats` | Gestion des candidats | Authentifié |
| `/concours` | Gestion des concours | Authentifié |
| `/lieux` | Centres / établissements / salles | Authentifié |
| `/repartition` | Répartition automatique + historique | Authentifié (run/reset : GESTIONNAIRE) |
| `/convocations` | Convocations PDF + envoi e-mail | Authentifié (envoi : GESTIONNAIRE) |
| `/gestionnaires` | Gestion des comptes gestionnaires | Authentifié (ADMINISTRATEUR) |

L'interface masque les actions d'écriture pour le rôle **ADMINISTRATEUR** (badge « lecture seule »
dans l'en-tête). La page `/gestionnaires` n'apparaît que pour les administrateurs.

## Identifiants partagés entre services

Les microservices ne partagent pas de base de données. Les références croisées utilisent
des **clés métier** validées par HTTP à l'écriture :

| Concept | Clé | Service propriétaire |
|---------|-----|----------------------|
| Candidat | `numero_inscription` | candidat-service |
| Concours | `numero_concours` | concours-service |
| Centre / établissement / salle | `id_centre`, `id_etablissement`, `id_salle` | lieux-service |

## Diagrammes UML

Sources PlantUML à la racine du dépôt :

| Fichier | Contenu |
|---------|---------|
| `diagramme-cas-utilisation-general.puml` | Cas d'utilisation globaux |
| `diagramme-classe-general.puml` | Modèle de classes général |
| `diagramme-classe-gestionnaire-candidats.puml` | Classes — gestion candidats |
| `diagramme-sequence-authentification.puml` | Séquence — authentification |
| `diagramme-sequence-gestion-candidatures.puml` | Séquence — candidatures |
| `diagramme-sequence-gestion-concours.puml` | Séquence — concours |
| `diagramme-sequence-gestion-centres.puml` | Séquence — centres |
| `diagramme-sequence-gestion-etablissements.puml` | Séquence — établissements |
| `diagramme-sequence-gestion-salles.puml` | Séquence — salles |
| `diagramme-sequence-centres-etablissements-salles.puml` | Séquence — lieux (vue combinée) |
| `diagramme-sequence-repartition-automatique.puml` | Séquence — répartition |
| `diagramme-sequence-gestion-convocations.puml` | Séquence — convocations |

Générer un PNG (nécessite Node.js et accès réseau vers le serveur PlantUML public) :

```powershell
node scripts/plantuml-png.mjs diagramme-cas-utilisation-general.puml diagramme-cas-utilisation-general.png
```

## Tests et build

```powershell
# Backend (depuis backend/)
.\mvnw.cmd test

# Frontend (depuis frontend/)
npm run build
```

Couverture de tests backend (unitaires / slice) :

- **candidat-service** — résolution concours (`CandidatConcoursResolverTest`)
- **concours-service** — validation lieux, client HTTP, contrôleur WebMvc
- **lieux-service** — client existence concours
- **repartition-service** — algorithme (`RepartitionPlannerTest`), géo (`ReferentielRegionsMarocTest`, `DistanceSidiIfniTest`)

## Stack technique

- **Backend** : Spring Boot 3.4.4, Spring Cloud Gateway (Spring Cloud 2024.0.1),
  Spring Security, Spring Data JPA, Flyway, Apache POI (import Excel), OpenPDF (génération
  des convocations PDF), Spring Mail / SMTP Gmail (envoi des convocations), jjwt 0.12.6,
  Java 17, Maven (multi-module).
- **Frontend** : React 19, TypeScript, Vite 6, axios, react-router-dom 6.
- **Base de données** : PostgreSQL (schémas versionnés par Flyway).

## Licence

Projet de fin d'études (PFE).
