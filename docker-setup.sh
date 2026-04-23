#!/bin/bash

# Fox Passport API - Docker Setup Script
# Usage: ./docker-setup.sh [command]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ Fox Passport API - Docker Setup        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    print_success "Docker is installed"
}

check_ports() {
    local ports=(3002 5432 6379)
    for port in "${ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "Port $port is already in use"
        fi
    done
}

build() {
    print_info "Building Docker image..."
    docker-compose build
    print_success "Build complete!"
}

start() {
    print_info "Starting services..."
    docker-compose up -d

    print_info "Waiting for services to be healthy..."
    sleep 3

    docker-compose ps
    print_success "All services started!"

    print_info "Service URLs:"
    echo "  API:        http://localhost:3002"
    echo "  PostgreSQL: localhost:5432"
    echo "  Redis:      localhost:6379"
}

stop() {
    print_info "Stopping services..."
    docker-compose stop
    print_success "Services stopped!"
}

restart() {
    print_info "Restarting services..."
    docker-compose restart
    print_success "Services restarted!"
}

logs() {
    docker-compose logs -f "${1:-api}" --tail 50
}

status() {
    print_info "Service Status:"
    docker-compose ps

    print_info ""
    print_info "Container Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
}

migrate() {
    print_info "Running database migrations..."
    docker-compose exec api pnpm prisma migrate deploy
    print_success "Migrations complete!"
}

seed() {
    print_info "Seeding database..."
    docker-compose exec api pnpm prisma db seed
    print_success "Database seeded!"
}

test() {
    print_info "Running tests..."
    docker-compose exec api pnpm test
}

shell() {
    print_info "Opening shell in API container..."
    docker-compose exec api sh
}

db_shell() {
    print_info "Opening PostgreSQL shell..."
    docker-compose exec postgres psql -U postgres -d fox_passport_db
}

redis_shell() {
    print_info "Opening Redis CLI..."
    docker-compose exec redis redis-cli
}

clean() {
    print_warning "This will remove all containers and volumes (keeping code)"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        print_success "Cleaned up!"
    else
        print_info "Cancelled"
    fi
}

rebuild() {
    print_warning "This will rebuild everything from scratch"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        docker-compose build --no-cache
        docker-compose up -d
        print_success "Rebuild complete!"
    else
        print_info "Cancelled"
    fi
}

help() {
    print_header
    echo "Available Commands:"
    echo ""
    echo -e "${GREEN}Setup${NC}"
    echo "  ./docker-setup.sh build          Build Docker image"
    echo "  ./docker-setup.sh start          Start all services"
    echo ""
    echo -e "${GREEN}Operations${NC}"
    echo "  ./docker-setup.sh stop           Stop all services"
    echo "  ./docker-setup.sh restart        Restart services"
    echo "  ./docker-setup.sh status         Show service status"
    echo ""
    echo -e "${GREEN}Development${NC}"
    echo "  ./docker-setup.sh logs [service] View logs (default: api)"
    echo "  ./docker-setup.sh shell          Open bash in API container"
    echo "  ./docker-setup.sh db-shell       Open PostgreSQL shell"
    echo "  ./docker-setup.sh redis-shell    Open Redis CLI"
    echo ""
    echo -e "${GREEN}Database${NC}"
    echo "  ./docker-setup.sh migrate        Run database migrations"
    echo "  ./docker-setup.sh seed           Seed database"
    echo ""
    echo -e "${GREEN}Maintenance${NC}"
    echo "  ./docker-setup.sh test           Run tests"
    echo "  ./docker-setup.sh clean          Remove containers and volumes"
    echo "  ./docker-setup.sh rebuild        Rebuild everything from scratch"
    echo ""
    echo -e "${GREEN}Help${NC}"
    echo "  ./docker-setup.sh help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./docker-setup.sh build && ./docker-setup.sh start"
    echo "  ./docker-setup.sh logs                           # Watch all logs"
    echo "  ./docker-setup.sh logs postgres                  # Watch postgres logs"
    echo "  ./docker-setup.sh shell                          # Connect to API"
    echo ""
}

# Main
main() {
    case "${1:-help}" in
        build)
            check_docker
            build
            ;;
        start)
            check_docker
            check_ports
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        migrate)
            migrate
            ;;
        seed)
            seed
            ;;
        test)
            test
            ;;
        shell)
            shell
            ;;
        db-shell)
            db_shell
            ;;
        redis-shell)
            redis_shell
            ;;
        clean)
            clean
            ;;
        rebuild)
            rebuild
            ;;
        help|--help|-h|"")
            help
            ;;
        *)
            print_error "Unknown command: $1"
            help
            exit 1
            ;;
    esac
}

main "$@"
