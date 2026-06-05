# Comms Capture — Monitoring & Alerts

How YotBot's email capture pipeline is monitored, and the one-time setup
required to make outage alerts fully reliable.

## The pipeline (for context)

```
client email ──▶ theyotbot@gmail.com
                     │  (IMAP poll, every 60s)
                     ▼
        yotbot_gmail_poller.py  (on the Mac, via launchd)
                     │  saves .eml to ~/YotCRM/inbox/comms_raw/
                     ▼
        comms-forwarder.sh  ──▶  POST /api/comms/ingest  (Railway)
                                      │
                                      ▼
                          classify → store → (lead?) → extract
```

The failure mode that bit us: a transient network drop wedged the poller for
three weeks with **no signal**. Two independent alert layers now guard against
a silent repeat.

## Layer 1 — on-Mac dead-man's switch (poller)

`yotbot_gmail_poller.py` tracks time-since-last-successful-poll. If capture
fails for >10 minutes it emails an alert via Gmail SMTP (STARTTLS, port 587 —
465 is blocked on the office network) and retries until the email actually
sends. Recipient: `YOTBOT_ALERT_EMAIL` env (default `will@denisonyachting.com`).

Limitation: if the Mac loses network entirely, this email can't get out until
connectivity returns. That's what Layer 2 is for.

## Layer 2 — off-Mac watchdog (Railway)  ← the reliable one

- The poller pings **`POST /api/comms/heartbeat`** every successful cycle
  ("I'm alive and reaching Gmail"). Stored in the `comms_monitor` table.
- A **Railway Cron** hits **`/api/comms/watchdog`** every ~10 min. If the last
  heartbeat is older than `COMMS_WATCHDOG_STALE_MIN` (default 20), it emails an
  alert through the HTTPS email provider (Postmark/SendGrid — works on Railway,
  where SMTP is blocked).

Because the alert fires from Railway, it works **even when the Mac is fully
offline** — heartbeat silence is the signal. It watches the heartbeat, not the
inbox, so a quiet day is never mistaken for an outage.

## One-time Railway setup (required)

1. **Cron service** — Dashboard → New Service → Cron
   - Schedule: `*/10 * * * *`
   - Command:
     ```
     curl -s -X POST https://yotcrm-production.up.railway.app/api/comms/watchdog \
       -H "Authorization: Bearer $CRON_SECRET"
     ```

2. **`CRON_SECRET`** — set in the app service **and** the cron service env.
   Currently unset, which leaves `/api/comms/watchdog` and the existing
   `/api/connect/cron` callable by anyone. Setting it locks both.

3. **Email provider** — set `POSTMARK_SERVER_TOKEN` (and `POSTMARK_FROM`) or
   `SENDGRID_API_KEY` (and `SENDGRID_FROM`). Without one, the watchdog logs the
   alert instead of sending it (MockProvider fallback).

## Env vars

| Var | Where | Default | Purpose |
|-----|-------|---------|---------|
| `COMMS_INGEST_SECRET` | app + poller | `yotcrm-comms-ingest-2026` | auth for ingest/heartbeat |
| `CRON_SECRET` | app + cron | (unset) | auth for watchdog + connect cron |
| `COMMS_WATCHDOG_STALE_MIN` | app | `20` | minutes of silence before alert |
| `COMMS_ALERT_EMAIL` | app | `will@denisonyachting.com` | watchdog alert recipient |
| `POSTMARK_SERVER_TOKEN` / `SENDGRID_API_KEY` | app | (unset) | HTTPS email send |
| `YOTBOT_ALERT_EMAIL` | poller plist | `will@denisonyachting.com` | Layer-1 alert recipient |

## Verify

```bash
# heartbeat endpoint (should return {"ok":true})
curl -s -X POST https://yotcrm-production.up.railway.app/api/comms/heartbeat \
  -H "x-ingest-secret: yotcrm-comms-ingest-2026" -H "Content-Type: application/json" \
  --data '{"detail":"manual-verify"}'

# watchdog status (read-only; add -H "Authorization: Bearer $CRON_SECRET" once set)
curl -s https://yotcrm-production.up.railway.app/api/comms/watchdog | python3 -m json.tool
# healthy looks like: ageMin 0, detail "ok", alerted false
```

## Files

- `Scripts/yotbot_gmail_poller.py` (Mac) — poller, Layer-1 alert, heartbeat ping
- `src/lib/comms/monitor.ts` — `comms_monitor` store (heartbeat + outage flag)
- `src/app/api/comms/heartbeat/route.ts` — poller check-in
- `src/app/api/comms/watchdog/route.ts` — staleness check + alert (Railway cron)
