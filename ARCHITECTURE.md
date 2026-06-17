# Project Architecture

> Reference document describing the full architecture of the PFE platform
> (exam/competition management). Intended as onboarding context for developers
> and AI agents working on this codebase.

## Overview

This is a **full-stack microservices application** for managing exams/competitions
("concours"), candidates, exam locations, and automatic seat allocation. It is built as:

- **Frontend**: React 19 + TypeScript (Vite), single-page app on port `5173`.
- **Backend**: 5 independent Spring Boot 3.4.4 services (Java 17) behind a
  **Spring Cloud Gateway** edge service, all as Maven modules under one parent POM
  (`backend/pom.xml`).
- **Database**: PostgreSQL, with **one separate database per service**
  (database-per-service pattern).
- **Auth**: Stateless JWT (HS256), with a shared secret across all resource services.

There is an **API gateway** (Spring Cloud Gateway, port `8080`) that is the single
entry point for the browser: it routes by path prefix to the right service and
handles CORS. There is **no service discovery** (no Eureka / Feign) — inter-service
calls use hardcoded base URLs via Spring's `RestClient`, bypassing the gateway.
In dev, the Vite proxy forwards the browser's relative paths to the gateway.

## The API gateway + 5 microservices

| Service               | Port  | Database           | Responsibility                                      |
| --------------------- | ----- | ------------------ | --------------------------------------------------- |
| `api-gateway`         | 8080  | —                  | Single entry point: path-based routing, CORS        |
| `auth-service`        | 8081  | `PFE_Data`         | Login, JWT issuance, user accounts                  |
| `candidat-service`    | 8082  | `data_candidats`   | Candidates CRUD + Excel import + batch affectation  |
| `concours-service`    | 8083  | `data_concours`    | Competitions + centre assignments                   |
| `lieux-service`       | 8084  | `data_lieux`       | Locations: centres, établissements, salles          |
| `repartition-service` | 8085  | `data_repartition` | Automatic seat allocation (orchestration + history) |

The gateway (`backend/api-gateway`, package `com.pfe.gateway`) is a reactive
Spring Cloud Gateway app. It owns **no database** and **no JWT validation** — it is
a stateless reverse proxy. Routes are declared in `application.yml`:

| Path prefix                                              | Routed to          |
| ------------------------------------------------------- | ------------------ |
| `/auth/**`                                               | auth-service:8081  |
| `/api/candidats/**`                                      | candidat-service:8082 |
| `/api/concours/**`                                       | concours-service:8083 |
| `/api/centres/**`, `/api/etablissements/**`, `/api/salles/**` | lieux-service:8084 |
| `/api/repartition/**`                                   | repartition-service:8085 |

Downstream service URIs are overridable via environment variables (`AUTH_SERVICE_URI`,
`CANDIDAT_SERVICE_URI`, `CONCOURS_SERVICE_URI`, `LIEUX_SERVICE_URI`,
`REPARTITION_SERVICE_URI`). The `Authorization: Bearer <jwt>` header is forwarded
unchanged, so each downstream service validates the JWT itself.

The gateway also applies a `DedupeResponseHeader` filter on CORS headers, because
downstream services also emit CORS headers and duplicate values would break browsers.

## Shared identifiers (logical references)

Because each service owns its own database, cross-service relationships use
**logical references** validated over HTTP — not foreign keys across databases.

| Concept     | Canonical key           | Owner service   | Referenced by                                      |
| ----------- | ----------------------- | --------------- | -------------------------------------------------- |
| Candidat    | `numero_inscription`    | candidat        | repartition (history)                              |
| Concours    | `numero_concours`       | concours        | candidat, lieux (`salle.numero_concours`), repartition |
| Centre      | `id_centre`             | lieux           | concours (`concours_affectation_centre`), candidat (affectation) |
| Établissement | `id_etablissement`    | lieux           | candidat (affectation), repartition (history)      |
| Salle       | `id_salle`              | lieux           | candidat (affectation), repartition (history)      |

Denormalized copies are kept where needed to avoid cross-service joins at read time:

- `candidat.nom_concours` — official name copied from concours-service on every write.
- `concours_affectation_centre.nom_centre` — display label copied from lieux-service when a centre is assigned.

## How the database runs

PostgreSQL with **database isolation per service** — each service owns its own DB
and never touches another service's tables:

| Database            | Service             | Main tables                                                                 |
| ------------------- | ------------------- | --------------------------------------------------------------------------- |
| `PFE_Data`          | auth-service        | `utilisateur` (bcrypt password hashes, `role_utilisateur` enum)             |
| `data_candidats`    | candidat-service    | `candidat` (PK: `numero_inscription`)                                     |
| `data_concours`     | concours-service    | `concours` (PK: `numero_concours`), `concours_affectation_centre`           |
| `data_lieux`        | lieux-service       | `centre` → `etablissement` → `salle` (PKs: `id_centre`, `id_etablissement`, `id_salle`) |
| `data_repartition`  | repartition-service | `repartition_run`, `repartition_affectation`, `repartition_alerte`          |

### Flyway migrations

Schema is managed by **Flyway**, not Hibernate. Every service sets
`spring.jpa.hibernate.ddl-auto=none` and runs versioned SQL from
`classpath:db/migration` at startup.

| Service             | Migrations |
| ------------------- | ---------- |
| auth-service        | `V1__init_auth_schema.sql` |
| candidat-service    | `V1__init_candidat.sql` |
| concours-service    | `V1__init_concours.sql`, `V2__concours_centre_lien.sql`, `V3__concours_affectation_id_centre.sql` |
| lieux-service       | `V1__init_lieux.sql` |
| repartition-service | `V1__init_repartition.sql`, `V2__repartition_run_message.sql` |

Key schema notes:

- `concours.numero_concours` is the primary key (natural key, not a surrogate UUID).
- `candidat.numero_inscription` is the primary key.
- `concours_affectation_centre.id_centre` is a required logical reference to `lieux.centre.id_centre`.
- `salle.numero_concours` is an optional logical reference to `concours.numero_concours`.
- `repartition_run.message` stores failure reasons when a run ends with status `ECHEC`.

Local default credentials: `postgres` / `postgres` on `localhost:5432`. These are **dev-only
defaults**: each service reads `spring.datasource.url`, `spring.datasource.username` and
`spring.datasource.password` via `${DB_URL:…}`, `${DB_USERNAME:postgres}` and
`${DB_PASSWORD:postgres}`, so the defaults are overridden in production by setting the
`DB_URL` / `DB_USERNAME` / `DB_PASSWORD` environment variables (no code change needed).

Default seeded accounts (change in production): `admin / Admin123!` and
`gestionnaire / Gest123!`.

## How the services communicate

### 1. Frontend → gateway → backend

The browser only ever calls relative paths. In dev, `vite.config.ts` proxies every
known prefix to a **single target, the API gateway** (`http://localhost:8080`,
overridable via `VITE_GATEWAY_ORIGIN`):

- `/auth`, `/api/candidats`, `/api/concours`, `/api/centres`,
  `/api/etablissements`, `/api/salles`, `/api/repartition` → api-gateway (8080)

The gateway dispatches each prefix to the owning service (see routing table above).
In production, point the SPA or reverse proxy at the gateway directly and drop the
Vite dev proxy. The axios client (`frontend/src/api/httpClient.ts`) attaches the
JWT as a `Bearer` token to every request via a request interceptor.

### 2. Authentication flow (JWT)

1. User posts to `POST /auth/login` on auth-service. It verifies the bcrypt password
   and issues a signed JWT (subject = username, custom `role` claim).
2. Frontend stores the token (localStorage) and sends it as `Bearer` on every request.
3. **Each resource service validates the JWT itself** using the same shared secret
   (`auth.jwt.secret`, identical in all five resource services). There is no
   call back to auth-service to validate tokens. The secret is externalized as
   `${JWT_SECRET:…}`: a dev default is baked in, but production overrides it by setting
   the `JWT_SECRET` environment variable (the same value must be set on all five resource
   services; HS256 requires at least 32 UTF-8 bytes).
4. `GET /auth/me` restores the session on page reload.

Each resource service has its own `JwtAuthenticationFilter` that parses the token,
reads the `role` claim, and sets a Spring Security authority `ROLE_<role>`.
Authorization is role-based per HTTP method:

| Role             | Read (`GET`) | Write (`POST`/`PUT`/`PATCH`/`DELETE`) | Repartition run |
| ---------------- | ------------ | --------------------------------------- | --------------- |
| `ADMINISTRATEUR` | yes          | no                                      | no              |
| `GESTIONNAIRE`   | yes          | yes                                     | yes             |

All services are stateless (`SessionCreationPolicy.STATELESS`). CORS allows
`http://localhost:5173` on both the gateway and each service (gateway dedupes headers).

### 3. Service → service communication (synchronous REST)

Inter-service calls are **synchronous HTTP using Spring `RestClient`**, configured
with hardcoded base URLs from `application.properties`. There is no message broker
or async events. **The original user's JWT is forwarded** on these internal calls
so the downstream service can authorize them.

East-west traffic goes **directly service-to-service** (not through the gateway):

| Caller              | Property                         | Target port |
| ------------------- | -------------------------------- | ----------- |
| candidat-service    | `concours.service.base-url`      | 8083        |
| candidat-service    | `lieux.service.base-url`         | 8084        |
| concours-service    | `lieux.service.base-url`         | 8084        |
| lieux-service       | `concours.service.base-url`      | 8083        |
| repartition-service | `concours/lieux/candidat.service.base-url` | 8083/8084/8082 |

#### Internal call graph

**candidat-service → concours-service** (`ConcoursRemoteClient`, `CandidatConcoursResolver`)

- On import or update, resolves the candidate's competition.
- `numero_concours` is canonical when provided: `GET /api/concours/{numeroConcours}`.
- Otherwise resolves by name from the catalogue: `GET /api/concours`.
- Copies back the official `nom_concours` from concours-service.

**candidat-service → lieux-service** (`LieuxSalleRemoteClient`, `CandidatRemoteRefsValidator`)

- When a salle is assigned manually: `GET /api/salles/{idSalle}`.
- Validates centre/établissement consistency, concours match, and seat capacity.

**concours-service → lieux-service** (`LieuxCentreClient`)

- When assigning centres to a competition: `GET /api/centres/{id}` to confirm the centre exists.

**lieux-service → concours-service** (`ConcoursExistenceClient`)

- When a salle is linked to a competition: `GET /api/concours/{numeroConcours}` to validate it exists.
- When listing centres: `GET /api/concours/by-centre/{idCentre}` to enrich with planned competitions.
- This endpoint reads **only the concours database** (no call back to lieux) — see deadlock note below.

**repartition-service → concours / lieux / candidat** (orchestrator)

On `POST /api/repartition/run` (gestionnaire only):

1. `GET /api/concours` — all competitions.
2. Per competition: `GET /api/salles?numeroConcours=` — eligible rooms with capacities and centre info.
3. `GET /api/candidats` — all candidates.
4. Computes the plan in memory (`RepartitionPlanner`).
5. `PATCH /api/candidats/affectations` — writes centre/établissement/salle/place on each candidate.
6. Persists run summary + per-candidate affectations + alerts in `data_repartition`.

Query history later via `GET /api/repartition/runs` and `GET /api/repartition/runs/{id}`.

#### Repartition algorithm

The allocation is **region-aware** (not just nearest-by-distance). It combines two bundled
gazetteers, both loaded at startup:

- `classpath:geo/villes-maroc.json` — Moroccan cities with GPS coordinates (`CarteMaroc`),
  used for great-circle (Haversine, km) distances.
- `classpath:geo/regions-maroc.json` — the 12 Moroccan administrative regions and the
  cities/provinces they contain (`ReferentielRegionsMaroc`), used to prefer same-region centres.

For each candidate (sorted by `numero_inscription`), within their competition's centres:

1. **Resolve the candidate's location.** A city resolves to GPS coordinates (`CarteMaroc.coord`)
   and/or to an administrative region (`ReferentielRegionsMaroc.regionDe`, which tolerates
   multi-word names). A centre's city/region is derived from `nomCentre` (tolerating a
   `Centre ` prefix, e.g. `Centre Rabat` → `Rabat`).
2. **Rank all eligible centres by a proximity score** (`centresParProximite`):
   - If **at least one** centre of that competition is in the candidate's region
     (`auMoinsUnCentreDansRegion`), the score is **regional**: same region ⇒ GPS distance
     (0 if same city); different region ⇒ a large out-of-region penalty + inter-region
     centroid distance + GPS distance. This keeps candidates within their region whenever
     a centre exists there.
   - Otherwise the score is **pure GPS distance** (falling back to inter-region centroid
     distance when a city has no coordinates).
3. **Seat the candidate** in the first room with remaining capacity, scanning centres in
   ranked order (nearest first) and, within a centre, rooms sorted by name then `id_salle`.
   The candidate lands in the closest centre that still has a free seat — not only the single
   nearest one.

Centres and rooms are derived from lieux-service salles filtered by `numero_concours`,
not from concours-service centre assignments directly.

Alert types when a candidate cannot be seated:

| Type                      | Cause                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `CONCOURS_INCONNU`        | Candidate has no valid / planned `numero_concours`                   |
| `AUCUN_CENTRE_DISPONIBLE` | No usable room/centre for the competition                            |
| `VILLE_NON_GEOLOCALISEE`  | Candidate's city is **neither** geolocated **nor** mapped to a region |
| `CAPACITE_DEPASSEE`       | **All** centres of the competition are full (reports the nearest one) |

Each run is a **full re-distribution**: capacity is recomputed from scratch, and
candidates not seated in the current run have their affectation cleared (`null`).

#### Deadlock avoidance (concours ↔ lieux)

There is a bidirectional dependency between concours and lieux (each validates
references in the other). Circular HTTP deadlocks are avoided by design:

- `GET /api/concours/by-centre/{idCentre}` (concours-service) reads **only its own DB**.
- `GET /api/centres` (lieux-service) calls concours for enrichment, but that concours
  endpoint does not call lieux back.

#### Error translation (remote clients)

Downstream failures are translated consistently:

| Downstream status | Caller behavior        |
| ----------------- | ---------------------- |
| 404               | `400 Bad Request`      |
| 401 / 403         | `502 Bad Gateway`      |
| 5xx               | `502 Bad Gateway`      |
| Connection refused | `503 Service Unavailable` |

## REST API surface (by service)

### auth-service (`/auth`)

| Method | Path        | Auth     | Description              |
| ------ | ----------- | -------- | ------------------------ |
| POST   | `/login`    | public   | Issue JWT                |
| GET    | `/me`       | JWT      | Current user info        |

### candidat-service (`/api/candidats`)

| Method | Path                          | Role (write)  | Description                    |
| ------ | ----------------------------- | ------------- | ------------------------------ |
| GET    | `/`                           | read roles    | List all candidates            |
| GET    | `/{numeroInscription}`        | read roles    | Get one candidate              |
| PUT    | `/{numeroInscription}`        | GESTIONNAIRE  | Update candidate               |
| PATCH  | `/affectations`               | GESTIONNAIRE  | Batch seat assignment (repartition) |
| DELETE | `/{numeroInscription}`        | GESTIONNAIRE  | Delete candidate               |
| POST   | `/import` (multipart)         | GESTIONNAIRE  | Excel import                   |

### concours-service (`/api/concours`)

| Method | Path                          | Role (write)  | Description                    |
| ------ | ----------------------------- | ------------- | ------------------------------ |
| GET    | `/`                           | read roles    | List all competitions          |
| GET    | `/by-centre/{idCentre}`       | read roles    | Competitions at a centre       |
| GET    | `/{numeroConcours}`           | read roles    | Get one competition            |
| POST   | `/`                           | GESTIONNAIRE  | Create competition             |
| PUT    | `/{numeroConcours}`           | GESTIONNAIRE  | Update competition             |
| DELETE | `/{numeroConcours}`           | GESTIONNAIRE  | Delete competition             |

### lieux-service

| Method | Path                                    | Role (write)  | Description              |
| ------ | --------------------------------------- | ------------- | ------------------------ |
| GET    | `/api/centres`                          | read roles    | List centres             |
| GET    | `/api/centres/{id}`                     | read roles    | Centre detail            |
| POST   | `/api/centres`                          | GESTIONNAIRE  | Create centre            |
| PUT    | `/api/centres/{id}`                     | GESTIONNAIRE  | Update centre            |
| DELETE | `/api/centres/{id}`                     | GESTIONNAIRE  | Delete centre            |
| POST   | `/api/centres/{centreId}/etablissements`| GESTIONNAIRE  | Create établissement     |
| GET    | `/api/etablissements/{id}`              | read roles    | Établissement detail     |
| PUT    | `/api/etablissements/{id}`              | GESTIONNAIRE  | Update établissement     |
| DELETE | `/api/etablissements/{id}`              | GESTIONNAIRE  | Delete établissement     |
| POST   | `/api/etablissements/{id}/salles`       | GESTIONNAIRE  | Create salle             |
| GET    | `/api/salles?numeroConcours=`           | read roles    | List salles for a concours |
| GET    | `/api/salles/{idSalle}`                 | read roles    | Salle with centre/étab.  |
| PUT    | `/api/salles/{idSalle}`                 | GESTIONNAIRE  | Update salle             |
| DELETE | `/api/salles/{idSalle}`                 | GESTIONNAIRE  | Delete salle             |

### repartition-service (`/api/repartition`)

| Method | Path          | Role          | Description                         |
| ------ | ------------- | ------------- | ----------------------------------- |
| POST   | `/run`        | GESTIONNAIRE  | Trigger automatic allocation        |
| GET    | `/runs`       | read roles    | Run history (summary)               |
| GET    | `/runs/{id}`  | read roles    | Full run (affectations + alertes)   |

## Architecture diagram

```
                          ┌─────────────────────────────┐
                          │   Browser (React + Vite)     │
                          │      localhost:5173          │
                          └──────────────┬──────────────┘
                                         │ JWT in Authorization header
                          ┌──────────────▼──────────────┐
                          │   Vite dev proxy (→ :8080)    │
                          └──────────────┬──────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │   API Gateway (:8080)         │
                          │  Spring Cloud Gateway         │
                          │ (path-prefix routing + CORS)  │
                          └─┬───────┬────────┬────────┬───────┬─────┘
       /auth │ /api/candidats │ /api/concours │ /api/centres,salles,etab │ /api/repartition
             ▼              ▼              ▼               ▼                  ▼
   ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐
   │ auth-svc   │ │   candidat   │ │  concours  │ │   lieux    │ │   repartition    │
   │   :8081    │ │    :8082     │ │   :8083    │ │   :8084    │ │      :8085        │
   └─────┬──────┘ └──┬───────┬───┘ └─────┬──────┘ └─────┬──────┘ └────────┬─────────┘
         │           │       │          │  ▲           │  ▲              │
         │           │       │          └──┼───────────┘  │   repartition orchestrates
         │           │       └─────────────┼──────────────┘   concours + lieux + candidat
         │           │   synchronous REST (RestClient), JWT forwarded
         ▼           ▼             ▼              ▼                       ▼
   ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐
   │ PFE_Data │ │data_candidats│ │data_concours│ │ data_lieux │ │ data_repartition │
   └──────────┘ └──────────────┘ └────────────┘ └────────────┘ └──────────────────┘
                            PostgreSQL  (Flyway-managed schemas)
```

## Recommended data setup order

When seeding data manually (or via `scripts/seed-demo-data.ps1`):

1. **Centres** (lieux-service) — create geographic poles (`Centre Rabat`, etc.).
2. **Concours** (concours-service) — create competitions and assign centres by `id_centre`.
3. **Établissements + salles** (lieux-service) — create rooms linked to a `numero_concours`.
4. **Candidats** (candidat-service) — import via Excel or CRUD.
5. **Répartition** (repartition-service) — trigger `POST /api/repartition/run`.

## Tech stack

- **Backend**: Spring Boot 3.4.4, Spring Cloud Gateway (Spring Cloud 2024.0.1),
  Spring Security, Spring Data JPA, Flyway, Apache POI (Excel import in
  candidat-service), jjwt 0.12.6, Java 17, Maven (multi-module).
- **Frontend**: React 19, TypeScript, Vite 6, axios, react-router-dom 6.
- **Database**: PostgreSQL 14+ (candidat trigger uses `EXECUTE FUNCTION`).

## Key design choices & trade-offs

- **Decentralized data**: database-per-service; no shared DB, no cross-DB foreign
  keys. Consistency is enforced at the application layer via synchronous validation calls.
- **Natural keys**: `numero_concours` and `numero_inscription` are business identifiers,
  stable across services and human-readable in logs and Excel imports.
- **Stateless distributed auth**: a single shared HS256 secret lets every service
  validate JWTs independently — simple, but rotating the secret requires redeploying
  all services, and there is no central token revocation. The secret and the per-service
  DB credentials are externalized as environment variables (`JWT_SECRET`, `DB_URL`,
  `DB_USERNAME`, `DB_PASSWORD`) with dev-only defaults, so production never needs the real
  values committed in `application.properties`.
- **API gateway, no discovery**: the gateway centralizes north-south routing and CORS,
  but service URIs are static config. The gateway does not validate JWTs or enforce
  rate limits — those remain in each service.
- **Non-atomic repartition**: the allocation run reads from three services, writes to
  candidat-service, then persists its own history. A failure after step 5 can leave
  candidats updated without a complete run record (failures are traced as `ECHEC` runs
  when possible).

## Repository layout

| Folder           | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `backend/`       | API gateway + Spring Boot microservices                           |
| `frontend/`      | React + TypeScript (Vite) single-page app                         |
| `database/`      | Flyway migration documentation (scripts live in each service)     |
| `scripts/`       | Demo seed script, PlantUML PNG generator, sample JSON bodies      |
| `*.puml` / `*.png` | UML diagrams (use cases, classes, sequences)                  |
| `verify-env.ps1` | Dev environment checker (Java, Maven, Node, PostgreSQL)           |
