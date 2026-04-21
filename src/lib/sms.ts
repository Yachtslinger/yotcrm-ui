// Twilio REST sender — no SDK, no extra dependencies

export type SMSResult =
  | { ok: true; sid: string }
  | { ok: false; error: string };

export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json() as { sid?: string; message?: string; code?: number };

    if (!res.ok) {
      return { ok: false, error: data.message || `Twilio error ${res.status}` };
    }

    return { ok: true, sid: data.sid! };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
