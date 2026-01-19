#!/usr/bin/env bash
# ACE Prep Nginx Setup Script
# Run on VPS after copying nginx config

set -euo pipefail

DOMAIN="certification-trainer.neilferis.com"
CONFIG_FILE="/etc/nginx/sites-available/${DOMAIN}"
ENABLED_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Check nginx is installed
if ! command -v nginx &> /dev/null; then
    log_error "Nginx is not installed"
    exit 1
fi

# Check config file exists
if [[ ! -f "${CONFIG_FILE}" ]]; then
    log_error "Config file not found: ${CONFIG_FILE}"
    log_info "Copy it first: scp certification-trainer.neilferis.com.conf root@vps:${CONFIG_FILE}"
    exit 1
fi

# Check WebSocket map in nginx.conf
if ! grep -q "connection_upgrade" /etc/nginx/nginx.conf; then
    log_warn "WebSocket map not found in nginx.conf"
    log_info "Add the following to /etc/nginx/nginx.conf inside http {} block:"
    echo ""
    echo "map \$http_upgrade \$connection_upgrade {"
    echo "    default upgrade;"
    echo "    '' close;"
    echo "}"
    echo ""
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check SSL certificate exists
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [[ ! -f "${CERT_PATH}" ]]; then
    log_warn "SSL certificate not found at ${CERT_PATH}"
    log_info "Obtain certificate with: certbot certonly --nginx -d ${DOMAIN}"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Enable site
if [[ ! -L "${ENABLED_LINK}" ]]; then
    log_info "Enabling site..."
    ln -s "${CONFIG_FILE}" "${ENABLED_LINK}"
else
    log_info "Site already enabled"
fi

# Test nginx config
log_info "Testing nginx configuration..."
if nginx -t; then
    log_info "Configuration test passed"
else
    log_error "Configuration test failed"
    exit 1
fi

# Reload nginx
log_info "Reloading nginx..."
systemctl reload nginx

# Verify
log_info "Verifying setup..."
sleep 2

# Check nginx is running
if systemctl is-active --quiet nginx; then
    log_info "Nginx is running"
else
    log_error "Nginx is not running"
    exit 1
fi

# Test health endpoint (may fail if app not running)
log_info "Testing health endpoint..."
if curl -sf "http://127.0.0.1:3001/api/health" > /dev/null 2>&1; then
    log_info "Backend health check passed"

    if curl -sf "https://${DOMAIN}/api/health" > /dev/null 2>&1; then
        log_info "Full stack health check passed"
    else
        log_warn "HTTPS health check failed - check SSL certificate"
    fi
else
    log_warn "Backend not responding - deploy the app with deploy.sh"
fi

log_info "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Deploy the app: ./deploy.sh v1.0.0"
echo "  2. Verify: curl https://${DOMAIN}/api/health"
echo "  3. Open in browser: https://${DOMAIN}"
