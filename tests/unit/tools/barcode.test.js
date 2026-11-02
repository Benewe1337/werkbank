import { describe, expect, it } from "vitest";
import { explainWriterError, gtinCheckDigit, validate } from "../../../tools/barcode/validate.js";

describe("barcode", () => {
  it("berechnet GTIN-Prüfziffern", () => {
    expect(gtinCheckDigit("400638133393")).toBe("1");
    expect(gtinCheckDigit("9638507")).toBe("4");
    expect(gtinCheckDigit("03600029145")).toBe("2");
    expect(gtinCheckDigit("000000000000")).toBe("0");
  });
  it("ergänzt oder prüft die Prüfziffer", () => {
    expect(validate("EAN13", "400638133393")).toEqual({ value: "4006381333931", note: "Prüfziffer 1 ergänzt." });
    expect(validate("EAN13", "4006381-333931").value).toBe("4006381333931");
    expect(() => validate("EAN13", "4006381333932")).toThrow("Prüfziffer falsch: Am Ende muss 1 stehen, nicht 2.");
    expect(() => validate("EAN8", "123")).toThrow(/7 Ziffern/);
    expect(() => validate("UPCA", "03600029145x")).toThrow(/nur aus Ziffern/);
    expect(validate("UPCA", "036000291452").note).toBe("Prüfziffer stimmt.");
  });
  it("prüft Code 39, ITF und Code 128", () => {
    expect(validate("Code39", "abc-1")).toMatchObject({ value: "ABC-1" });
    expect(() => validate("Code39", "a_b")).toThrow(/Code 39/);
    expect(validate("ITF", "123")).toMatchObject({ value: "0123" });
    expect(() => validate("Code128", "Smiley 🙂")).toThrow(/🙂/);
    expect(validate("DataMatrix", "beliebig 🙂").value).toBe("beliebig 🙂");
    expect(() => validate("QRCode", "x")).toThrow(/Unbekanntes Format/);
    expect(() => validate("EAN13", "  ")).toThrow(/Inhalt/);
  });
  it("übersetzt zint-Fehler", () => {
    expect(explainWriterError("Error 275: Invalid check digit '2', expecting '1'")).toBe("Die Prüfziffer stimmt nicht.");
    expect(explainWriterError("Error 999: something odd")).toBe("Der Barcode ließ sich nicht erzeugen (something odd).");
  });
});
