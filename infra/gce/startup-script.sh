#!/usr/bin/env bash
set -euo pipefail

LOG_TAG="vani-startup"
log() { echo "[$(date)] [$LOG_TAG] $*"; }

# --- NVIDIA Drivers ---
if ! command -v nvidia-smi &>/dev/null; then
    log "Installing NVIDIA drivers..."
    apt-get update
    apt-get install -y linux-headers-$(uname -r)
    distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-driver-535 nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
    log "NVIDIA drivers installed."
else
    log "NVIDIA drivers already present: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)"
fi

# --- Docker ---
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed."
else
    log "Docker already installed."
fi

# --- nvidia-container-toolkit (ensure it is configured) ---
if ! docker info 2>/dev/null | grep -q "nvidia"; then
    log "Configuring nvidia-container-toolkit for Docker..."
    apt-get update && apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
fi

# --- Pull and run engine container ---
ENGINE_IMAGE=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/engine-image" -H "Metadata-Flavor: Google" 2>/dev/null || echo "")
if [ -z "${ENGINE_IMAGE}" ]; then
    log "ERROR: engine-image metadata not set. Cannot pull engine container."
    exit 1
fi

log "Pulling engine image: ${ENGINE_IMAGE}"
docker pull "${ENGINE_IMAGE}"

# Stop existing engine container if running
docker stop vani-engine 2>/dev/null || true
docker rm vani-engine 2>/dev/null || true

log "Starting engine container with GPU support..."
docker run -d \
    --name vani-engine \
    --restart unless-stopped \
    --gpus all \
    -p 8000:8000 \
    -v /opt/vani/uploads:/app/uploads \
    -e ENGINE_API_KEY="$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/engine-api-key' -H 'Metadata-Flavor: Google' 2>/dev/null || echo '')" \
    -e MONGO_URI="$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/mongo-uri' -H 'Metadata-Flavor: Google' 2>/dev/null || echo '')" \
    "${ENGINE_IMAGE}"

log "Engine container started."

# --- Setup daily backup cron ---
BACKUP_SCRIPT="/opt/vani/mongo-backup.sh"
mkdir -p /opt/vani

cat > "${BACKUP_SCRIPT}" << 'BACKUP_EOF'
#!/usr/bin/env bash
set -euo pipefail
MONGO_URI=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/mongo-uri" -H "Metadata-Flavor: Google" 2>/dev/null || echo "")
GCS_BACKUP_BUCKET=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcs-backup-bucket" -H "Metadata-Flavor: Google" 2>/dev/null || echo "")
export MONGO_URI GCS_BACKUP_BUCKET
docker run --rm \
    -v /opt/vani/backups:/backups/mongodb \
    -e MONGO_URI="${MONGO_URI}" \
    -e GCS_BACKUP_BUCKET="${GCS_BACKUP_BUCKET}" \
    -e BACKUP_DIR=/backups/mongodb \
    mongo:7 bash -c '
        mongodump --uri="${MONGO_URI}" --out=/tmp/dump && \
        tar -czf /backups/mongodb/mongo-backup-$(date +%Y-%m-%d_%H-%M-%S).tar.gz -C /tmp dump && \
        find /backups/mongodb -name "mongo-backup-*.tar.gz" -type f -mtime +30 -delete
    '
BACKUP_EOF
chmod +x "${BACKUP_SCRIPT}"

# Install cron job for daily backups at 2 AM
CRON_LINE="0 2 * * * ${BACKUP_SCRIPT} >> /var/log/vani-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "${BACKUP_SCRIPT}"; echo "${CRON_LINE}") | crontab -

log "Daily backup cron configured."
log "Startup script complete."
