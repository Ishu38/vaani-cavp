#!/bin/bash
# Start all services for Contrastive Acoustic Voice Profiling
# Usage: ./start.sh

set -e
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Stopping all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  echo "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "============================================"
echo "  Contrastive Acoustic Voice Profiling"
echo "============================================"
echo ""

# --- 1. Docker containers (Redis + MongoDB) ---
echo "[1/5] Starting Redis & MongoDB containers..."

# Use sg docker if docker group isn't active in current session
DOCKER_CMD="docker"
if ! docker info &>/dev/null; then
  if sg docker -c "docker info" &>/dev/null; then
    DOCKER_CMD="sg docker -c"
    echo "  (using sg docker for group access)"
  else
    echo "ERROR: Docker is not accessible. Install Docker and add your user to the docker group."
    echo "  sudo usermod -aG docker \$USER && newgrp docker"
    exit 1
  fi
fi

start_container() {
  local name=$1 image=$2 port=$3
  if [ "$DOCKER_CMD" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
      echo "  $name already running"
    elif docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
      docker start "$name" >/dev/null
      echo "  $name started (existing container)"
    else
      docker run -d --name "$name" -p "$port:$port" "$image" >/dev/null
      echo "  $name created and started"
    fi
  else
    if sg docker -c "docker ps --format '{{.Names}}'" | grep -q "^${name}$"; then
      echo "  $name already running"
    elif sg docker -c "docker ps -a --format '{{.Names}}'" | grep -q "^${name}$"; then
      sg docker -c "docker start $name" >/dev/null
      echo "  $name started (existing container)"
    else
      sg docker -c "docker run -d --name $name -p $port:$port $image" >/dev/null
      echo "  $name created and started"
    fi
  fi
}

start_container "cvp-redis" "redis:7-alpine" 6379
start_container "cvp-mongo" "mongo:7" 27017

# Wait for containers to be ready
echo "  Waiting for services to be ready..."
for i in {1..10}; do
  redis_ok=false
  mongo_ok=false
  (echo PING | nc -w1 localhost 6379 2>/dev/null | grep -q PONG) && redis_ok=true
  (nc -zw1 localhost 27017 2>/dev/null) && mongo_ok=true
  if $redis_ok && $mongo_ok; then
    echo "  Redis: OK | MongoDB: OK"
    break
  fi
  sleep 1
done

# --- 2. Install dependencies if needed ---
echo ""
echo "[2/5] Checking dependencies..."

if [ ! -d "$PROJECT_DIR/server/node_modules" ]; then
  echo "  Installing server dependencies..."
  (cd "$PROJECT_DIR/server" && npm install --silent)
else
  echo "  Server deps: OK"
fi

if [ ! -d "$PROJECT_DIR/client/node_modules" ]; then
  echo "  Installing client dependencies..."
  (cd "$PROJECT_DIR/client" && npm install --silent)
else
  echo "  Client deps: OK"
fi

# --- 3. FastAPI engine (port 8000) ---
echo ""
echo "[3/5] Starting FastAPI engine on port 8000..."
cd "$PROJECT_DIR/engine"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
PIDS+=($!)
echo "  Engine PID: ${PIDS[-1]}"

sleep 3

# --- 4. NestJS server (port 3001) ---
echo ""
echo "[4/5] Starting NestJS server on port 3001..."
cd "$PROJECT_DIR/server"
npx nest start --watch &
PIDS+=($!)
echo "  Server PID: ${PIDS[-1]}"

sleep 4

# --- 5. React client (port 5173) ---
echo ""
echo "[5/5] Starting React client on port 5173..."
cd "$PROJECT_DIR/client"
npx vite --host &
PIDS+=($!)
echo "  Client PID: ${PIDS[-1]}"

sleep 2

echo ""
echo "============================================"
echo "  All services running!"
echo "============================================"
echo ""
echo "  App:      http://localhost:5173"
echo "  API:      http://localhost:3001"
echo "  Swagger:  http://localhost:3001/docs"
echo "  Engine:   http://localhost:8000/health"
echo "  MongoDB:  localhost:27017"
echo "  Redis:    localhost:6379"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "============================================"

wait
