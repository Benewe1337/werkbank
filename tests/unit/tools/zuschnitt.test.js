import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { cropHandout } from "../../../tools/zuschnitt/crop.js";
import { makeHandoutPdf } from "../../fixtures/pdf.js";

describe("zuschnitt", () => {
  it("zerlegt Handouts und überspringt leere Rahmen", () => {
    const logs = [];
    const r = cropHandout(mupdf, makeHandoutPdf(mupdf, ["full", "half", "none"]), (l) => logs.push(l));
    expect([r.pagesIn, r.pagesOut]).toEqual([3, 3]);
    expect(logs.map((l) => l.level)).toEqual(["info", "warn"]);
  });
});
