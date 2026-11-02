import { describe, expect, it } from "vitest";
import { convert, detectDelimiter, detectFormat, flatten, locateJsonError, parse, serialize, typedValue } from "../../../tools/daten-umwandeln/convert.js";
import { CSV_SEMICOLON, SAMPLE_ROWS } from "../../fixtures/daten.js";

describe("daten-umwandeln: Erkennung", () => {
  it("erkennt Formate am Inhalt und am Dateinamen", () => {
    expect(detectFormat('  {"a": 1}')).toBe("json");
    expect(detectFormat("[1,2]")).toBe("json");
    expect(detectFormat('<?xml version="1.0"?><a/>')).toBe("xml");
    expect(detectFormat("a: 1\nb:\n  - x")).toBe("yaml");
    expect(detectFormat(CSV_SEMICOLON)).toBe("csv");
    expect(detectFormat("a,b\n1,2\n")).toBe("csv");
    expect(detectFormat("irgendwas", "daten.yml")).toBe("yaml");
    expect(detectFormat("")).toBeNull();
  });
  it("erkennt Trennzeichen, auch ; aus deutschem Excel", () => {
    expect(detectDelimiter(CSV_SEMICOLON)).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter('a;b\n"x;y";2')).toBe(";");
  });
  it("lässt führende Nullen als Text", () => {
    expect(typedValue("01067")).toBe("01067");
    expect(typedValue("42")).toBe(42);
    expect(typedValue("-1.5e3")).toBe(-1500);
    expect(typedValue("true")).toBe(true);
    expect(typedValue("12345678901234567890")).toBe("12345678901234567890");
  });
});

describe("daten-umwandeln: Umwandlung", () => {
  it("CSV mit Semikolon -> JSON", () => {
    expect(JSON.parse(convert(CSV_SEMICOLON, { to: "json" }).output)).toEqual(SAMPLE_ROWS);
  });
  it("JSON -> CSV -> JSON bleibt gleich", () => {
    const csv = serialize(SAMPLE_ROWS, "csv", { delimiter: ";" });
    expect(csv.split("\r\n")[0]).toBe("name;ort;plz;alter");
    expect(parse(csv, "csv")).toEqual(SAMPLE_ROWS);
  });
  it("JSON <-> YAML", () => {
    const data = { name: "Werkbank", tools: ["qr", "zip"], nested: { a: 1, b: null } };
    const yml = serialize(data, "yaml");
    expect(yml).toContain("tools:\n  - qr");
    expect(parse(yml, "yaml")).toEqual(data);
    expect(serialize(data, "yaml", { pretty: false })).toBe("{name: Werkbank, tools: [qr, zip], nested: {a: 1, b: null}}");
  });
  it("JSON <-> XML mit Attributen", () => {
    const xml = '<?xml version="1.0"?><katalog><buch id="1"><titel>Faust</titel></buch><buch id="2"><titel>Effi</titel></buch></katalog>';
    const value = parse(xml, "xml");
    expect(value).toEqual({ katalog: { buch: [{ "@id": 1, titel: "Faust" }, { "@id": 2, titel: "Effi" }] } });
    const back = serialize(value, "xml", { pretty: false });
    expect(back).toBe('<?xml version="1.0" encoding="UTF-8"?><katalog><buch id="1"><titel>Faust</titel></buch><buch id="2"><titel>Effi</titel></buch></katalog>');
    expect(serialize([1, 2], "xml", { pretty: false })).toContain("<root><item>1</item><item>2</item></root>");
  });
  it("XML-Liste -> CSV", () => {
    const xml = "<liste><p><n>a</n><x>1</x></p><p><n>b</n><x>2</x></p></liste>";
    expect(convert(xml, { to: "csv" }).output).toBe("n,x\r\na,1\r\nb,2");
  });
  it("flacht verschachtelte Objekte für CSV ab", () => {
    expect(flatten({ a: { b: 1, c: [1, 2] }, d: null })).toEqual({ "a.b": 1, "a.c": "[1,2]", d: "" });
  });
  it("formatiert und minimiert JSON", () => {
    expect(convert('{ "a" : [ 1 , 2 ] }', { to: "json", pretty: false }).output).toBe('{"a":[1,2]}');
    expect(convert('{"a":1}', { to: "json" }).output).toBe('{\n  "a": 1\n}');
  });
  it("escapet Sonderzeichen in XML", () => {
    const xml = serialize({ a: 'x < y & "z"' }, "xml", { pretty: false });
    expect(xml).toContain("<a>x &lt; y &amp; ");
    expect(parse(xml, "xml")).toEqual({ a: 'x < y & "z"' });
  });
});

describe("daten-umwandeln: Fehler mit Zeile/Spalte", () => {
  it("JSON", () => {
    expect(locateJsonError('{"a": 1,\n  "b": }')).toEqual({ message: "Unerwartetes Zeichen", line: 2, column: 8 });
    expect(() => parse('{"a": 1,\n  "b": }', "json")).toThrow(/Zeile 2, Spalte 8/);
    expect(locateJsonError("[1, 2]")).toBeNull();
    expect(locateJsonError('{"a": "x}')).toMatchObject({ message: "Zeichenkette nicht geschlossen" });
  });
  it("YAML", () => {
    expect(() => parse("a: [1,\nb", "yaml")).toThrow(/Ungültiges YAML.*Zeile \d+, Spalte \d+/);
  });
  it("XML", () => {
    expect(() => parse("<a>\n<b>1</a>", "xml")).toThrow(/Ungültiges XML.*Zeile 2/);
  });
  it("CSV", () => {
    expect(() => parse('a,b\n1,"2\n', "csv")).toThrow(/Anführungszeichen/);
  });
  it("leere Eingabe", () => {
    expect(() => convert("   ", { to: "json" })).toThrow(/leer/);
  });
});
