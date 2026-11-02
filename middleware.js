// Vercel Routing Middleware: schützt alle Seiten mit einem Passwort (WERKBANK_PASSWORD).
// Login-Seite und deren Assets bleiben erreichbar, alles andere braucht das Cookie.
import { gate } from "./src/auth/gate.js";

export const config = {
  matcher: ["/((?!assets/|favicon\\.svg$|login/).*)"],
};

export default function middleware(request) {
  return gate(request, { password: process.env.WERKBANK_PASSWORD, secret: process.env.WERKBANK_SECRET });
}
