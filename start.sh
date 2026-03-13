#!/bin/bash

PORT="${PORT:-3001}"

# Use /data volume if available, otherwise bundled data
if [ -d /data ] && [ -w /data ]; then
  export DB_PATH=/data/yotcrm.db
  export DATA_DIR=/data/listings
  export LISTING_FILES_DIR=/data/listing-files

  if [ ! -f /data/yotcrm.db ]; then
    echo "Seeding database to volume..."
    cp /app/data/yotcrm.db /data/yotcrm.db 2>/dev/null || echo "Warning: no seed db found"
    mkdir -p /data/listings
    cp -r /app/data/listings/. /data/listings/ 2>/dev/null || echo "Warning: no seed listings"
    echo "Seeding complete."
  fi

  # Migrate any listing-files from old container path to volume (one-time)
  if [ -d /app/data/listing-files ] && [ "$(ls -A /app/data/listing-files 2>/dev/null)" ]; then
    echo "Migrating listing-files from container to volume..."
    cp -n /app/data/listing-files/. /data/listing-files/ 2>/dev/null && echo "Migration complete." || echo "Migration skipped (files may already exist)"
  fi

  # Ensure all data dirs exist on volume
  mkdir -p /data/inbox/raw_emails /data/inbox/processed_emails /data/listing-files
  export RAW_EMAILS_DIR=/data/inbox/raw_emails
  export PROCESSED_DIR=/data/inbox/processed_emails
else
  mkdir -p /app/data/listings /app/data/inbox/raw_emails /app/data/inbox/processed_emails /app/data/listing-files
  export DB_PATH=/app/data/yotcrm.db
  export DATA_DIR=/app/data/listings
  export LISTING_FILES_DIR=/app/data/listing-files
  export RAW_EMAILS_DIR=/app/data/inbox/raw_emails
  export PROCESSED_DIR=/app/data/inbox/processed_emails
fi

export SCRIPTS_DIR=/app/scripts
export CONFIG_PATH=/app/data/config.json

echo "DB_PATH=$DB_PATH"
echo "DATA_DIR=$DATA_DIR"
echo "Starting on port $PORT..."

# Use exec + node directly (not npx) so signals propagate correctly
exec node node_modules/next/dist/bin/next start -p "$PORT"
