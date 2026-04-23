# 🐳 Docker Setup Guide for Fox Passport API

This guide covers setting up and running the backend API in Docker with PostgreSQL and Redis.

## 📋 Prerequisites

- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)
- Port 3002, 5432, 6379 available on your machine

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
- API on `localhost:3002`

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
Frontend: http://localhost:3001
API:      http://localhost:3002
```

---

## 🐛 Troubleshooting

### Ports Already in Use

```bash
# Kill processes on ports
npx kill-port 5432  # PostgreSQL
npx kill-port 6379  # Redis
npx kill-port 3002  # API
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
- [ ] API responds: `curl http://localhost:3002/api/v1`
- [ ] Database connection works: `docker-compose exec postgres psql -U postgres -d fox_passport_db -c "SELECT 1"`
- [ ] Redis works: `docker-compose exec redis redis-cli ping`
- [ ] Migrations ran: Check API logs for success message

---

## 🎯 Next Steps

1. **Test API**: Visit `http://localhost:3002/api/v1` in browser
2. **Check Logs**: `docker-compose logs -f api`
3. **Monitor**: `docker stats` (shows CPU/memory usage)
4. **Scale**: Modify `docker-compose.yml` to add more replicas
5. **Connect Frontend**: Update frontend `.env` to point to `http://localhost:3002/api/v1`

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
