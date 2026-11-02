import { Archive } from "libarchive.js/dist/libarchive-node.mjs";
import { describe, expect, it } from "vitest";
import { allZipName, explainArchiveError, toEntries } from "../../../tools/archiv-entpacken/entries.js";
import { makeEncryptedZip, makeTarGz, makeZip } from "../../fixtures/daten.js";

const open = async (bytes, name) => Archive.open(new File([bytes], name));

describe("archiv-entpacken", () => {
  it("liest TAR.GZ und ZIP mit vollen Pfaden", async () => {
    const reader = await open(makeTarGz({ "b/2.txt": "zwei", "a.txt": "eins", "b/10.txt": "zehn" }), "x.tar.gz");
    const entries = toEntries(await reader.getFilesArray());
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ["a.txt", 4],
      ["b/2.txt", 4],
      ["b/10.txt", 4],
    ]);
    const file = await reader.extractSingleFile("b/10.txt");
    expect(await file.text()).toBe("zehn");
    const zip = await open(makeZip({ "ordner/datei.txt": "inhalt" }), "x.zip");
    expect(toEntries(await zip.getFilesArray()).map((e) => e.path)).toEqual(["ordner/datei.txt"]);
  });
  it("entschlüsselt ZipCrypto mit dem richtigen Passwort", async () => {
    const bytes = makeEncryptedZip({ "geheim.txt": "streng geheim" }, "sesam");
    const reader = await open(bytes, "g.zip");
    expect(await reader.hasEncryptedData()).toBe(true);
    await reader.usePassword("sesam");
    const out = await reader.extractFiles();
    expect(await out["geheim.txt"].text()).toBe("streng geheim");
    const wrong = await open(bytes, "g.zip");
    await wrong.usePassword("falsch");
    await expect(wrong.extractFiles()).rejects.toThrow(/passphrase/i);
  });
  it("übersetzt Fehler und benennt das Gesamt-ZIP", () => {
    expect(explainArchiveError("Incorrect passphrase")).toBe("Das Passwort ist falsch.");
    expect(explainArchiveError("Passphrase required for this entry")).toMatch(/verschlüsselt/);
    expect(explainArchiveError("table index is out of bounds")).toMatch(/kein lesbares Archiv/);
    expect(allZipName("projekt.tar.gz")).toBe("projekt-entpackt.zip");
    expect(allZipName("fotos.7z")).toBe("fotos-entpackt.zip");
    expect(allZipName("README")).toBe("README-entpackt.zip");
  });
});
