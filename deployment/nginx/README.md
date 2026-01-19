# Nginx Configuration for ACE Prep

## Prerequisites

- Nginx installed on VPS
- Domain `certification-trainer.neilferis.com` pointing to VPS IP
- SSL certificate (Let's Encrypt via certbot)

## Setup Instructions

### 1. Copy configuration to VPS

```bash
# From your local machine
scp deployment/nginx/certification-trainer.neilferis.com.conf user@your-vps:/tmp/

# On VPS
sudo mv /tmp/certification-trainer.neilferis.com.conf /etc/nginx/sites-available/
```

### 2. Add WebSocket map (if not present)

Check if your nginx.conf already has the WebSocket upgrade map. If not, add to `/etc/nginx/nginx.conf` inside the `http {}` block:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

### 3. Obtain SSL certificate (if not already done)

```bash
# Install certbot if needed
sudo apt install certbot python3-certbot-nginx

# Get certificate (nginx plugin handles config)
sudo certbot certonly --nginx -d certification-trainer.neilferis.com

# Or standalone if nginx isn't running yet
sudo certbot certonly --standalone -d certification-trainer.neilferis.com
```

### 4. Enable the site

```bash
# Create symlink to enable
sudo ln -s /etc/nginx/sites-available/certification-trainer.neilferis.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 5. Verify the setup

```bash
# Check nginx status
sudo systemctl status nginx

# Test health endpoint through nginx
curl -I https://certification-trainer.neilferis.com/api/health

# Check SSL certificate
curl -vI https://certification-trainer.neilferis.com 2>&1 | grep -A5 "Server certificate"

# Check response headers
curl -I https://certification-trainer.neilferis.com
```

## Troubleshooting

### Check logs

```bash
# Nginx access log
sudo tail -f /var/log/nginx/certification-trainer.access.log

# Nginx error log
sudo tail -f /var/log/nginx/certification-trainer.error.log

# App container logs
docker logs -f ace-prep
```

### Common issues

**502 Bad Gateway**
- Container not running: `docker ps | grep ace-prep`
- Container unhealthy: `curl http://127.0.0.1:3001/api/health`
- Port mismatch: verify `127.0.0.1:3001:3001` in docker-compose

**SSL certificate errors**
- Certificate not found: check path in nginx config
- Certificate expired: `sudo certbot renew`
- Domain mismatch: verify server_name matches certificate

**403 Forbidden**
- Check nginx user can read static files
- Verify SELinux/AppArmor permissions

**504 Gateway Timeout**
- Increase timeout values in nginx config
- Check if app is overloaded: `docker stats ace-prep`

## Certificate Renewal

Certbot auto-renews via systemd timer. Verify:

```bash
# Check renewal timer
sudo systemctl status certbot.timer

# Test renewal (dry run)
sudo certbot renew --dry-run
```

## Traffic Flow

```
Browser Request
     |
     v
[Internet]
     |
     v
[Nginx :443] --SSL termination--> [Docker 127.0.0.1:3001] --> [Fastify App]
     |
     +-- Static assets (cached 1 year)
     +-- /api/* (rate limited, proxied)
     +-- /* SPA routes (proxied, app handles fallback)
```

## Security Notes

- App binds to `127.0.0.1` only - not accessible from outside VPS
- SSL terminates at nginx - internal traffic is HTTP (acceptable on localhost)
- Rate limiting at nginx AND app level (defense in depth)
- HSTS enabled - browsers will always use HTTPS
- Security headers prevent clickjacking, XSS, MIME sniffing
