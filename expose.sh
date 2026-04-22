#!/bin/bash
# Expose Vani® to mobile/external devices
# Usage:
#   bash expose.sh lan       → HTTPS on local network (same WiFi)
#   bash expose.sh tunnel    → Public URL via Cloudflare tunnel (no account needed)
#   bash expose.sh stop      → Tear down exposure

set -e
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

LAN_IP=$(hostname -I | awk '{print $1}')
CERT_DIR="$PROJECT_DIR/.certs"
MODE="${1:-lan}"

# ── Stop ──
if [ "$MODE" = "stop" ]; then
    echo "Stopping exposure..."
    pkill -f "cloudflared tunnel" 2>/dev/null && echo "  Tunnel stopped" || true
    # Restore HTTP-only nginx
    docker cp "$PROJECT_DIR/client/nginx.conf" contrastive-voice-profiling-client-1:/etc/nginx/conf.d/default.conf 2>/dev/null || true
    docker exec contrastive-voice-profiling-client-1 nginx -s reload 2>/dev/null || true
    echo "Done."
    exit 0
fi

# ── LAN mode (self-signed HTTPS) ──
if [ "$MODE" = "lan" ]; then
    echo "============================================"
    echo "  Vani® — LAN Access (HTTPS)"
    echo "============================================"
    echo ""
    echo "  Your LAN IP: $LAN_IP"
    echo ""

    # Generate self-signed certificate if not exists
    mkdir -p "$CERT_DIR"
    if [ ! -f "$CERT_DIR/cert.pem" ]; then
        echo "[1/3] Generating self-signed certificate..."
        openssl req -x509 -nodes -days 365 \
            -newkey rsa:2048 \
            -keyout "$CERT_DIR/key.pem" \
            -out "$CERT_DIR/cert.pem" \
            -subj "/CN=vani.local" \
            -addext "subjectAltName=IP:$LAN_IP,IP:127.0.0.1,DNS:localhost" \
            2>/dev/null
        echo "  Certificate generated."
    else
        echo "[1/3] Certificate already exists."
    fi

    # Create HTTPS nginx config
    echo "[2/3] Configuring HTTPS nginx..."
    cat > /tmp/vani-nginx-https.conf <<NGINX
server {
    listen 80;
    server_name _;
    return 301 https://\$host:\$server_port\$request_uri;
}

server {
    listen 443 ssl;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "microphone=(self)" always;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API requests to the NestJS server
    location /api/ {
        proxy_pass http://server:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
    }
}
NGINX

    # Copy certs and config into the running container
    docker cp "$CERT_DIR/cert.pem" contrastive-voice-profiling-client-1:/etc/nginx/certs/cert.pem 2>/dev/null || \
        docker exec contrastive-voice-profiling-client-1 mkdir -p /etc/nginx/certs
    docker exec contrastive-voice-profiling-client-1 mkdir -p /etc/nginx/certs 2>/dev/null || true
    docker cp "$CERT_DIR/cert.pem" contrastive-voice-profiling-client-1:/etc/nginx/certs/cert.pem
    docker cp "$CERT_DIR/key.pem" contrastive-voice-profiling-client-1:/etc/nginx/certs/key.pem
    docker cp /tmp/vani-nginx-https.conf contrastive-voice-profiling-client-1:/etc/nginx/conf.d/default.conf

    # Expose port 443
    echo "[3/3] Reloading nginx with HTTPS..."
    docker exec contrastive-voice-profiling-client-1 nginx -s reload

    echo ""
    echo "============================================"
    echo "  LAN Access Ready!"
    echo "============================================"
    echo ""
    echo "  Open on your phone/tablet:"
    echo ""
    echo "    https://$LAN_IP"
    echo ""
    echo "  NOTE: Your browser will show a certificate"
    echo "  warning (self-signed). Tap 'Advanced' →"
    echo "  'Proceed' to continue. This is safe on"
    echo "  your own network."
    echo ""
    echo "  The microphone will work over HTTPS."
    echo ""
    echo "  Stop: bash expose.sh stop"
    echo "============================================"
    exit 0
fi

# ── Tunnel mode (Cloudflare) ──
if [ "$MODE" = "tunnel" ]; then
    echo "============================================"
    echo "  Vani® — Public Tunnel"
    echo "============================================"
    echo ""

    # Install cloudflared if needed
    if ! command -v cloudflared &>/dev/null; then
        echo "[1/2] Installing cloudflared..."
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
        chmod +x /tmp/cloudflared
        sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
        echo "  cloudflared installed."
    else
        echo "[1/2] cloudflared already installed."
    fi

    echo "[2/2] Starting tunnel (no account needed)..."
    echo ""
    echo "  Look for the public URL below (*.trycloudflare.com):"
    echo "  Share that URL — it works on any device, anywhere."
    echo ""
    echo "  Press Ctrl+C to stop the tunnel."
    echo "  ────────────────────────────────────────"
    cloudflared tunnel --url http://localhost:80
fi
