@echo off
REM Fox Passport API - Docker Setup Script (Windows)
REM Usage: docker-setup.bat [command]

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Colors (using PowerShell for colors)
set "GREEN=[92m"
set "BLUE=[94m"
set "YELLOW=[93m"
set "RED=[91m"
set "RESET=[0m"

REM Functions
:header
echo.
echo %BLUE%╔════════════════════════════════════════╗%RESET%
echo %BLUE%║ Fox Passport API - Docker Setup        ║%RESET%
echo %BLUE%╚════════════════════════════════════════╝%RESET%
echo.
exit /b

:success
echo %GREEN%✓ %*%RESET%
exit /b

:info
echo %BLUE%ℹ %*%RESET%
exit /b

:warning
echo %YELLOW%⚠ %*%RESET%
exit /b

:error
echo %RED%✗ %*%RESET%
exit /b

:check_docker
where docker >nul 2>nul
if errorlevel 1 (
    call :error "Docker is not installed. Please install Docker Desktop."
    exit /b 1
)
call :success "Docker is installed"
exit /b

:build
call :info "Building Docker image..."
docker-compose build
if errorlevel 1 (
    call :error "Build failed!"
    exit /b 1
)
call :success "Build complete!"
exit /b

:start
call :info "Starting services..."
docker-compose up -d
if errorlevel 1 (
    call :error "Failed to start services"
    exit /b 1
)

timeout /t 3 /nobreak
call :success "All services started!"

call :info "Service URLs:"
echo   API:        http://localhost:6002
echo   PostgreSQL: localhost:5432
echo   Redis:      localhost:6379
echo.

docker-compose ps
exit /b

:stop
call :info "Stopping services..."
docker-compose stop
if errorlevel 1 (
    call :error "Failed to stop services"
    exit /b 1
)
call :success "Services stopped!"
exit /b

:restart
call :info "Restarting services..."
docker-compose restart
if errorlevel 1 (
    call :error "Failed to restart services"
    exit /b 1
)
call :success "Services restarted!"
exit /b

:logs
if "%~1"=="" (
    set "SERVICE=api"
) else (
    set "SERVICE=%~1"
)
docker-compose logs -f %SERVICE% --tail 50
exit /b

:status
call :info "Service Status:"
docker-compose ps
echo.
call :info "Container Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
exit /b

:migrate
call :info "Running database migrations..."
docker-compose exec api pnpm prisma migrate deploy
if errorlevel 1 (
    call :error "Migrations failed!"
    exit /b 1
)
call :success "Migrations complete!"
exit /b

:seed
call :info "Seeding database..."
docker-compose exec api pnpm prisma db seed
if errorlevel 1 (
    call :error "Seeding failed!"
    exit /b 1
)
call :success "Database seeded!"
exit /b

:test
call :info "Running tests..."
docker-compose exec api pnpm test
exit /b

:shell
call :info "Opening shell in API container..."
docker-compose exec api sh
exit /b

:db_shell
call :info "Opening PostgreSQL shell..."
docker-compose exec postgres psql -U postgres -d fox_passport_db
exit /b

:redis_shell
call :info "Opening Redis CLI..."
docker-compose exec redis redis-cli
exit /b

:clean
call :warning "This will remove all containers and volumes (keeping code)"
set /p CONFIRM="Continue? (y/n): "
if /i "%CONFIRM%"=="y" (
    docker-compose down -v
    call :success "Cleaned up!"
) else (
    call :info "Cancelled"
)
exit /b

:rebuild
call :warning "This will rebuild everything from scratch"
set /p CONFIRM="Continue? (y/n): "
if /i "%CONFIRM%"=="y" (
    docker-compose down -v
    docker-compose build --no-cache
    docker-compose up -d
    call :success "Rebuild complete!"
) else (
    call :info "Cancelled"
)
exit /b

:help
call :header
echo Available Commands:
echo.
echo %GREEN%Setup%RESET%
echo   docker-setup.bat build          Build Docker image
echo   docker-setup.bat start          Start all services
echo.
echo %GREEN%Operations%RESET%
echo   docker-setup.bat stop           Stop all services
echo   docker-setup.bat restart        Restart services
echo   docker-setup.bat status         Show service status
echo.
echo %GREEN%Development%RESET%
echo   docker-setup.bat logs [service] View logs (default: api)
echo   docker-setup.bat shell          Open bash in API container
echo   docker-setup.bat db-shell       Open PostgreSQL shell
echo   docker-setup.bat redis-shell    Open Redis CLI
echo.
echo %GREEN%Database%RESET%
echo   docker-setup.bat migrate        Run database migrations
echo   docker-setup.bat seed           Seed database
echo.
echo %GREEN%Maintenance%RESET%
echo   docker-setup.bat test           Run tests
echo   docker-setup.bat clean          Remove containers and volumes
echo   docker-setup.bat rebuild        Rebuild everything from scratch
echo.
echo %GREEN%Help%RESET%
echo   docker-setup.bat help           Show this help message
echo.
echo Examples:
echo   docker-setup.bat build ^&^& docker-setup.bat start
echo   docker-setup.bat logs                             # Watch all logs
echo   docker-setup.bat logs postgres                    # Watch postgres logs
echo   docker-setup.bat shell                            # Connect to API
echo.
exit /b

:main
call :check_docker
if errorlevel 1 exit /b 1

if "%~1"=="" (
    call :help
) else if /i "%~1"=="build" (
    call :build
) else if /i "%~1"=="start" (
    call :start
) else if /i "%~1"=="stop" (
    call :stop
) else if /i "%~1"=="restart" (
    call :restart
) else if /i "%~1"=="logs" (
    call :logs "%~2"
) else if /i "%~1"=="status" (
    call :status
) else if /i "%~1"=="migrate" (
    call :migrate
) else if /i "%~1"=="seed" (
    call :seed
) else if /i "%~1"=="test" (
    call :test
) else if /i "%~1"=="shell" (
    call :shell
) else if /i "%~1"=="db-shell" (
    call :db_shell
) else if /i "%~1"=="redis-shell" (
    call :redis_shell
) else if /i "%~1"=="clean" (
    call :clean
) else if /i "%~1"=="rebuild" (
    call :rebuild
) else if /i "%~1"=="help" (
    call :help
) else (
    call :error "Unknown command: %~1"
    call :help
    exit /b 1
)

endlocal
