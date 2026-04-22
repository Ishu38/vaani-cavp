#!/bin/bash
# Production deployment script for Contrastive Voice Profiling
# Runs: Engine natively (GPU), everything else in Docker

set -e
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ── Stop mode ──
if [ "${1:-}" = "stop" ]; then
    echo "Stopping Vani®..."
    sudo systemctl stop vani-engine.service 2>/dev/null && echo "  Engine stopped" || echo "  Engine was not running"
    docker compose down 2>&1 && echo "  Docker services stopped"
    echo "Done."
    exit 0
fi

# ── Status mode ──
if [ "${1:-}" = "status" ]; then
    echo "=== Engine (systemd) ==="
    systemctl status vani-engine.service --no-pager -l 2>/dev/null | head -5 || echo "  Service not installed"
    curl -sf http://localhost:8000/health && echo "" || echo "  Health: NOT RESPONDING"
    echo "=== Server ==="
    curl -sf http://localhost:3001/api/health && echo "" || echo "NOT RUNNING"
    echo "=== Client ==="
    curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost || echo "NOT RUNNING"
    echo "=== Docker ==="
    docker compose ps 2>&1
    exit 0
fi

echo "============================================"
echo "  Vani® — Production Deployment"
echo "============================================"
echo ""

# ── 1. Check prerequisites ──
echo "[1/4] Checking prerequisites..."
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose not found"; exit 1; }
nvidia-smi >/dev/null 2>&1 && echo "  GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)" || echo "  GPU: None (will use CPU)"
echo "  Docker: OK"

# Install logrotate config for engine.log
LOGROTATE_SRC="$PROJECT_DIR/infra/logrotate/vani-engine"
LOGROTATE_DEST="/etc/logrotate.d/vani-engine"
if [ -f "$LOGROTATE_SRC" ] && [ ! -f "$LOGROTATE_DEST" ]; then
    sudo cp "$LOGROTATE_SRC" "$LOGROTATE_DEST"
    echo "  Logrotate: installed"
elif [ -f "$LOGROTATE_DEST" ]; then
    echo "  Logrotate: OK"
fi

# ── 2. Start Engine (native, needs GPU) via systemd ──
echo ""
echo "[2/4] Starting FastAPI engine (native, GPU-accelerated)..."

SERVICE_FILE="$PROJECT_DIR/infra/vani-engine.service"
SYSTEMD_DEST="/etc/systemd/system/vani-engine.service"

# Install systemd service if not present or outdated
if [ ! -f "$SYSTEMD_DEST" ] || ! diff -q "$SERVICE_FILE" "$SYSTEMD_DEST" >/dev/null 2>&1; then
    echo "  Installing systemd service..."
    sudo cp "$SERVICE_FILE" "$SYSTEMD_DEST"
    sudo systemctl daemon-reload
    sudo systemctl enable vani-engine.service
fi

# Clear stale bytecode
find "$PROJECT_DIR/engine" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

# Restart the engine service
sudo systemctl restart vani-engine.service
ENGINE_PID=$(systemctl show --property MainPID --value vani-engine.service)
echo "  Engine PID: $ENGINE_PID (managed by systemd)"

# Wait for engine to be ready
echo "  Waiting for engine..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
        echo "  Engine: READY"
        break
    fi
    # Check if systemd reports the service as failed
    if systemctl is-failed vani-engine.service >/dev/null 2>&1; then
        echo "  ERROR: Engine service failed. Logs:"
        journalctl -u vani-engine.service --no-pager -n 30
        tail -20 "$PROJECT_DIR/engine.log"
        exit 1
    fi
    if [ $i -eq 30 ]; then
        echo "  ERROR: Engine failed to start within 60s. Check: journalctl -u vani-engine.service"
        exit 1
    fi
    sleep 2
done

# ── 3. Build & start Docker services ──
echo ""
echo "[3/4] Building and starting Docker services..."
cd "$PROJECT_DIR"
docker compose up --build -d 2>&1

# Wait for all services
echo ""
echo "  Waiting for services to be healthy..."
for i in $(seq 1 60); do
    SERVER_OK=$(docker compose ps server --format json 2>/dev/null | grep -c '"healthy"' || echo 0)
    CLIENT_OK=$(docker compose ps client --format json 2>/dev/null | grep -c '"running"' || echo 0)

    if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
        echo "  Server: READY"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "  WARNING: Server may still be starting..."
    fi
    sleep 2
done

# ── 4. Status ──
echo ""
echo "[4/4] Checking status..."
echo ""
docker compose ps
echo ""

echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
echo "  App:      http://localhost"
echo "  API:      http://localhost:3001"
echo "  Engine:   http://localhost:8000 (systemd-managed, auto-restarts)"
echo "  MongoDB:  localhost:27017 (Docker)"
echo "  Redis:    localhost:6379 (Docker)"
echo ""
echo "  Logs:"
echo "    Engine:  journalctl -u vani-engine.service -f"
echo "    Server:  docker compose logs -f server"
echo "    Client:  docker compose logs -f client"
echo ""
echo "  Stop all:  ./deploy.sh stop"
echo "  Status:    ./deploy.sh status"
echo "============================================"
