# 🐳 Docker Setup Guide for Fox Passport API

This guide covers setting up and running the backend API in Docker with PostgreSQL and Redis.

## 📋 Prerequisites

- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)
- Port 6002, 5432, 6379 available on your machine

## 🚀 Quick Start

### 1. Build the Docker Image

```bash
cd fox-passport-republic-api
docker-compose build
```

This builds the API image. Takes ~2-3 minutes on first run.

### 2. Start All Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- API on `localhost:6002`

Check status:
```bash
docker-compose ps
```

Expected output:
```
NAME                COMMAND                  SERVICE    STATUS
fox_postgres        "docker-entrypoint.s…"   postgres   Up (healthy)
fox_redis           "redis-server --appe…"   redis      Up (healthy)
fox_api             "sh -c 'pnpm prisma …"   api        Up
```

### 3. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f redis
```

### 4. Run Database Migrations

Migrations run automatically on startup. To manually run:

```bash
docker-compose exec api pnpm prisma migrate dev
```

### 5. Seed Database (Optional)

```bash
docker-compose exec api pnpm prisma db seed
```

---

## 🛑 Stop Services

```bash
# Stop all services (keeps data)
docker-compose stop

# Stop and remove containers (keeps volumes/data)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

---

## 🔧 Common Tasks

### Access PostgreSQL Database

```bash
docker-compose exec postgres psql -U postgres -d fox_passport_db
```

Then run SQL queries:
```sql
\dt                    -- list tables
SELECT * FROM users;  -- view users
\q                    -- exit
```

### Access Redis CLI

```bash
docker-compose exec redis redis-cli
```

Commands:
```
> AUTH redis_password
> KEYS *              -- list all keys
> GET key_name        -- get value
> EXIT                -- exit
```

### View API Logs in Real-Time

```bash
docker-compose logs -f api --tail 50
```

### Execute Commands Inside API Container

```bash
# Run TypeScript migrations
docker-compose exec api pnpm db:setup

# Run linter
docker-compose exec api pnpm lint

# Run tests
docker-compose exec api pnpm test

# Open bash shell in container
docker-compose exec api sh
```

### Rebuild After Code Changes

```bash
# Rebuild and restart API
docker-compose up -d --build api

# Or full rebuild
docker-compose down
docker-compose build
docker-compose up -d
```

---

## 🌍 Environment Variables

Database connection string is set in `docker-compose.yml`:
```yaml
DATABASE_URL: postgresql://postgres:postgres_password@postgres:5432/fox_passport_db
```

To use different values, create `.env.local` and override:
```bash
# .env.local
POSTGRES_PASSWORD=my_custom_password
REDIS_PASSWORD=my_redis_password
```

---

## 📊 Connection Strings

### PostgreSQL
```
Host:     localhost
Port:     5432
User:     postgres
Password: postgres_password
Database: fox_passport_db
URL:      postgresql://postgres:postgres_password@localhost:5432/fox_passport_db
```

### Redis
```
Host:     localhost
Port:     6379
Password: redis_password
URL:      redis://:redis_password@localhost:6379
```

### API
```
Frontend: http://localhost:6001
API:      http://localhost:6002
```

---

## 🐛 Troubleshooting

### Ports Already in Use

```bash
# Kill processes on ports
pnpm dlx kill-port 5432  # PostgreSQL
pnpm dlx kill-port 6379  # Redis
pnpm dlx kill-port 6002  # API
```

### Database Migration Fails

```bash
# Reset database and migrations
docker-compose exec api pnpm prisma migrate reset --force

# Then restart
docker-compose restart api
```

### Prisma Client Not Found

```bash
# Regenerate Prisma
docker-compose exec api pnpm prisma generate
```

### Container Won't Start

Check logs:
```bash
docker-compose logs api
```

Common issues:
- Port already in use → Stop other services
- Database not ready → Wait 10 seconds, then try again
- Out of disk space → Run `docker system prune`

### Changes Not Reflecting

```bash
# Rebuild everything fresh
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## 🔐 Production Deployment

### Before Going Live

1. **Change Secret Keys** (in docker-compose.yml or .env):
   ```yaml
   SECRET_KEY: yoursupersecretsecure_key_here
   ACCESS_TOKEN_SECRET: accesstoken_secret_here
   REFRESH_TOKEN_SECRET: refreshtoken_secret_here
   ```

2. **Use Production Database** (not local):
   ```yaml
   DATABASE_URL: postgresql://user:pass@prod-db-host:5432/dbname
   ```

3. **Enable Redis Persistence**:
   ```yaml
   command: ["redis-server", "--appendonly", "yes", "--requirepass", "strong_password"]
   ```

4. **Use Environment File**:
   ```bash
   docker-compose --env-file .env.production up -d
   ```

5. **Set up Backups**:
   ```bash
   # Backup database
   docker-compose exec postgres pg_dump -U postgres fox_passport_db > backup.sql

   # Restore database
   docker-compose exec -T postgres psql -U postgres foo < backup.sql
   ```

---

## 📦 Docker Image Optimization

### Use Optimized Dockerfile

For production, use the multi-stage optimized build:

```bash
docker build -f Dockerfile.optimized -t fox-api:optimized .
```

Benefits:
- Smaller image size (~800MB → ~300MB)
- Non-root user for security
- Proper signal handling with dumb-init
- Separate build and runtime stages

### Check Image Size

```bash
docker images | grep fox
```

---

## 🔄 Auto-Restart & Health Checks

Services automatically restart if they crash:
```yaml
restart: unless-stopped
healthcheck: # Check every 10s if healthy
```

To manually restart:
```bash
docker-compose restart api
docker-compose restart postgres
docker-compose restart redis
```

---

## ✅ Verification Checklist

After running `docker-compose up -d`:

- [ ] All 3 containers are running: `docker-compose ps`
- [ ] API responds: `curl http://localhost:6002/api/v1`
- [ ] Database connection works: `docker-compose exec postgres psql -U postgres -d fox_passport_db -c "SELECT 1"`
- [ ] Redis works: `docker-compose exec redis redis-cli ping`
- [ ] Migrations ran: Check API logs for success message

---

## 🎯 Next Steps

1. **Test API**: Visit `http://localhost:6002/api/v1` in browser
2. **Check Logs**: `docker-compose logs -f api`
3. **Monitor**: `docker stats` (shows CPU/memory usage)
4. **Scale**: Modify `docker-compose.yml` to add more replicas
5. **Connect Frontend**: Update frontend `.env` to point to `http://localhost:6002/api/v1`

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [Redis Docker Hub](https://hub.docker.com/_/redis)

---

## 💡 Tips

- Use `docker-compose exec` to run commands inside containers
- Use `docker-compose logs` to debug issues
- Use `docker system prune` to clean up unused images/volumes
- Keep `.env` files in `.gitignore` for security
- Use environment variables for sensitive data
- Test locally before deploying to production
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
