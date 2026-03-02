#!/bin/bash

PORT="${PORT:-3001}"

# Use /data volume if available, otherwise bundled data
if [ -d /data ] && [ -w /data ]; then
  export DB_PATH=/data/yotcrm.db
  export DATA_DIR=/data/listings

  if [ ! -f /data/yotcrm.db ]; then
    echo "Seeding database to volume..."
    cp /app/data/yotcrm.db /data/yotcrm.db 2>/dev/null || echo "Warning: no seed db found"
    mkdir -p /data/listings
    cp -r /app/data/listings/. /data/listings/ 2>/dev/null || echo "Warning: no seed listings"
    echo "Seeding complete."
  fi

  # Ensure inbox dirs exist on volume
  mkdir -p /data/inbox/raw_emails /data/inbox/processed_emails
  export RAW_EMAILS_DIR=/data/inbox/raw_emails
  export PROCESSED_DIR=/data/inbox/processed_emails
else
  mkdir -p /app/data/listings /app/data/inbox/raw_emails /app/data/inbox/processed_emails
  export DB_PATH=/app/data/yotcrm.db
  export DATA_DIR=/app/data/listings
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
