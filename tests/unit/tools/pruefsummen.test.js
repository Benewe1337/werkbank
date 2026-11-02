import { describe, expect, it } from "vitest";
import { algorithmsForLength, ALGORITHMS, findMatches, hashBlob, normalizeExpected } from "../../../tools/pruefsummen/hashing.js";

const ALL = ALGORITHMS.map((a) => a.id);

// Bekannte Testvektoren für "abc" (NIST/RFC bzw. Referenzimplementierungen).
const ABC = {
  md5: "900150983cd24fb0d6963f7d28e17f72",
  sha1: "a9993e364706816aba3e25717850c26c9cd0d89d",
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  sha512: "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  "sha3-256": "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
  blake3: "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
  crc32: "352441c2",
};

describe("pruefsummen", () => {
  it("liefert die bekannten Testvektoren für „abc“", async () => {
    expect(await hashBlob(new Blob(["abc"]), ALL)).toEqual(ABC);
  });
  it("leere Datei", async () => {
    const r = await hashBlob(new Blob([]), ["sha256", "md5"]);
    expect(r).toEqual({ sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", md5: "d41d8cd98f00b204e9800998ecf8427e" });
  });
  it("Stückweise gleich wie am Stück, mit Fortschritt", async () => {
    const data = new Uint8Array(100_003).map((_, i) => (i * 31) & 0xff);
    const progress = [];
    const chunked = await hashBlob(new Blob([data]), ALL, (d, t) => progress.push([d, t]), 7_919);
    const whole = await hashBlob(new Blob([data]), ALL);
    expect(chunked).toEqual(whole);
    expect(progress.at(-1)).toEqual([100_003, 100_003]);
    expect(progress.length).toBe(Math.ceil(100_003 / 7_919));
  });
  it("braucht mindestens ein Verfahren", async () => {
    await expect(hashBlob(new Blob(["x"]), [])).rejects.toThrow(/mindestens/);
  });
  it("vereinheitlicht eingefügte Werte", () => {
    expect(normalizeExpected("  BA78 16BF:8F01  ")).toBe("ba7816bf8f01");
    expect(normalizeExpected("sha256:ABCDEF")).toBe("abcdef");
    expect(normalizeExpected("ba7816bf  datei.iso")).toBe("ba7816bf");
  });
  it("findet Übereinstimmungen", () => {
    const files = [{ name: "a.txt", hashes: { sha256: ABC.sha256, md5: ABC.md5 } }];
    expect(findMatches(ABC.sha256.toUpperCase(), files)).toEqual([{ file: "a.txt", algorithm: "sha256" }]);
    expect(findMatches("deadbeef", files)).toEqual([]);
    expect(algorithmsForLength(64)).toContain("SHA-256");
  });
});
