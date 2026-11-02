// Passwortschutz für die ganze Seite (läuft als Vercel Routing Middleware, siehe /middleware.js).
// Ohne gültiges Cookie: Weiterleitung auf /login/. POST /login prüft das Passwort und setzt das Cookie.
import { next } from "@vercel/functions";
import { safeNext } from "./gate-shared.js";

export { safeNext };

export const COOKIE = "werkbank_auth";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage
const FAIL_DELAY_MS = 600; // bremst Durchprobieren

const encoder = new TextEncoder();

/** Cookie-Wert: HMAC-SHA256(secret, password). Ändert sich das Passwort, verfallen alle Cookies. */
export async function token(password, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`werkbank:${password}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vergleich in konstanter Zeit, damit die Antwortzeit nichts über den Wert verrät. */
export function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const redirect = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...headers } });

/**
 * @param {Request} request
 * @param {{password?: string, secret?: string, delay?: (ms: number) => Promise<void>}} env
 */
export async function gate(request, { password, secret, delay = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!password || !secret) return new Response("Passwortschutz ist nicht konfiguriert.", { status: 500 });
  const url = new URL(request.url);
  const expected = await token(password, secret);

  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const target = safeNext(form?.get("next"));
    if (!safeEqual(form?.get("password") ?? "", password)) {
      await delay(FAIL_DELAY_MS);
      return redirect(`/login/?fehler=1&next=${encodeURIComponent(target)}`);
    }
    const cookie = `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    return redirect(target, { "Set-Cookie": cookie });
  }

  if (url.pathname === "/logout") {
    return redirect("/login/", { "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

  if (safeEqual(readCookie(request, COOKIE) ?? "", expected)) return next();
  return redirect(`/login/?next=${encodeURIComponent(url.pathname + url.search)}`);
}
