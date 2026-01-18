#!/bin/bash
set -e

# ACE Prep Deployment Script
# Run this on the VPS after cloning the repo

APP_DIR="/opt/ace-prep"
NGINX_CONF="/etc/nginx/sites-available/certification-trainer.neilferis.com"

echo "=== ACE Prep Deployment ==="

# 1. Pull latest code
echo "Pulling latest code..."
cd $APP_DIR
git pull origin main

# 2. Build and start containers
echo "Building and starting Docker containers..."
docker compose down || true
docker compose up -d --build

# 3. Wait for health check
echo "Waiting for app to be healthy..."
sleep 5
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health | grep -q "ok"; then
        echo "App is healthy!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# 4. Verify
echo ""
echo "=== Deployment Complete ==="
echo "App running at: https://certification-trainer.neilferis.com"
docker compose ps
