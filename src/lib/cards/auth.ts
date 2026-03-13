import crypto from "crypto";
import { cookies } from "next/headers";

const AUTH_SECRET = process.env.YOTCRM_PASSWORD || "yotcrm2026";
const COOKIE_NAME = "yotcrm_session";

export async function isCardOwner(): Promise<boolean> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return false;

    const [expiresStr, sig] = token.split(".");
    if (!expiresStr || !sig) return false;

    const expires = Number(expiresStr);
    if (isNaN(expires) || Date.now() > expires) return false;

    const expected = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(expiresStr)
      .digest("hex")
      .slice(0, 16);

    return sig === expected;
  } catch {
    return false;
  }
}
