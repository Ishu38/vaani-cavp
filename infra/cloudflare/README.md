# Cloudflare Configuration Guide

## Prerequisites
- Domain name (e.g., vanidiagnosis.com or vaniapp.in)
- Cloudflare account (free plan works)

## Step 1: Add Domain to Cloudflare
1. Go to https://dash.cloudflare.com
2. Add site -> enter your domain
3. Select Free plan
4. Cloudflare provides 2 nameservers -- update at your domain registrar
5. Wait for propagation (usually 5-30 minutes)

## Step 2: DNS Records

Add these DNS records:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | @ | your-client-service-xxxxx.run.app | Proxied (orange cloud) |
| CNAME | api | your-server-service-xxxxx.run.app | Proxied (orange cloud) |
| A | engine | <GCE-VM-external-IP> | DNS only (gray cloud) |

Notes:
- Cloud Run provides auto-SSL, Cloudflare adds edge caching + DDoS
- Engine should NOT be proxied (internal communication only)
- If using a single Cloud Run service for everything, just use @

## Step 3: SSL/TLS Configuration
1. SSL/TLS -> Overview -> Set to **Full (strict)**
   - This ensures encrypted traffic both Cloudflare<->origin AND client<->Cloudflare
   - Cloud Run provides its own TLS certificate automatically
2. SSL/TLS -> Edge Certificates:
   - Always Use HTTPS: ON
   - Minimum TLS Version: TLS 1.2
   - Opportunistic Encryption: ON
   - TLS 1.3: ON
3. SSL/TLS -> Origin Server:
   - If using GCE directly: Create an Origin Certificate
   - If using Cloud Run: Not needed (Google manages certs)

## Step 4: Security Settings
1. Security -> WAF:
   - Enable Managed Ruleset (free tier includes basic rules)
   - Create custom rule: Rate limit /api/auth/* to 10 requests/minute per IP
2. Security -> Bots:
   - Enable Bot Fight Mode (free)
3. Security -> Settings:
   - Security Level: Medium
   - Challenge Passage: 30 minutes
   - Browser Integrity Check: ON

## Step 5: Performance
1. Speed -> Optimization:
   - Auto Minify: HTML, CSS, JS all ON
   - Brotli: ON
2. Caching -> Configuration:
   - Browser Cache TTL: 4 hours
3. Caching -> Cache Rules:
   - Create rule: Cache static assets from /assets/* for 30 days
   - Create rule: Bypass cache for /api/*

## Step 6: Page Rules (if needed)
- `*yourdomain.com/api/*` -> Cache Level: Bypass, SSL: Full
- `*yourdomain.com/*` -> Always Use HTTPS

## Step 7: Update Application Config

In your `.env`:
```bash
CORS_ORIGIN=https://yourdomain.com
```

In `docker-compose.prod.yml`, update the client's CORS_ORIGIN.

## Cost
- **Free plan**: SSL, DDoS protection, CDN, 100K DNS queries/month, basic WAF
- **Pro ($20/mo)**: Advanced WAF, image optimization, mobile redirect
- **Business ($200/mo)**: Custom SSL, 100% uptime SLA

For school pilots: **Free plan is sufficient.**

## Architecture After Setup
```
Student/Teacher Browser
    | HTTPS
Cloudflare Edge (SSL termination, CDN, WAF, DDoS)
    | HTTPS (Full strict)
Google Cloud Run
    |-- Client (nginx serving React SPA)
    |     | internal proxy
    +-- Server (NestJS API)
           | internal VPC
         GCE VM (FastAPI Engine + GPU)
           |
         MongoDB Atlas (encrypted, backed up)
```
