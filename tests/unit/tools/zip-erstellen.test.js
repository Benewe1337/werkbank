import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip, cleanPath, uniquePaths, zipFileName } from "../../../tools/_codes/zip.js";

const file = (content, lastModified = Date.UTC(2024, 4, 1)) => Object.assign(new Blob([content]), { lastModified });

describe("zip-erstellen: Pfade", () => {
  it("bereinigt Pfade", () => {
    expect(cleanPath("/etc/../a\\b/./c.txt")).toBe("etc/a/b/c.txt");
    expect(cleanPath("../../x")).toBe("x");
    expect(cleanPath("ordner/ unter /d.txt")).toBe("ordner/unter/d.txt");
  });
  it("macht doppelte Pfade eindeutig", () => {
    expect(uniquePaths(["a.txt", "A.txt", "a.txt", "ordner/a.txt", "ohne", "ohne", ".hidden", ".hidden"])).toEqual([
      "a.txt",
      "A (2).txt",
      "a (3).txt",
      "ordner/a.txt",
      "ohne",
      "ohne (2)",
      ".hidden",
      ".hidden (2)",
    ]);
  });
  it("baut einen gültigen Dateinamen", () => {
    expect(zipFileName("Fotos: Urlaub/2024")).toBe("Fotos_ Urlaub_2024.zip");
    expect(zipFileName("x.ZIP")).toBe("x.zip");
    expect(zipFileName("  ")).toBe("archiv.zip");
  });
});

describe("zip-erstellen: Archiv", () => {
  it("packt Ordner mit Pfaden und liest sie zurück", async () => {
    const big = "Werkbank ".repeat(20_000);
    const progress = [];
    const blob = await buildZip(
      [
        { path: "projekt/readme.txt", file: file("Hallo") },
        { path: "projekt/sub/daten.txt", file: file(big) },
        { path: "bild.png", file: file(new Uint8Array([137, 80, 78, 71])) },
      ],
      { level: 9, onProgress: (d, t) => progress.push([d, t]) },
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeLessThan(big.length / 10);
    const out = unzipSync(bytes);
    expect(Object.keys(out).sort()).toEqual(["bild.png", "projekt/readme.txt", "projekt/sub/daten.txt"]);
    expect(strFromU8(out["projekt/sub/daten.txt"])).toBe(big);
    expect([...out["bild.png"]]).toEqual([137, 80, 78, 71]);
    expect(progress.at(-1)).toEqual([big.length + 9, big.length + 9]);
  });
  it("Stufe 0 speichert nur", async () => {
    const big = "a".repeat(50_000);
    const blob = await buildZip([{ path: "a.txt", file: file(big) }], { level: 0 });
    expect(blob.size).toBeGreaterThan(50_000);
    expect(strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))["a.txt"])).toBe(big);
  });
  it("leere Datei und leere Liste", async () => {
    const blob = await buildZip([{ path: "leer.txt", file: file("") }]);
    expect(unzipSync(new Uint8Array(await blob.arrayBuffer()))["leer.txt"].length).toBe(0);
    await expect(buildZip([])).rejects.toThrow(/Keine Dateien/);
  });
});
