import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { encryptOptions, inspect, protectPdf, unlockPdf } from "../../../tools/pdf-passwort/password.js";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";

const open = (bytes) => mupdf.Document.openDocument(bytes, "application/pdf");

describe("pdf-passwort", () => {
  it("schützt mit AES-256 und Benutzer-Passwort", () => {
    const { bytes } = protectPdf(mupdf, makeTextPdf(mupdf, 2), "geheim");
    const doc = open(bytes);
    expect(doc.needsPassword()).toBe(true);
    expect(doc.getMetaData("encryption")).toMatch(/AES/);
    expect(doc.authenticatePassword("falsch")).toBe(0);
    expect(doc.authenticatePassword("geheim")).toBeGreaterThan(0);
  });
  it("setzt ein eigenes Besitzer-Passwort", () => {
    const { bytes } = protectPdf(mupdf, makeTextPdf(mupdf, 1), "lesen", "chef");
    expect(open(bytes).authenticatePassword("chef") & 4).toBe(4);
    expect(open(bytes).authenticatePassword("lesen") & 4).toBe(0);
  });
  it("entfernt den Schutz mit dem richtigen Passwort", () => {
    const locked = protectPdf(mupdf, makeTextPdf(mupdf, 2), "geheim").bytes;
    expect(() => unlockPdf(mupdf, locked, "falsch")).toThrow(/stimmt nicht/);
    expect(() => unlockPdf(mupdf, locked)).toThrow(/braucht ein Passwort/);
    const { bytes } = unlockPdf(mupdf, locked, "geheim");
    expect(inspect(mupdf, bytes)).toMatchObject({ encrypted: false, needsPassword: false });
    expect(pageTexts(mupdf, bytes)).toEqual(["Seite 1", "Seite 2"]);
  });
  it("funktioniert mit Umlauten im Passwort", () => {
    const { bytes } = protectPdf(mupdf, makeTextPdf(mupdf, 1), "Größe€");
    expect(pageTexts(mupdf, unlockPdf(mupdf, bytes, "Größe€").bytes)).toEqual(["Seite 1"]);
  });
  it("lehnt ungeeignete Eingaben ab", () => {
    expect(() => encryptOptions("")).toThrow(/Passwort eingeben/);
    expect(() => encryptOptions("a,b")).toThrow(/Komma/);
    expect(() => unlockPdf(mupdf, makeTextPdf(mupdf, 1), "x")).toThrow(/nicht verschlüsselt/);
    const locked = protectPdf(mupdf, makeTextPdf(mupdf, 1), "x").bytes;
    expect(() => protectPdf(mupdf, locked, "y")).toThrow(/schon geschützt/);
  });
});
