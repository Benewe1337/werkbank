import { describe, expect, it } from "vitest";
import { jsonToRowArray, isJson, cellToString, cleanSql, createTableSql, explainSqlError, formatCell, isSupported, tableName, toCsv } from "../../../tools/tabellen-sql/sql.js";

describe("tabellen-sql", () => {
  it("leitet Tabellennamen aus Dateinamen ab", () => {
    expect(tableName("Umsätze 2024 (final).csv")).toBe("umsaetze_2024_final");
    expect(tableName("2024.parquet")).toBe("t_2024");
    expect(tableName("Café.json")).toBe("cafe");
    expect(tableName("###.csv")).toBe("tabelle");
    expect(tableName("daten.csv", ["daten", "daten_2"])).toBe("daten_3");
  });
  it("baut Lade-SQL und schützt Namen", () => {
    expect(createTableSql("a", "o'neil.csv")).toBe(`CREATE OR REPLACE TABLE "a" AS SELECT * FROM read_csv_auto('o''neil.csv', header = true, sample_size = -1)`);
    expect(createTableSql('x"y', "d.parquet")).toContain(`TABLE "x""y" AS SELECT * FROM read_parquet('d.parquet')`);
    expect(() => createTableSql("x", "tabelle.xlsx")).toThrow(/nicht per SQL/);
    expect(isJson("a.ndjson")).toBe(true);
    expect(isSupported("A.CSV")).toBe(true);
    expect(isSupported("a.xlsx")).toBe(false);
  });
  it("bringt JSON und JSON Lines in Zeilenform", () => {
    expect(JSON.parse(jsonToRowArray('[{"a":1},{"a":2}]', "x.json"))).toEqual([{ a: 1 }, { a: 2 }]);
    expect(JSON.parse(jsonToRowArray('{"daten":[{"a":1}]}', "x.json"))).toEqual([{ a: 1 }]);
    expect(JSON.parse(jsonToRowArray('{"a":1,"b":2}', "x.json"))).toEqual([{ a: 1, b: 2 }]);
    expect(JSON.parse(jsonToRowArray('{"a":1}\n\n{"a":2}\n', "x.jsonl"))).toEqual([{ a: 1 }, { a: 2 }]);
    expect(JSON.parse(jsonToRowArray("[1,2]", "x.json"))).toEqual([{ wert: 1 }, { wert: 2 }]);
    expect(() => jsonToRowArray('{"a":1}\n{kaputt', "x.jsonl")).toThrow("x.jsonl: Zeile 2 ist kein gültiges JSON.");
    expect(() => jsonToRowArray("[]", "x.json")).toThrow(/Keine Zeilen/);
  });
  it("wandelt Werte in Text", () => {
    expect(cellToString(null)).toBe("");
    expect(cellToString(12345678901234567890n)).toBe("12345678901234567890");
    expect(cellToString({ a: 1n })).toBe('{"a":"1"}');
    expect(formatCell(Date.UTC(2024, 0, 31), "Date32<DAY>")).toBe("2024-01-31");
    expect(formatCell(Date.UTC(2024, 0, 31, 12, 30), "Timestamp<MICROSECOND>")).toBe("2024-01-31 12:30:00");
  });
  it("schreibt CSV nach RFC 4180", () => {
    expect(toCsv(["a", "b"], [["1", 'x "y", z'], ["", "zeile\nzwei"]])).toBe('a,b\r\n1,"x ""y"", z"\r\n,"zeile\nzwei"');
  });
  it("bereinigt Abfragen und erklärt Fehler", () => {
    expect(cleanSql("SELECT 1;;  ")).toBe("SELECT 1");
    expect(() => cleanSql("  ")).toThrow(/SQL-Abfrage/);
    expect(explainSqlError("Catalog Error: Table with name foo does not exist!\nDid you mean")).toMatch(/^Diese Tabelle gibt es nicht/);
  });
});
