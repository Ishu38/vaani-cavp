# HTTPS Setup for Vani®

Vani® does **not** terminate TLS itself. HTTPS must be handled by a reverse proxy in front of the application.

## Option A: Cloudflare Proxy (Recommended)

This is the simplest approach and what Vani® is designed for.

1. **Add your domain** to Cloudflare (free plan works)
2. **Point DNS** A record to your server's public IP (with orange cloud proxy ON)
3. **SSL/TLS settings** → Full (Strict)
4. **Edge Certificates** → Always Use HTTPS: ON
5. **Edge Certificates** → Automatic HTTPS Rewrites: ON

Cloudflare handles TLS termination at the edge. Traffic from Cloudflare → your server is proxied over the internal tunnel.

The `infra/cloudflare/` directory contains any additional Cloudflare configuration.

### Nginx IP Restoration

The `client/nginx.conf` is already configured to restore real client IPs from Cloudflare proxy headers:

```nginx
set_real_ip_from 173.245.48.0/20;
# ... (all Cloudflare IP ranges)
real_ip_header CF-Connecting-IP;
```

## Option B: Certbot / Let's Encrypt (Self-Hosted TLS)

If you're not using Cloudflare, you can terminate TLS at your server.

### 1. Install Certbot

```bash
sudo apt install certbot
```

### 2. Obtain certificate

```bash
sudo certbot certonly --standalone -d yourdomain.com
```

### 3. Add TLS to docker-compose

Add a TLS-terminating reverse proxy (e.g., Caddy or nginx) as a new service:

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - client
    networks:
      - vani-network
```

With a `Caddyfile`:

```
yourdomain.com {
    reverse_proxy client:8080
}
```

Caddy handles automatic certificate renewal.

## Environment Variables

When using HTTPS, update these in `.env`:

```bash
CORS_ORIGIN=https://yourdomain.com
```

And in `docker-compose.prod.yml`, the client `API_URL` remains `http://server:3001` (internal Docker traffic, no TLS needed).
