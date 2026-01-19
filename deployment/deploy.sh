#!/usr/bin/env bash
# ACE Prep Deployment Script
# Usage: ./deploy.sh [VERSION]
# Example: ./deploy.sh v1.0.0
# If VERSION not provided, defaults to 'latest'

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
BACKUP_DIR="${SCRIPT_DIR}/backups"
PREVIOUS_VERSION_FILE="${SCRIPT_DIR}/.previous_version"
CONTAINER_NAME="ace-prep"
HEALTH_MAX_ATTEMPTS=30
HEALTH_INTERVAL=2

# Version to deploy (default: latest)
VERSION="${1:-latest}"

# Load .env file if it exists
if [ -f "${SCRIPT_DIR}/.env" ]; then
    set -a
    source "${SCRIPT_DIR}/.env"
    set +a
fi

# GHCR_OWNER must be set (GitHub username/org)
if [ -z "${GHCR_OWNER:-}" ]; then
    echo "ERROR: GHCR_OWNER environment variable must be set"
    echo "Set it in .env or export GHCR_OWNER=your-github-username"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Get current running version (if any)
get_current_version() {
    if docker ps --format '{{.Image}}' --filter "name=${CONTAINER_NAME}" 2>/dev/null | grep -q .; then
        docker inspect --format='{{.Config.Image}}' "${CONTAINER_NAME}" 2>/dev/null | sed 's/.*://' || echo "unknown"
    else
        echo "none"
    fi
}

# Backup database from container
backup_database() {
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/ace-prep-${timestamp}.db"

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "Backing up database to ${backup_file}..."
        if docker cp "${CONTAINER_NAME}:/app/data/ace-prep.db" "${backup_file}"; then
            log_info "Database backup completed: ${backup_file}"
            # Keep only last 10 backups
            ls -t "${BACKUP_DIR}"/*.db 2>/dev/null | tail -n +11 | xargs -r rm
        else
            log_warn "Database backup failed - container may not have database yet"
        fi
    else
        log_warn "Container not running, skipping database backup"
    fi
}

# Check container health
check_health() {
    local attempt=1

    log_info "Waiting for container to become healthy..."

    while [ $attempt -le $HEALTH_MAX_ATTEMPTS ]; do
        # Check if container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            log_error "Container is not running"
            return 1
        fi

        # Check health endpoint
        if curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
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

# Main deployment
main() {
    log_info "Starting deployment of version: ${VERSION}"

    # Store current version for potential rollback
    CURRENT_VERSION=$(get_current_version)
    log_info "Current version: ${CURRENT_VERSION}"

    # Backup database before deployment
    backup_database

    # Store previous version
    echo "${CURRENT_VERSION}" > "${PREVIOUS_VERSION_FILE}"

    # Pull new image
    log_info "Pulling image ghcr.io/${GHCR_OWNER}/ace-prep:${VERSION}..."
    export VERSION
    export GHCR_OWNER
    docker compose -f "${COMPOSE_FILE}" pull

    # Deploy with force-recreate
    log_info "Deploying new version..."
    docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

    # Health check
    if check_health; then
        log_info "Deployment successful! Version ${VERSION} is now running."

        # Show container status
        docker ps --filter "name=${CONTAINER_NAME}"
    else
        log_error "Deployment failed health check. Initiating rollback..."
        "${SCRIPT_DIR}/rollback.sh"
        exit 1
    fi
}

main
