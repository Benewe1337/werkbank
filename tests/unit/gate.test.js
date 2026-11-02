import { describe, expect, it } from "vitest";
import { COOKIE, gate, safeEqual, safeNext, token } from "../../src/auth/gate.js";

const env = { password: "werkbank", secret: "test-secret", delay: async () => {} };
const req = (path, init = {}) => new Request(`https://werkbank.test${path}`, init);
const login = (password, next = "/tools/qr-code/") =>
  req("/login", { method: "POST", body: new URLSearchParams({ password, next }) });

describe("Passwortschutz", () => {
  it("leitet ohne Cookie auf die Login-Seite um und merkt sich das Ziel", async () => {
    const res = await gate(req("/tools/qr-code/?x=1"), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login/?next=%2Ftools%2Fqr-code%2F%3Fx%3D1");
  });

  it("setzt bei richtigem Passwort ein sicheres Cookie und leitet zurück", async () => {
    const res = await gate(login("werkbank"), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/tools/qr-code/");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain(`${COOKIE}=${await token("werkbank", "test-secret")}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("lehnt falsche Passwörter ab, ohne Cookie", async () => {
    const res = await gate(login("falsch"), env);
    expect(res.headers.get("location")).toBe("/login/?fehler=1&next=%2Ftools%2Fqr-code%2F");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("lässt mit gültigem Cookie durch", async () => {
    const t = await token("werkbank", "test-secret");
    const res = await gate(req("/", { headers: { cookie: `a=b; ${COOKIE}=${t}` } }), env);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("verwirft Cookies eines alten Passworts", async () => {
    const old = await token("altes-passwort", "test-secret");
    const res = await gate(req("/", { headers: { cookie: `${COOKIE}=${old}` } }), env);
    expect(res.status).toBe(303);
  });

  it("verhindert offene Weiterleitungen", async () => {
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/tools/ocr/?a=1")).toBe("/tools/ocr/?a=1");
    const res = await gate(login("werkbank", "https://evil.example"), env);
    expect(res.headers.get("location")).toBe("/");
  });

  it("Abmelden löscht das Cookie", async () => {
    const res = await gate(req("/logout"), env);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(res.headers.get("location")).toBe("/login/");
  });

  it("verweigert den Dienst, wenn Passwort oder Secret fehlen", async () => {
    expect((await gate(req("/"), {})).status).toBe(500);
  });

  it("vergleicht in konstanter Zeit korrekt", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
