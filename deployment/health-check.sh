#!/usr/bin/env bash
# ACE Prep Health Check Script
# Checks application health and optionally sends alerts
# Usage: ./health-check.sh
# Environment variables:
#   SLACK_WEBHOOK - Slack webhook URL for alerts (optional)
#   ALERT_EMAIL   - Email address for alerts (optional, requires 'mail' command)

set -euo pipefail

# Configuration
HEALTH_URL="http://127.0.0.1:3001/api/health"
CONTAINER_NAME="ace-prep"
TIMEOUT=10

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

# Send Slack alert
send_slack_alert() {
    local message="$1"
    local webhook="${SLACK_WEBHOOK:-}"

    if [ -z "${webhook}" ]; then
        return 0
    fi

    log_info "Sending Slack alert..."

    curl -sf -X POST "${webhook}" \
        -H 'Content-type: application/json' \
        -d "{\"text\": \":warning: ACE Prep Alert: ${message}\"}" \
        > /dev/null 2>&1 || log_warn "Failed to send Slack alert"
}

# Send email alert
send_email_alert() {
    local message="$1"
    local email="${ALERT_EMAIL:-}"

    if [ -z "${email}" ]; then
        return 0
    fi

    if ! command -v mail &> /dev/null; then
        log_warn "mail command not found, skipping email alert"
        return 0
    fi

    log_info "Sending email alert to ${email}..."

    echo "${message}" | mail -s "ACE Prep Health Check Alert" "${email}" \
        || log_warn "Failed to send email alert"
}

# Send all configured alerts
send_alerts() {
    local message="$1"
    send_slack_alert "${message}"
    send_email_alert "${message}"
}

# Check health endpoint
check_health_endpoint() {
    local response
    local http_code

    http_code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time "${TIMEOUT}" "${HEALTH_URL}" 2>/dev/null || echo "000")

    if [ "${http_code}" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Check container status
check_container() {
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        return 0
    else
        return 1
    fi
}

# Main health check
main() {
    local hostname
    hostname=$(hostname)
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Check if container is running
    if ! check_container; then
        log_error "Container ${CONTAINER_NAME} is not running"
        send_alerts "[${hostname}] Container ${CONTAINER_NAME} is not running at ${timestamp}"
        exit 1
    fi

    # Check health endpoint
    if ! check_health_endpoint; then
        log_error "Health check failed for ${HEALTH_URL}"

        # Get container logs for debugging
        local logs
        logs=$(docker logs "${CONTAINER_NAME}" --tail 20 2>&1 || echo "Unable to get logs")

        send_alerts "[${hostname}] Health check failed at ${timestamp}. Recent logs: ${logs}"
        exit 1
    fi

    log_info "Health check passed"
    log_info "  Container: ${CONTAINER_NAME} - running"
    log_info "  Endpoint: ${HEALTH_URL} - healthy"
    log_info "  Time: ${timestamp}"

    exit 0
}

main
