#!/usr/bin/env bash
set -euo pipefail

# MongoDB Backup Script
# Dumps MongoDB, compresses, optionally uploads to GCS, and prunes old backups.

BACKUP_DIR="${BACKUP_DIR:-/backups/mongodb}"
RETENTION_DAYS=30
DATE_STAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="mongo-backup-${DATE_STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting MongoDB backup..."

# Run mongodump
DUMP_DIR=$(mktemp -d)
if [ -n "${MONGO_URI:-}" ]; then
    mongodump --uri="${MONGO_URI}" --out="${DUMP_DIR}/dump"
else
    echo "[$(date)] ERROR: MONGO_URI is not set. Aborting."
    exit 1
fi

echo "[$(date)] Compressing backup..."
tar -czf "${BACKUP_DIR}/${BACKUP_FILE}" -C "${DUMP_DIR}" dump
rm -rf "${DUMP_DIR}"

echo "[$(date)] Backup saved to ${BACKUP_DIR}/${BACKUP_FILE}"

# Upload to GCS if bucket is configured
if [ -n "${GCS_BACKUP_BUCKET:-}" ]; then
    GCS_PATH="gs://${GCS_BACKUP_BUCKET}/mongodb/$(date +%Y-%m-%d)/"
    echo "[$(date)] Uploading to ${GCS_PATH}..."
    gsutil cp "${BACKUP_DIR}/${BACKUP_FILE}" "${GCS_PATH}"
    echo "[$(date)] Upload complete."
fi

# Prune old local backups (retain last 30)
echo "[$(date)] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "mongo-backup-*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete

REMAINING=$(find "${BACKUP_DIR}" -name "mongo-backup-*.tar.gz" -type f | wc -l)
echo "[$(date)] Backup complete. ${REMAINING} local backups retained."
