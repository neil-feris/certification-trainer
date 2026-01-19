# VPS Setup Checklist for ACE Prep

Complete guide for finalizing VPS setup and performing initial deployment.

## Prerequisites

- SSH access configured: `ssh ace-deploy` (or `ssh deploy@169.239.182.27 -i ~/.ssh/ace_deploy_key`)
- Deployment scripts already copied to `/opt/ace-prep/`
- nginx config files ready in `deployment/nginx/`

---

## 1. Verify Docker Installation

### Check Docker is installed and accessible

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Verify deploy user can run docker (no sudo required)
docker ps

# If "permission denied", user is not in docker group - see fix below
```

### If Docker is NOT installed (Debian/Ubuntu)

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository (Ubuntu)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# For Debian, replace 'ubuntu' with 'debian' in the above command

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### Add deploy user to docker group

```bash
# Add deploy user to docker group
sudo usermod -aG docker deploy

# IMPORTANT: Log out and back in for group change to take effect
exit
# Then SSH back in

# Verify
docker ps
```

---

## 2. Verify Directory Structure

### Check /opt/ace-prep exists with correct files

```bash
# Check directory exists and ownership
ls -la /opt/ace-prep/

# Expected output should show:
# - deploy.sh
# - rollback.sh
# - health-check.sh
# - docker-compose.prod.yml
# - env.template
# - nginx/ directory

# Verify scripts are executable
ls -la /opt/ace-prep/*.sh
# Should show -rwxr-xr-x permissions

# If not executable, fix permissions
chmod +x /opt/ace-prep/*.sh

# Create backups directory
mkdir -p /opt/ace-prep/backups

# Verify ownership (should be deploy:deploy)
sudo chown -R deploy:deploy /opt/ace-prep/
```

### If directory doesn't exist, create it

```bash
sudo mkdir -p /opt/ace-prep
sudo chown deploy:deploy /opt/ace-prep
```

---

## 3. Create .env File

### Copy template and edit

```bash
cd /opt/ace-prep

# Copy template
cp env.template .env

# Edit with your preferred editor
nano .env
# or
vim .env
```

### Variables that need real values

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `GHCR_OWNER` | GitHub username/org owning the container images | Your GitHub username (e.g., `neilferis`) |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Google Cloud Console > APIs & Services > Credentials |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Same as above |
| `JWT_SECRET` | Secret for signing access tokens | Generate with command below |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Generate with command below |

### Generate secure JWT secrets

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate JWT_REFRESH_SECRET (use a different value!)
openssl rand -base64 32
```

### Example .env file

```bash
# GitHub Container Registry
GHCR_OWNER=neilferis

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://certification-trainer.neilferis.com/api/auth/google/callback

# JWT Secrets (use your generated values)
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=
JWT_REFRESH_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy=

# CORS
CORS_ORIGIN=https://certification-trainer.neilferis.com
```

### Verify .env file permissions

```bash
# Restrict permissions (only owner can read)
chmod 600 /opt/ace-prep/.env

# Verify
ls -la /opt/ace-prep/.env
# Should show: -rw------- 1 deploy deploy
```

---

## 4. Setup Nginx

### Install nginx if not present

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

### Copy nginx config to VPS

**From your local machine (not the VPS):**

```bash
# Copy the config file
scp deployment/nginx/certification-trainer.neilferis.com.conf \
    ace-deploy:/tmp/

# Copy the setup script
scp deployment/nginx/setup-nginx.sh \
    ace-deploy:/tmp/
```

**On the VPS:**

```bash
# Move config to nginx directory
sudo mv /tmp/certification-trainer.neilferis.com.conf \
    /etc/nginx/sites-available/

# Make setup script executable
chmod +x /tmp/setup-nginx.sh
```

### Add WebSocket map to nginx.conf

Check if the map already exists:

```bash
grep -q "connection_upgrade" /etc/nginx/nginx.conf && echo "Map exists" || echo "Map missing"
```

If missing, add it to `/etc/nginx/nginx.conf` inside the `http {}` block:

```bash
sudo nano /etc/nginx/nginx.conf
```

Add this block inside `http { ... }`:

```nginx
# WebSocket upgrade support
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

### Enable the site

```bash
# Create symlink to enable site
sudo ln -sf /etc/nginx/sites-available/certification-trainer.neilferis.com \
    /etc/nginx/sites-enabled/

# Remove default site if present (optional)
sudo rm -f /etc/nginx/sites-enabled/default
```

### Obtain SSL certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Create webroot directory for ACME challenges
sudo mkdir -p /var/www/certbot

# Obtain certificate (will prompt for email)
sudo certbot certonly --nginx -d certification-trainer.neilferis.com

# Or use standalone if nginx isn't running yet
sudo certbot certonly --standalone -d certification-trainer.neilferis.com
```

### Test and reload nginx

```bash
# Test configuration
sudo nginx -t

# If test passes, reload
sudo systemctl reload nginx

# Verify nginx is running
sudo systemctl status nginx
```

---

## 5. Login to GitHub Container Registry

The deploy user needs to pull images from GHCR.

### Create a GitHub Personal Access Token (PAT)

1. Go to GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name: `ace-prep-vps-deploy`
4. Select scopes:
   - `read:packages` (required)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again)

### Login to GHCR on VPS

```bash
# Login to GitHub Container Registry
# Replace YOUR_GITHUB_USERNAME and YOUR_TOKEN
echo "YOUR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Verify login succeeded
docker pull ghcr.io/YOUR_GITHUB_USERNAME/ace-prep:latest 2>/dev/null && echo "Login successful!" || echo "Check your credentials"
```

**Note:** Docker stores credentials in `~/.docker/config.json`. This only needs to be done once.

---

## 6. Initial Deployment Test

### Manual first deployment

```bash
cd /opt/ace-prep

# Load environment variables
source .env

# Pull the latest image
docker pull ghcr.io/${GHCR_OWNER}/ace-prep:latest

# Start the container
VERSION=latest docker compose -f docker-compose.prod.yml up -d

# Watch logs
docker logs -f ace-prep
# Press Ctrl+C to stop following logs
```

### Verify app is running locally

```bash
# Check container is running
docker ps --filter "name=ace-prep"

# Test health endpoint directly
curl -s http://127.0.0.1:3001/api/health | jq .

# Expected output:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   ...
# }
```

### Verify nginx is proxying correctly

```bash
# Test through nginx (HTTP -> HTTPS redirect)
curl -I http://certification-trainer.neilferis.com/

# Test HTTPS endpoint
curl -s https://certification-trainer.neilferis.com/api/health | jq .
```

### Test full flow end-to-end

```bash
# From your local machine (not VPS), test the public endpoint
curl -s https://certification-trainer.neilferis.com/api/health

# Open in browser
open https://certification-trainer.neilferis.com
```

### Use the deployment script for future deployments

```bash
cd /opt/ace-prep

# Deploy a specific version
./deploy.sh v1.0.0

# Deploy latest
./deploy.sh latest

# Or just
./deploy.sh
```

---

## 7. Post-Deployment Verification

### Check all systems

```bash
# Container status
docker ps

# Container health
docker inspect ace-prep --format='{{.State.Health.Status}}'

# Recent logs (last 50 lines)
docker logs ace-prep --tail 50

# Resource usage
docker stats ace-prep --no-stream

# Disk usage
df -h /opt/ace-prep
docker system df
```

### Setup health check cron job (optional)

```bash
# Edit crontab
crontab -e

# Add health check every 5 minutes
*/5 * * * * /opt/ace-prep/health-check.sh >> /var/log/ace-prep-health.log 2>&1
```

---

## Troubleshooting

### Container won't start

```bash
# Check container logs
docker logs ace-prep

# Check if port is already in use
sudo netstat -tlnp | grep 3001
# or
sudo ss -tlnp | grep 3001

# Check docker events
docker events --since 10m --filter container=ace-prep

# Verify .env file is loaded correctly
docker compose -f docker-compose.prod.yml config

# Try running interactively to see errors
VERSION=latest docker compose -f docker-compose.prod.yml up
```

**Common causes:**
- Missing or invalid .env file
- Port 3001 already in use
- Out of memory (check `docker stats`)
- Invalid environment variables

### Nginx 502 Bad Gateway

```bash
# Check if container is running
docker ps --filter "name=ace-prep"

# Check container health
curl -s http://127.0.0.1:3001/api/health

# Check nginx error log
sudo tail -f /var/log/nginx/certification-trainer.error.log

# Verify upstream is correct
grep upstream /etc/nginx/sites-available/certification-trainer.neilferis.com

# Check nginx can reach container
sudo curl http://127.0.0.1:3001/api/health
```

**Common causes:**
- Container not running
- Container on different port than nginx expects
- Container crashed during request
- Firewall blocking localhost connections (rare)

### Permission denied errors

```bash
# Docker permission denied
# -> User not in docker group
sudo usermod -aG docker deploy
# Then logout and back in

# File permission denied
# Check ownership
ls -la /opt/ace-prep/
# Fix if needed
sudo chown -R deploy:deploy /opt/ace-prep/

# Script not executable
chmod +x /opt/ace-prep/*.sh

# Volume permission denied
# Check volume permissions
docker run --rm -v ace-prep-data:/data alpine ls -la /data
```

### Can't pull from GHCR

```bash
# Check login status
cat ~/.docker/config.json | grep ghcr

# Login again
echo "YOUR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Verify image exists (from local machine with push access)
docker manifest inspect ghcr.io/YOUR_USERNAME/ace-prep:latest

# Check if image is public or private
# Private images require read:packages scope on PAT
```

**Common causes:**
- Token expired or revoked
- Token missing `read:packages` scope
- Wrong username in login command
- Image doesn't exist (hasn't been pushed yet)
- Package visibility set to private without proper permissions

### SSL Certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
echo | openssl s_client -servername certification-trainer.neilferis.com \
    -connect certification-trainer.neilferis.com:443 2>/dev/null | \
    openssl x509 -noout -dates
```

### Database issues

```bash
# Check if database volume exists
docker volume ls | grep ace-prep

# Check database file in volume
docker run --rm -v ace-prep-data:/data alpine ls -la /data

# Backup database manually
docker cp ace-prep:/app/data/ace-prep.db ./backup.db

# Restore database from backup
docker cp ./backup.db ace-prep:/app/data/ace-prep.db
docker restart ace-prep
```

---

## Quick Reference Commands

```bash
# SSH to VPS
ssh ace-deploy

# Change to deployment directory
cd /opt/ace-prep

# Deploy new version
./deploy.sh v1.0.0

# Rollback to previous version
./rollback.sh

# Check health
./health-check.sh

# View logs
docker logs ace-prep -f --tail 100

# Restart container
docker restart ace-prep

# Stop container
docker compose -f docker-compose.prod.yml down

# Start container
VERSION=latest docker compose -f docker-compose.prod.yml up -d

# Check nginx status
sudo systemctl status nginx

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# View nginx error log
sudo tail -f /var/log/nginx/certification-trainer.error.log
```

---

## GitHub Secrets Required

For CI/CD automation, these secrets must be set in GitHub repository settings:

| Secret | Value | Notes |
|--------|-------|-------|
| `VPS_HOST` | `169.239.182.27` | VPS IP address |
| `VPS_USER` | `deploy` | SSH user |
| `VPS_SSH_KEY` | Contents of `~/.ssh/ace_deploy_key` | Private key (entire file contents) |

**To add secrets:**
1. Go to repository Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Add each secret with the name and value from the table above

---

## Checklist Summary

- [ ] Docker installed and deploy user in docker group
- [ ] /opt/ace-prep directory exists with correct ownership
- [ ] All scripts executable (chmod +x *.sh)
- [ ] backups/ directory created
- [ ] .env file created with all required values
- [ ] .env permissions set to 600
- [ ] nginx config copied to /etc/nginx/sites-available/
- [ ] WebSocket map added to nginx.conf
- [ ] Site enabled in /etc/nginx/sites-enabled/
- [ ] SSL certificate obtained via certbot
- [ ] nginx tested and reloaded
- [ ] Logged in to GHCR (docker login ghcr.io)
- [ ] Initial deployment successful
- [ ] Health check passing locally (curl localhost:3001/api/health)
- [ ] Health check passing via nginx (curl https://domain/api/health)
- [ ] GitHub secrets configured (VPS_HOST, VPS_USER, VPS_SSH_KEY)
