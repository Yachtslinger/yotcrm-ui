#!/bin/bash
# verify-deploy.sh — Run after every git push to confirm Railway has the right code.
# Usage: ./scripts/verify-deploy.sh
# Or from anywhere: bash /Users/willnoftsinger/yotcrm-deploy/scripts/verify-deploy.sh

RAILWAY="https://yotcrm-production.up.railway.app"
PASS=0
FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
head() { echo ""; echo "── $1 ──"; }

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     YotCRM Deploy Verification         ║"
echo "╚════════════════════════════════════════╝"

# ── 1. Git remote ──────────────────────────────────────────────
head "Git"
REMOTE=$(cd /Users/willnoftsinger/yotcrm-deploy && git remote get-url origin 2>/dev/null)
LOCAL_SHA=$(cd /Users/willnoftsinger/yotcrm-deploy && git rev-parse HEAD 2>/dev/null | cut -c1-7)
REMOTE_SHA=$(git ls-remote https://github.com/Yachtslinger/yotcrm.git HEAD 2>/dev/null | cut -c1-7)

if echo "$REMOTE" | grep -q "yotcrm-ui"; then
  fail "Remote is yotcrm-ui.git — WRONG. Fix: git remote set-url origin https://github.com/Yachtslinger/yotcrm.git"
else
  ok "Remote: $REMOTE"
fi

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  ok "Local and GitHub in sync ($LOCAL_SHA)"
else
  fail "Local ($LOCAL_SHA) differs from GitHub ($REMOTE_SHA) — did you push?"
fi

# ── 2. Railway health ──────────────────────────────────────────
head "Railway"
HEALTH=$(curl -s --max-time 10 "$RAILWAY/api/health" 2>/dev/null)
if echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='ok' or d.get('ok')==True" 2>/dev/null; then
  LEAD_COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tables',{}).get('leads','?'))" 2>/dev/null)
  ok "Health endpoint OK — leads: $LEAD_COUNT"
else
  fail "Health endpoint not OK: $HEALTH"
fi

# ── 3. PDF file storage ────────────────────────────────────────
head "PDF Storage"
DEBUG=$(curl -s --max-time 10 "$RAILWAY/api/listings/debug" 2>/dev/null)
DIR=$(echo "$DEBUG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['resolvedUploadDir'])" 2>/dev/null)
FILE_COUNT=$(echo "$DEBUG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fileCount'])" 2>/dev/null)
DIR_EXISTS=$(echo "$DEBUG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dirExists'])" 2>/dev/null)
LISTING_FILES_DIR=$(echo "$DEBUG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['env']['LISTING_FILES_DIR'])" 2>/dev/null)

if [ "$DIR_EXISTS" = "True" ]; then
  ok "Upload dir exists: $DIR ($FILE_COUNT files)"
else
  fail "Upload dir missing: $DIR"
fi

if [ "$LISTING_FILES_DIR" = "/data/listing-files" ]; then
  ok "LISTING_FILES_DIR=/data/listing-files (persistent volume)"
else
  fail "LISTING_FILES_DIR=$LISTING_FILES_DIR — expected /data/listing-files"
fi

# ── 4. Live send test ──────────────────────────────────────────
head "PDF Send (Resend API)"
SESSION=$(curl -si --max-time 10 -X POST "$RAILWAY/api/auth/login" \
  -H "Content-Type: application/json" -d '{"password":"yotcrm2026"}' 2>/dev/null \
  | grep -i "set-cookie" | grep -o "yotcrm_session=[^;]*")

if [ -z "$SESSION" ]; then
  fail "Could not authenticate to Railway"
else
  ok "Authentication OK"

  # Get first listing with PDFs — use python for robust JSON extraction
  LISTING_JSON=$(curl -s -H "Cookie: $SESSION" "$RAILWAY/api/listings" 2>/dev/null | \
    python3 -c "
import sys,json
d=json.load(sys.stdin)
listings=[x for x in d.get('listings',[]) if x.get('pdf_urls') and len(x['pdf_urls'])>0]
if listings:
    l=listings[0]
    print(l['name'])
    print(json.dumps(l['pdf_urls']))
" 2>/dev/null)

  LISTING_NAME=$(echo "$LISTING_JSON" | head -1)
  PDF_JSON=$(echo "$LISTING_JSON" | tail -1)

  if [ -z "$LISTING_NAME" ] || [ -z "$PDF_JSON" ] || [ "$PDF_JSON" = "$LISTING_NAME" ]; then
    fail "No listings with PDFs found in Railway DB"
  else
    ok "Found listing with PDFs: $LISTING_NAME"

    SEND=$(curl -s -H "Cookie: $SESSION" -H "Content-Type: application/json" \
      -X POST "$RAILWAY/api/listings/send" \
      --max-time 15 \
      -d "{\"to\":\"wn@denisonyachting.com\",\"subject\":\"[VERIFY] PDF attach test\",\"body\":\"Automated deploy verification.\",\"pdf_urls\":$PDF_JSON}" 2>/dev/null)

    ATTACHED=$(echo "$SEND" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('attachments',0))" 2>/dev/null)
    SKIPPED=$(echo "$SEND"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('skipped',[])))" 2>/dev/null)
    SEND_OK=$(echo "$SEND"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok',False))" 2>/dev/null)

    if [ "$SEND_OK" = "True" ] && [ "${ATTACHED:-0}" -gt 0 ] 2>/dev/null; then
      ok "Send OK — $ATTACHED PDF(s) attached, $SKIPPED skipped"
    elif [ "$SEND_OK" = "True" ]; then
      fail "Send OK but 0 PDFs attached (skipped: $SKIPPED) — check file storage"
    else
      fail "Send failed: $SEND"
    fi
  fi
fi

# ── Summary ────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo "  Passed: $PASS   Failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  🟢 Deploy looks good."
else
  echo "  🔴 Issues found — see failures above."
  echo ""
  echo "  Quick fixes:"
  echo "    Wrong repo → cd yotcrm-deploy && git remote set-url origin https://github.com/Yachtslinger/yotcrm.git"
  echo "    Not pushed → cd yotcrm-deploy && git push origin main"
  echo "    DB not synced → cd yotcrm-deploy && node scripts/syncToRailway.js"
fi
echo "────────────────────────────────────────"
echo ""
