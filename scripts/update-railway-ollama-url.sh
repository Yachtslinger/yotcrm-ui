#!/bin/bash
# Updates OLLAMA_URL in Railway whenever bore.pub port changes
# Called by the bore watcher

NEW_URL="$1"
if [ -z "$NEW_URL" ]; then
  echo "Usage: $0 <url>"
  exit 1
fi

RAILWAY_TOKEN=$(python3 -c "import json; d=json.load(open('/Users/willnoftsinger/.railway/config.json')); print(d['user']['token'])")

# Use Railway CLI
cd /Users/willnoftsinger/yotcrm-ui
echo "Updating OLLAMA_URL to $NEW_URL..."

# Try railway CLI first
railway variables set OLLAMA_URL="$NEW_URL" 2>/dev/null && echo "Updated via CLI" && exit 0

echo "CLI failed, URL needs manual update in Railway: $NEW_URL"
echo "$NEW_URL" | pbcopy
echo "URL copied to clipboard"
