import { describe, expect, it } from "vitest";
import { buildGifCommands, MAX_DURATION, validateGifOptions } from "../../../tools/video-zu-gif/args.js";

const ok = { start: 1, duration: 3, fps: 12, width: 480 };

describe("video-zu-gif: Optionen", () => {
  it("übernimmt gültige Werte und setzt Standards", () => {
    expect(validateGifOptions(ok)).toEqual(ok);
    expect(validateGifOptions({ ...ok, start: null, duration: null })).toEqual({ ...ok, start: 0, duration: 5 });
  });

  it("kürzt die Dauer auf das Videoende", () => {
    expect(validateGifOptions({ ...ok, start: 8 }, 10).duration).toBe(2);
  });

  it("lehnt unsinnige Werte ab", () => {
    expect(() => validateGifOptions({ ...ok, duration: MAX_DURATION + 1 })).toThrow("Höchstens");
    expect(() => validateGifOptions({ ...ok, duration: 0 })).toThrow("größer als 0");
    expect(() => validateGifOptions({ ...ok, start: -1 })).toThrow("negativ");
    expect(() => validateGifOptions({ ...ok, start: 12 }, 10)).toThrow("hinter dem Ende");
    expect(() => validateGifOptions({ ...ok, fps: 60 })).toThrow("Bildrate");
    expect(() => validateGifOptions({ ...ok, width: 1234 })).toThrow("Breite");
  });
});

describe("video-zu-gif: zwei Durchgänge", () => {
  it("palettegen, dann paletteuse mit derselben Auswahl", () => {
    const { commands, output, temp } = buildGifCommands({ inputName: "input.mp4", ...ok });
    expect(commands).toHaveLength(2);
    const [first, second] = commands;
    const input = ["-ss", "1", "-t", "3", "-i", "/in/input.mp4"];
    expect(first.slice(0, 6)).toEqual(input);
    expect(second.slice(0, 6)).toEqual(input);
    expect(first[first.indexOf("-vf") + 1]).toBe("fps=12,scale='min(480,iw)':-2:flags=lanczos,palettegen=stats_mode=diff");
    expect(first.at(-1)).toBe("palette.png");
    expect(second).toEqual(expect.arrayContaining(["-i", "palette.png", "-loop", "0"]));
    expect(second[second.indexOf("-lavfi") + 1]).toContain("[x][1:v]paletteuse");
    expect(output).toBe("output.gif");
    expect(temp).toEqual(["palette.png"]);
  });

  it("ohne Start kein -ss", () => {
    const { commands } = buildGifCommands({ inputName: "input", ...ok, start: 0 });
    expect(commands[0][0]).toBe("-t");
  });
});
