#!/usr/bin/env bash
# ACE Prep UAT Deployment Script
# Usage: ./deploy-uat.sh [VERSION]
# Example: ./deploy-uat.sh uat-sha-abc1234
# If VERSION not provided, defaults to 'uat'
#
# No rollback, no DB backup -- UAT is disposable.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.uat.yml"
CONTAINER_NAME="ace-prep-uat"
HEALTH_URL="http://127.0.0.1:3002/api/health"
HEALTH_MAX_ATTEMPTS=30
HEALTH_INTERVAL=2

# Version to deploy (default: uat)
VERSION="${1:-uat}"

# Load .env file if it exists
if [ -f "${SCRIPT_DIR}/.env" ]; then
    set -a
    source "${SCRIPT_DIR}/.env"
    set +a
fi

# GHCR_OWNER must be set
if [ -z "${GHCR_OWNER:-}" ]; then
    echo "ERROR: GHCR_OWNER environment variable must be set"
    echo "Set it in .env or export GHCR_OWNER=your-github-username"
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[UAT]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[UAT]${NC} $1"; }
log_error() { echo -e "${RED}[UAT]${NC} $1"; }

# Check container health
check_health() {
    local attempt=1

    log_info "Waiting for container to become healthy..."

    while [ $attempt -le $HEALTH_MAX_ATTEMPTS ]; do
        if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            log_error "Container is not running"
            return 1
        fi

        if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
            log_info "Health check passed on attempt ${attempt}"
            return 0
        fi

        echo -n "."
        sleep $HEALTH_INTERVAL
        ((attempt++))
    done

    echo ""
    log_error "Health check failed after ${HEALTH_MAX_ATTEMPTS} attempts"
    return 1
}

# Run database migrations inside container
run_migrations() {
    local max_wait=20
    local attempt=1

    log_info "Waiting for container to be ready for migrations..."

    while [ $attempt -le $max_wait ]; do
        if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            local status
            status=$(docker inspect --format='{{.State.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
            if [ "$status" = "running" ]; then
                sleep 3
                break
            fi
        fi

        if [ $attempt -eq $max_wait ]; then
            log_error "Container failed to start"
            return 1
        fi

        sleep 2
        ((attempt++))
    done

    log_info "Running database migrations..."

    local migration_output
    local migration_exit_code

    migration_output=$(docker exec "${CONTAINER_NAME}" npm run db:migrate 2>&1) || migration_exit_code=$?
    migration_exit_code=${migration_exit_code:-0}

    if [ -n "$migration_output" ]; then
        echo "$migration_output" | while IFS= read -r line; do
            log_info "[migration] $line"
        done
    fi

    if [ $migration_exit_code -ne 0 ]; then
        log_error "Database migration failed with exit code ${migration_exit_code}"
        return 1
    fi

    log_info "Migrations completed"
    return 0
}

# Main
main() {
    log_info "Deploying UAT version: ${VERSION}"

    # Pull new image
    log_info "Pulling image ghcr.io/${GHCR_OWNER}/ace-prep:${VERSION}..."
    export VERSION
    export GHCR_OWNER
    docker compose -f "${COMPOSE_FILE}" pull

    # Deploy with force-recreate
    log_info "Deploying..."
    docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

    # Run migrations
    if ! run_migrations; then
        log_error "Migration failed. UAT deployment aborted."
        docker compose -f "${COMPOSE_FILE}" logs --tail 50
        exit 1
    fi

    # Health check
    if check_health; then
        log_info "UAT deployment successful! Version ${VERSION} is running."
        docker ps --filter "name=${CONTAINER_NAME}"
    else
        log_error "UAT deployment failed health check."
        docker compose -f "${COMPOSE_FILE}" logs --tail 50
        exit 1
    fi
}

main
