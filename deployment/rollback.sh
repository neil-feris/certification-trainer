#!/usr/bin/env bash
# ACE Prep Rollback Script
# Restores previous version and database backup
# Usage: ./rollback.sh [VERSION]
# If VERSION not provided, reads from .previous_version file

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
BACKUP_DIR="${SCRIPT_DIR}/backups"
PREVIOUS_VERSION_FILE="${SCRIPT_DIR}/.previous_version"
CONTAINER_NAME="ace-prep"

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

# Get version to rollback to
get_rollback_version() {
    if [ -n "${1:-}" ]; then
        echo "$1"
    elif [ -f "${PREVIOUS_VERSION_FILE}" ]; then
        cat "${PREVIOUS_VERSION_FILE}"
    else
        log_error "No previous version found. Specify version: ./rollback.sh <version>"
        exit 1
    fi
}

# Restore latest database backup
restore_database() {
    local latest_backup
    latest_backup=$(ls -t "${BACKUP_DIR}"/*.db 2>/dev/null | head -1 || true)

    if [ -z "${latest_backup}" ]; then
        log_warn "No database backup found to restore"
        return 0
    fi

    log_info "Restoring database from ${latest_backup}..."

    # Stop container first
    docker compose -f "${COMPOSE_FILE}" stop || true

    # Copy backup to volume
    # First, get volume mount point
    local volume_name="ace-prep-data"

    # Create temporary container to copy file
    docker run --rm \
        -v "${volume_name}:/data" \
        -v "${latest_backup}:/backup.db:ro" \
        alpine:latest \
        cp /backup.db /data/ace-prep.db

    log_info "Database restored successfully"
}

# Main rollback
main() {
    local rollback_version
    rollback_version=$(get_rollback_version "${1:-}")

    if [ "${rollback_version}" = "none" ]; then
        log_error "Previous version was 'none' - cannot rollback to nothing"
        exit 1
    fi

    log_info "Starting rollback to version: ${rollback_version}"

    # Restore database backup
    restore_database

    # Deploy previous version
    log_info "Deploying version ${rollback_version}..."
    export VERSION="${rollback_version}"
    export GHCR_OWNER
    docker compose -f "${COMPOSE_FILE}" pull
    docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

    # Wait for container to start
    sleep 5

    # Verify rollback
    if curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
        log_info "Rollback successful! Version ${rollback_version} is now running."
        docker ps --filter "name=${CONTAINER_NAME}"
    else
        log_error "Rollback failed - manual intervention required"
        docker logs "${CONTAINER_NAME}" --tail 50
        exit 1
    fi
}

main "${1:-}"
