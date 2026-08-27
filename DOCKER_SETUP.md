# Docker Setup — Fox Passport API

Local Postgres, Redis and pgAdmin, with the API itself optional.

> Rewritten 27 August 2026. The previous version described a stack that did not
> exist: it was built around an `api` service the compose file never defined, and
> named containers (`fox_postgres`), ports (5432, 6379), a database
> (`fox_passport_db`), a user (`postgres`) and a Redis password that were all
> different from the real ones. Every command below has been run against this
> compose file.

## Prerequisites

- Docker Desktop, or Docker Engine with the Compose plugin
- Free host ports: **5433** (Postgres), **6378** (Redis), **5050** (pgAdmin),
  and **6002** only if you run the API in a container too

The commands use `docker compose` (the v2 plugin). If you are on the old
standalone binary, `docker-compose` works the same way.

---

## Two ways to run it

### Services only — the common case

```bash
docker compose up -d
```

Starts **Postgres**, **Redis** and **pgAdmin**. You then run the API on your
machine with `pnpm dev`, which is what the default `.env` is already pointed at.

This is the default precisely so the container does not fight `pnpm dev` for
port 6002.

### Full stack, API included

```bash
docker compose --profile app up -d
```

Adds the **api** service, built from the `Dockerfile` in this directory. It
waits for Postgres and Redis to report healthy, runs `prisma migrate deploy`,
then starts the server — see the `CMD` at the end of the Dockerfile.

Do not run this and `pnpm dev` at the same time; they both want 6002.

### Check what is running

```bash
docker compose ps
```

```
NAME             IMAGE                     STATUS
local_postgres   postgres:15               Up (healthy)
local_redis      redis:7                   Up (healthy)
local_pgadmin    dpage/pgadmin4:latest     Up
```

`(healthy)` comes from real healthchecks — `pg_isready` for Postgres and
`redis-cli ping` for Redis, every 10s. The `api` service waits on both before
starting, so it cannot come up against a database that is not accepting
connections yet.

---

## Connection details

These are the **defaults**. Every one is overridable from the environment — see
"Overriding the defaults" below.

### Postgres

```
Host:     localhost
Port:     5433          <- not 5432; 5432 is usually a local install
User:     admin
Password: admin123
Database: foxpassportrepublic

DATABASE_URL=postgresql://admin:admin123@localhost:5433/foxpassportrepublic
```

Inside the compose network the host is `postgres` and the port is `5432`. The
`api` service overrides `DATABASE_URL` accordingly — from a container,
`localhost` is that container, not your machine.

### Redis

```
Host:     localhost
Port:     6378          <- not 6379
Password: (none)
```

Inside the network: `redis:6379`.

### pgAdmin

```
http://localhost:5050
Login: admin@example.com / admin123
```

Server mode is off, so it will not ask you to set a master password. When adding
the server inside pgAdmin, the host is **`postgres`** and the port **`5432`** —
pgAdmin runs in the same network, so it does not go via the published port.

---

## Everyday commands

### Logs

```bash
docker compose logs -f              # everything
docker compose logs -f postgres     # one service
docker compose logs -f api --tail 50
```

### Migrations

With the API running locally (the usual case), run them from your shell — the
`.env` `DATABASE_URL` already points at the container:

```bash
pnpm exec prisma migrate dev        # create and apply
pnpm exec prisma migrate deploy     # apply only; never prompts to reset
pnpm exec prisma migrate status     # what is applied, what is pending
```

With the `app` profile, the api container runs `migrate deploy` on every start.
To run one by hand:

```bash
docker compose --profile app exec api pnpm exec prisma migrate deploy
```

### Seeding

```bash
pnpm exec prisma db seed
```

The seed **refuses** to run unless `NODE_ENV` is development or test *and*
`DATABASE_URL` points at a local host. It creates real accounts, including
`admin@example.com` with a password committed to this repository, so pointing it
at a shared database would publish an admin login. `ALLOW_SEED=1` overrides it
deliberately.

### A psql shell

```bash
docker compose exec postgres psql -U admin -d foxpassportrepublic
```

```sql
\dt                      -- list tables
select count(*) from "User";   -- note the quotes: identifiers are case-sensitive
\q
```

### A Redis shell

```bash
docker compose exec redis redis-cli
```

```
PING
KEYS *
EXIT
```

No `AUTH` step — this stack does not set `requirepass`. Fine locally; do not
copy it to anything reachable from outside your machine.

---

## Stopping

```bash
docker compose stop         # stop, keep containers and data
docker compose down         # remove containers, keep the volumes
docker compose down -v      # remove the volumes too — DELETES THE DATABASE
```

`down -v` drops `pgdata` and `redisdata`. Everything seeded or created locally
goes with them.

---

## Overriding the defaults

The compose file reads these from your environment, falling back to the values
above:

| Variable | Default |
|---|---|
| `POSTGRES_USER` | `admin` |
| `POSTGRES_PASSWORD` | `admin123` |
| `POSTGRES_DB` | `foxpassportrepublic` |
| `POSTGRES_PORT` | `5433` |
| `REDIS_PORT` | `6378` |
| `PGADMIN_EMAIL` | `admin@example.com` |
| `PGADMIN_PASSWORD` | `admin123` |
| `PGADMIN_PORT` | `5050` |
| `PORT` | `6002` |

**One trap worth stating plainly:** changing `POSTGRES_USER`, `POSTGRES_PASSWORD`
or `POSTGRES_DB` does **not** re-initialise a volume that already exists.
Postgres only reads those on first init, so afterwards the new values simply
stop matching and every connection fails with an authentication error. Change
them together with `docker compose down -v`, accepting that you lose the data.

---

## Troubleshooting

### Port already in use

Something else holds 5433, 6378, 5050 or 6002. Either stop it or override the
port (see above) — but if you change `POSTGRES_PORT` you must change
`DATABASE_URL` in `.env` to match.

### Authentication failed for user "admin"

Usually the trap above: the volume was created with different credentials.
Compare `docker compose config` with what initialised the volume, or reset with
`docker compose down -v`.

### The API cannot reach the database from inside a container

`DATABASE_URL` is pointing at `localhost`, which inside a container means that
container. Use the service names — `postgres:5432` and `redis:6379`. The `api`
service already overrides both; anything else you add needs the same treatment.

### Prisma client not found

```bash
pnpm exec prisma generate
```

The Docker build already does this; a local checkout needs it after a fresh
install or a schema change.

### Tests fail with ECONNREFUSED on 6378

Redis is not running. `docker compose up -d redis`. Two suites
(`waitlist.spec.ts`, `event-template.submit.spec.ts`) need it and will fail at
file level without it — not a code failure.

### Containers will not start

```bash
docker compose logs
```

Common causes: port already in use, out of disk (`docker system prune`), or
Docker Desktop not running.

---

## Verification checklist

After `docker compose up -d`:

- [ ] `docker compose ps` shows postgres and redis as `Up (healthy)`
- [ ] `docker compose exec postgres pg_isready -U admin` prints `accepting connections`
- [ ] `docker compose exec redis redis-cli ping` prints `PONG`
- [ ] `pnpm exec prisma migrate status` prints `Database schema is up to date!`
- [ ] `pnpm dev` then `curl http://localhost:6002/api/health` returns 200
- [ ] `pnpm test` is green (68 tests at the time of writing)
