/**
 * Input-robustness tests: invalid GeoLocation throws a clear typed error at the
 * public boundary (not an opaque astronomy-engine trace), and a single rule
 * that throws during resolution does NOT abort the whole computeFestivals batch
 * (the never-silently-drop contract).
 */

import { describe, it, expect } from "vitest";
import { dailyPanchanga } from "../src/panchanga.js";
import { computeFestivals } from "../src/festivals.js";
import { lunarEclipses } from "../src/eclipses.js";
import { validateLocation } from "../src/time.js";
import type { FestivalRule, GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };

describe("validateLocation", () => {
  it("accepts a valid location", () => {
    expect(() => validateLocation(NEW_DELHI)).not.toThrow();
  });

  it("rejects NaN / out-of-range latitude & longitude with RangeError", () => {
    expect(() => validateLocation({ ...NEW_DELHI, latitude: NaN })).toThrow(/latitude/);
    expect(() => validateLocation({ ...NEW_DELHI, latitude: 120 })).toThrow(/latitude/);
    expect(() => validateLocation({ ...NEW_DELHI, longitude: 999 })).toThrow(/longitude/);
    expect(() => validateLocation({ ...NEW_DELHI, latitude: NaN })).toThrow(RangeError);
  });

  it("rejects an invalid IANA timeZone with a clear message", () => {
    expect(() => validateLocation({ ...NEW_DELHI, timeZone: "Not/AZone" })).toThrow(/IANA timeZone/);
    expect(() => validateLocation({ ...NEW_DELHI, timeZone: "" })).toThrow(/timeZone/);
  });

  it("guards the public entrypoints (no opaque internal trace)", () => {
    const bad = { ...NEW_DELHI, latitude: NaN };
    expect(() => dailyPanchanga(new Date("2026-01-23"), bad)).toThrow(/latitude/);
    expect(() => computeFestivals(2026, bad)).toThrow(/latitude/);
    expect(() => lunarEclipses(2026, bad)).toThrow(/latitude/);
  });
});

describe("computeFestivals — per-rule isolation", () => {
  it("does not abort the batch when one rule throws; emits a dated-empty result + diagnostic", () => {
    // A malformed rule whose resolver throws (absoluteTithi rejects tithi 99).
    const bomb: FestivalRule = {
      id: "bomb",
      displayName: "Bomb",
      month: { purnimanta: "Chaitra" },
      category: "lunar-tithi",
      observance: { kind: "tithi-pervades", paksha: "shukla", tithi: 99, window: "sunrise", precedence: "udaya" },
    };
    const good: FestivalRule = {
      id: "good",
      displayName: "Good",
      month: { purnimanta: "Chaitra" },
      category: "lunar-tithi",
      observance: { kind: "tithi-pervades", paksha: "shukla", tithi: 9, window: "sunrise", precedence: "udaya" },
    };
    const { results } = computeFestivals(2026, NEW_DELHI, { rules: [bomb, good] });

    const bombRes = results.find((r) => r.id === "bomb")!;
    const goodRes = results.find((r) => r.id === "good")!;
    // the throwing rule is isolated: empty date + an explanatory diagnostic
    expect(bombRes.date).toBe("");
    expect(bombRes.diagnostics.join(" ")).toMatch(/threw during resolution/);
    // the healthy rule still resolves
    expect(goodRes.date).not.toBe("");
  });
});
