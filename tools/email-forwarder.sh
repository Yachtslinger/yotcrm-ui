#!/bin/bash
# ═══════════════════════════════════════════
# YotCRM Email Forwarder v5 — Persistent Daemon
# Watches inbox for .eml files, POSTs to Railway API
# Sends iMessage notification on new leads
# Runs as KeepAlive daemon with internal 30s loop
# ═══════════════════════════════════════════

# ── Fix PATH for launchd (only has /usr/bin:/bin by default) ──
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

INBOX_DIR="$HOME/YotCRM/inbox/raw_emails"
PROCESSED_DIR="$HOME/YotCRM/inbox/processed_emails"
FAILED_DIR="$HOME/YotCRM/inbox/failed_emails"
LOG_DIR="$HOME/YotCRM/logs"
LOG_FILE="$LOG_DIR/email-forwarder.log"
API_URL="https://yotcrm-production.up.railway.app/api/emails"
API_KEY="yotcrm-email-intake-2026"
POLL_INTERVAL=30
NODE_BIN=$(which node 2>/dev/null || echo "/usr/local/bin/node")
HEARTBEAT_INTERVAL=10  # log heartbeat every N cycles (10 × 30s = 5 min)

# ── Who gets text notifications ──
NOTIFY_NUMBERS=("8504613342" "7862512588")

mkdir -p "$INBOX_DIR" "$PROCESSED_DIR" "$FAILED_DIR" "$LOG_DIR"

log() { echo "[$(date)] $1" >> "$LOG_FILE"; }

# ── Rotate log if > 1MB ──
rotate_log() {
  if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1048576 ]; then
    mv "$LOG_FILE" "$LOG_FILE.old"
  fi
}

# ── Send iMessage notification ──
send_notification() {
  local name="$1"
  local email="$2"
  local boat="$3"
  local source="$4"
  local msg="🚨 NEW LEAD
${name}
${email}
${boat}
via ${source}"

  for number in "${NOTIFY_NUMBERS[@]}"; do
    osascript -e "tell application \"Messages\"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant \"${number}\" of targetService
      send \"${msg}\" to targetBuddy
    end tell" 2>/dev/null &
  done
}

# ── Process all .eml files currently in inbox ──
process_inbox() {
  shopt -s nullglob
  local files=("$INBOX_DIR"/*.eml)
  shopt -u nullglob

  if [ ${#files[@]} -eq 0 ]; then
    return 0
  fi

  log "Processing ${#files[@]} emails"
  local SUCCESS=0
  local FAIL=0

  for filepath in "${files[@]}"; do
    local filename=$(basename "$filepath")
    local response=""
    local http_code=""

    for attempt in 1 2 3; do
      response=$(curl -s -w "\n%{http_code}" \
        --connect-timeout 10 \
        --max-time 30 \
        -X POST \
        -H "Content-Type: text/plain" \
        -H "X-Api-Key: $API_KEY" \
        --data-binary "@$filepath" \
        "$API_URL" 2>/dev/null)

      http_code=$(echo "$response" | tail -1)
      local body=$(echo "$response" | sed '$d')

      if [ "$http_code" = "200" ] || [ "$http_code" = "422" ] || [ "$http_code" = "409" ]; then
        break
      fi
      if [ "$attempt" -lt 3 ]; then
        log "⏳ $filename attempt $attempt failed (HTTP $http_code), retrying..."
        sleep 2
      fi
    done

    if [ "$http_code" = "200" ]; then
      log "✅ $filename → $body"
      mv "$filepath" "$PROCESSED_DIR/$filename"
      SUCCESS=$((SUCCESS + 1))

      # ── Send text notification for NEW leads ──
      local isNew=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('isNew',''))" 2>/dev/null)
      if [ "$isNew" = "True" ] || [ "$isNew" = "true" ]; then
        local leadName=$(echo "$body" | python3 -c "import sys,json; l=json.load(sys.stdin).get('lead',{}); print(l.get('name','Unknown'))" 2>/dev/null)
        local leadEmail=$(echo "$body" | python3 -c "import sys,json; l=json.load(sys.stdin).get('lead',{}); print(l.get('email',''))" 2>/dev/null)
        local leadBoat=$(echo "$body" | python3 -c "import sys,json; l=json.load(sys.stdin).get('lead',{}); print(l.get('boat',''))" 2>/dev/null)
        local leadSource=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('emailType',''))" 2>/dev/null)
        send_notification "$leadName" "$leadEmail" "$leadBoat" "$leadSource"
        log "📱 Texted notification for $leadName"
      fi

    elif [ "$http_code" = "422" ]; then
      log "⚠️  $filename (no email) → $body"
      mv "$filepath" "$PROCESSED_DIR/$filename"
    elif [ "$http_code" = "409" ]; then
      log "♻️  $filename (duplicate) → $body"
      mv "$filepath" "$PROCESSED_DIR/$filename"
    else
      log "❌ $filename (HTTP $http_code) → $body"
      mv "$filepath" "$FAILED_DIR/$filename"
      FAIL=$((FAIL + 1))
    fi
  done

  log "Done — $SUCCESS created, $FAIL failed"

  # ── After processing, pull Railway leads back to local DB ──
  if [ "$SUCCESS" -gt 0 ]; then
    log "Pulling Railway → local DB..."
    local PULL_RESULT=$("$NODE_BIN" /Users/willnoftsinger/yotcrm-deploy/scripts/pullFromRailway.js 2>&1)
    log "$PULL_RESULT"
  fi
}

# ═══════════════════════════════════════════
# MAIN DAEMON LOOP
# ═══════════════════════════════════════════
log "🚀 Email forwarder daemon started (PID $$, interval ${POLL_INTERVAL}s)"

# Trap signals for clean shutdown
trap 'log "⛔ Forwarder daemon stopping (PID $$)"; exit 0' SIGTERM SIGINT SIGHUP

CYCLE=0
while true; do
  rotate_log
  process_inbox
  CYCLE=$((CYCLE + 1))
  if [ $((CYCLE % HEARTBEAT_INTERVAL)) -eq 0 ]; then
    log "💓 Heartbeat — PID $$ alive, cycle $CYCLE"
  fi
  sleep "$POLL_INTERVAL"
done
