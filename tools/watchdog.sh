#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# YotCRM Watchdog v3 — Master Health Monitor
# Runs every 5 minutes via LaunchAgent (StartInterval: 300)
# Monitors: Mail.app, Mail Rule, Forwarder, Messages, UI, Tunnel,
#           Watcher, Scanner, inbox depth, forwarder log freshness,
#           processed email cleanup
# ═══════════════════════════════════════════════════════════════

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG="/Users/willnoftsinger/YotCRM/Logs/watchdog.log"
TS=$(date "+%Y-%m-%d %H:%M:%S")
UID_NUM=$(id -u)

log() { echo "[$TS] $1" >> "$LOG"; }

# Trim log if over 2000 lines
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then
    tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

FIXED=0

# ══════════════════════════════════════════════
# CRITICAL PATH: Lead Intake Chain
# ══════════════════════════════════════════════

# ── 1. Mail.app (no Mail = no lead emails saved) ──
if ! pgrep -x Mail > /dev/null 2>&1; then
    log "🚨 Mail.app is NOT RUNNING — launching now"
    open -a Mail
    FIXED=$((FIXED + 1))
fi

# ── 2. Mail Rule (must be enabled — silent disable = total intake failure) ──
RULE_ENABLED=$(osascript -e 'tell application "Mail" to get enabled of (item 1 of (every rule whose name is "Export Lead to YotCRM"))' 2>/dev/null)
if [ "$RULE_ENABLED" = "false" ]; then
    log "🚨 MAIL RULE IS DISABLED — re-enabling now"
    osascript -e 'tell application "Mail" to set enabled of (item 1 of (every rule whose name is "Export Lead to YotCRM")) to true' 2>/dev/null
    FIXED=$((FIXED + 1))
elif [ -z "$RULE_ENABLED" ]; then
    log "⚠️ Could not check Mail rule (Mail may be starting up)"
fi

# ── 3. Email Forwarder Daemon (must have running PID) ──
FORWARDER_LINE=$(launchctl list | grep com.yotcrm.email-forwarder)
FORWARDER_PID=$(echo "$FORWARDER_LINE" | awk '{print $1}')
if [ -z "$FORWARDER_LINE" ]; then
    log "🚨 Email Forwarder is UNLOADED — loading + kickstarting"
    launchctl load ~/Library/LaunchAgents/com.yotcrm.email-forwarder.plist 2>/dev/null
    sleep 1
    launchctl kickstart -k gui/$UID_NUM/com.yotcrm.email-forwarder 2>/dev/null
    FIXED=$((FIXED + 1))
elif [ "$FORWARDER_PID" = "-" ] || [ -z "$FORWARDER_PID" ]; then
    log "🚨 Email Forwarder registered but NOT RUNNING — kickstarting"
    launchctl kickstart -k gui/$UID_NUM/com.yotcrm.email-forwarder 2>/dev/null
    FIXED=$((FIXED + 1))
fi

# ── 4. Forwarder Log Freshness (heartbeat every 5 min; stale = hung) ──
FORWARDER_LOG="$HOME/YotCRM/logs/email-forwarder.log"
if [ -f "$FORWARDER_LOG" ]; then
    FWD_LAST_MOD=$(stat -f %m "$FORWARDER_LOG")
    FWD_NOW=$(date +%s)
    FWD_AGE=$(( FWD_NOW - FWD_LAST_MOD ))
    if [ "$FWD_AGE" -gt 600 ]; then
        log "🚨 Forwarder log stale (${FWD_AGE}s) — daemon may be hung, kickstarting"
        launchctl kickstart -k gui/$UID_NUM/com.yotcrm.email-forwarder 2>/dev/null
        FIXED=$((FIXED + 1))
    fi
fi

# ── 5. Inbox Depth (emails piling up = forwarder stuck or Railway down) ──
INBOX_DIR="$HOME/YotCRM/inbox/raw_emails"
if [ -d "$INBOX_DIR" ]; then
    INBOX_COUNT=$(find "$INBOX_DIR" -name "*.eml" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$INBOX_COUNT" -gt 5 ]; then
        log "🚨 INBOX ALERT: $INBOX_COUNT .eml files queued — force-kickstarting forwarder"
        launchctl kickstart -k gui/$UID_NUM/com.yotcrm.email-forwarder 2>/dev/null
        FIXED=$((FIXED + 1))
    elif [ "$INBOX_COUNT" -gt 0 ]; then
        log "📬 Inbox: $INBOX_COUNT emails pending"
    fi
fi

# ── 6. Messages.app (required for iMessage text alerts) ──
if ! pgrep -x Messages > /dev/null 2>&1; then
    log "⚠️ Messages.app not running — launching for text notifications"
    open -a Messages
    FIXED=$((FIXED + 1))
fi

# ══════════════════════════════════════════════
# SUPPORTING SERVICES
# ══════════════════════════════════════════════

# ── 7. Watcher ──
WATCHER_PID=$(launchctl list | grep com.yotcrm.watcher | awk '{print $1}')
if [ "$WATCHER_PID" = "-" ] || [ -z "$WATCHER_PID" ]; then
    log "⚠️ Watcher is DOWN — restarting"
    launchctl unload ~/Library/LaunchAgents/com.yotcrm.watcher.plist 2>/dev/null
    sleep 2
    launchctl load ~/Library/LaunchAgents/com.yotcrm.watcher.plist
    FIXED=$((FIXED + 1))
fi

# ── 8. Scanner (interval-based, check it's registered) ──
SCANNER_REG=$(launchctl list | grep com.yotcrm.scanner)
if [ -z "$SCANNER_REG" ]; then
    log "⚠️ Scanner is UNLOADED — reloading"
    launchctl load ~/Library/LaunchAgents/com.yotcrm.scanner.plist
    FIXED=$((FIXED + 1))
fi

# ── 9. UI (Next.js) ──
UI_PID=$(launchctl list | grep com.yotcrm.ui | awk '{print $1}')
if [ "$UI_PID" = "-" ] || [ -z "$UI_PID" ]; then
    log "⚠️ UI is DOWN — restarting"
    launchctl unload ~/Library/LaunchAgents/com.yotcrm.ui.plist 2>/dev/null
    sleep 2
    launchctl load ~/Library/LaunchAgents/com.yotcrm.ui.plist
    FIXED=$((FIXED + 1))
fi

# ── 10. Tunnel ──
TUNNEL_PID=$(launchctl list | grep com.yotcrm.tunnel | awk '{print $1}')
if [ "$TUNNEL_PID" = "-" ] || [ -z "$TUNNEL_PID" ]; then
    log "⚠️ Tunnel is DOWN — restarting"
    launchctl unload ~/Library/LaunchAgents/com.yotcrm.tunnel.plist 2>/dev/null
    sleep 2
    launchctl load ~/Library/LaunchAgents/com.yotcrm.tunnel.plist
    FIXED=$((FIXED + 1))
fi

# ── 11. Watcher log freshness ──
WATCHER_LOG="/Users/willnoftsinger/YotCRM/Logs/yotcrm_watcher.out"
if [ -f "$WATCHER_LOG" ]; then
    LAST_MOD=$(stat -f %m "$WATCHER_LOG")
    NOW=$(date +%s)
    AGE=$(( NOW - LAST_MOD ))
    if [ "$AGE" -gt 300 ]; then
        log "⚠️ Watcher log stale (${AGE}s old) — force restarting"
        launchctl unload ~/Library/LaunchAgents/com.yotcrm.watcher.plist 2>/dev/null
        sleep 2
        launchctl load ~/Library/LaunchAgents/com.yotcrm.watcher.plist
        FIXED=$((FIXED + 1))
    fi
fi

# ══════════════════════════════════════════════
# MAINTENANCE
# ══════════════════════════════════════════════

# ── 12. Cleanup processed emails older than 30 days ──
PROCESSED_DIR="$HOME/YotCRM/inbox/processed_emails"
if [ -d "$PROCESSED_DIR" ]; then
    OLD_COUNT=$(find "$PROCESSED_DIR" -name "*.eml" -mtime +30 2>/dev/null | wc -l | tr -d ' ')
    if [ "$OLD_COUNT" -gt 0 ]; then
        find "$PROCESSED_DIR" -name "*.eml" -mtime +30 -delete 2>/dev/null
        log "🧹 Cleaned $OLD_COUNT processed emails older than 30 days"
    fi
fi

# ══════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════
if [ "$FIXED" -gt 0 ]; then
    log "🔧 Fixed $FIXED service(s)"
else
    log "✅ All services healthy"
fi
