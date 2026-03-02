#!/bin/bash
# ═══════════════════════════════════════════
# YotCRM Email Pipeline Setup
# Run once to set up the Mac → Railway email forwarding
# ═══════════════════════════════════════════

echo "🚢 YotCRM Email Pipeline Setup"
echo "================================"

# 1. Create directories
echo "📁 Creating directories..."
mkdir -p ~/YotCRM/inbox/raw_emails
mkdir -p ~/YotCRM/inbox/processed_emails
mkdir -p ~/YotCRM/inbox/failed_emails
mkdir -p ~/YotCRM/logs

# 2. Make forwarder executable
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$SCRIPT_DIR/email-forwarder.sh"
echo "✅ Forwarder script ready"

# 3. Install LaunchAgent
PLIST_SRC="$SCRIPT_DIR/com.yotcrm.email-forwarder.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.yotcrm.email-forwarder.plist"

# Unload existing if running
launchctl unload "$PLIST_DST" 2>/dev/null

# Copy and load
cp "$PLIST_SRC" "$PLIST_DST"
launchctl load "$PLIST_DST"
echo "✅ LaunchAgent installed (runs every 60s)"

# 4. Compile AppleScript
echo "📧 Compiling AppleScript for Mail rules..."
APPLESCRIPT_SRC="$SCRIPT_DIR/SaveLeadEmail.applescript"
APPLESCRIPT_DST="$HOME/Library/Application Scripts/com.apple.mail/SaveLeadEmail.scpt"
mkdir -p "$HOME/Library/Application Scripts/com.apple.mail"
osacompile -o "$APPLESCRIPT_DST" "$APPLESCRIPT_SRC" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "✅ AppleScript compiled to Mail scripts folder"
else
  echo "⚠️  Could not auto-compile. You may need to manually:"
  echo "   1. Open Script Editor"
  echo "   2. Open $APPLESCRIPT_SRC"
  echo "   3. Export as .scpt to ~/Library/Application Scripts/com.apple.mail/"
fi

# 5. Test the forwarder
echo ""
echo "🧪 Testing API endpoint..."
TEST_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: text/plain" \
  --data "test" \
  "https://yotcrm-production.up.railway.app/api/emails")

if [ "$TEST_RESULT" = "400" ]; then
  echo "✅ API endpoint reachable (returned 400 for empty test — correct!)"
elif [ "$TEST_RESULT" = "200" ] || [ "$TEST_RESULT" = "422" ]; then
  echo "✅ API endpoint reachable"
else
  echo "❌ API returned HTTP $TEST_RESULT — check Railway deployment"
fi

echo ""
echo "================================"
echo "🎉 Setup complete!"
echo ""
echo "NEXT STEPS — Set up Mail rules:"
echo "1. Open Mail.app → Settings → Rules"
echo "2. Create a new rule:"
echo "   IF any of these conditions are met:"
echo "     • From contains 'boatwizard'"
echo "     • From contains 'jamesedition'"
echo "     • From contains 'rightboat'"
echo "     • From contains 'yatco'"
echo "     • Subject contains 'New Interested Buyer'"
echo "     • Subject contains 'Website Chat Lead'"
echo "     • Subject contains 'BoatTrader'"
echo "     • Subject contains 'boat show'"
echo "   THEN:"
echo "     • Run AppleScript: SaveLeadEmail"
echo ""
echo "Logs: ~/YotCRM/logs/"
echo "Inbox: ~/YotCRM/inbox/raw_emails/"
echo "================================"
