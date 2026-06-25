/**
 * Tests for src/eclipses.ts — grahaṇa enumeration, local visibility, and sūtak.
 *
 * 2026 reference (astronomically fixed): two lunar eclipses (3 Mar total,
 * 28 Aug partial) and two solar (17 Feb annular, 12 Aug total). None are
 * visible from New Delhi; the 3 Mar total lunar is visible from the Americas
 * and the 12 Aug total solar from Spain — used to exercise the visible/sūtak
 * path.
 */

import { describe, it, expect } from "vitest";
import { lunarEclipses, solarEclipses } from "../src/eclipses.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };
const LOS_ANGELES: GeoLocation = { latitude: 34.05, longitude: -118.24, timeZone: "America/Los_Angeles" };
const MADRID: GeoLocation = { latitude: 40.42, longitude: -3.7, timeZone: "Europe/Madrid" };

const day = (d: Date) => d.toISOString().slice(0, 10);

describe("lunarEclipses(2026)", () => {
  const eclipses = lunarEclipses(2026);

  it("finds the two 2026 lunar eclipses with the right type and date", () => {
    expect(eclipses).toHaveLength(2);
    expect(eclipses.map((e) => [day(e.peak), e.kind])).toEqual([
      ["2026-03-03", "total"],
      ["2026-08-28", "partial"],
    ]);
  });

  it("nests the contact phases (penumbral ⊇ partial ⊇ total)", () => {
    const total = eclipses[0]; // 3 Mar total
    expect(total.partial).not.toBeNull();
    expect(total.total).not.toBeNull();
    expect(total.penumbral.start.getTime()).toBeLessThan(total.partial!.start.getTime());
    expect(total.partial!.start.getTime()).toBeLessThan(total.total!.start.getTime());
    expect(total.total!.end.getTime()).toBeLessThan(total.partial!.end.getTime());
    expect(total.partial!.end.getTime()).toBeLessThan(total.penumbral.end.getTime());
    // a partial eclipse has no totality
    expect(eclipses[1].total).toBeNull();
  });

  it("is not visible from New Delhi (Moon below the horizon at peak) — no sūtak", () => {
    const withLoc = lunarEclipses(2026, NEW_DELHI);
    expect(withLoc.every((e) => e.visible === false)).toBe(true);
    expect(withLoc.every((e) => e.sutak === null)).toBe(true);
  });

  it("is visible from Los Angeles, with sūtak starting 9h before umbral first contact", () => {
    const total = lunarEclipses(2026, LOS_ANGELES).find((e) => e.kind === "total")!;
    expect(total.visible).toBe(true);
    expect(total.sutak).not.toBeNull();
    // sūtak starts 9h before the umbral (partial) first contact and ends at mokṣa
    const expectStart = total.partial!.start.getTime() - 9 * 3_600_000;
    expect(total.sutak!.start.getTime()).toBe(expectStart);
    expect(total.sutak!.end.getTime()).toBe(total.partial!.end.getTime());
  });

  it("does NOT emit sūtak for a purely penumbral eclipse, even when visible", () => {
    // 25 Mar 2024 is a penumbral lunar eclipse, visible from Los Angeles.
    const pen = lunarEclipses(2024, LOS_ANGELES).find((e) => e.kind === "penumbral")!;
    expect(pen.partial).toBeNull(); // no umbral phase
    expect(pen.visible).toBe(true); // Moon above the horizon at peak
    expect(pen.sutak).toBeNull(); // penumbral ≠ grahaṇa → no sūtak
  });
});

describe("solarEclipses(2026)", () => {
  it("finds the two 2026 solar eclipses with the right type and date", () => {
    const eclipses = solarEclipses(2026);
    expect(eclipses).toHaveLength(2);
    expect(eclipses.map((e) => [day(e.peak), e.kind])).toEqual([
      ["2026-02-17", "annular"],
      ["2026-08-12", "total"],
    ]);
  });

  it("is not visible from New Delhi — no local circumstances, no sūtak", () => {
    const eclipses = solarEclipses(2026, NEW_DELHI);
    expect(eclipses.every((e) => e.visible === false)).toBe(true);
    expect(eclipses.every((e) => e.local === null && e.sutak === null)).toBe(true);
  });

  it("is visible from Madrid (12 Aug total), with obscuration and 12h sūtak", () => {
    const total = solarEclipses(2026, MADRID).find((e) => e.kind === "total")!;
    expect(total.visible).toBe(true);
    expect(total.local).not.toBeNull();
    expect(total.local!.obscuration).toBeGreaterThan(0.9);
    expect(total.sutak!.start.getTime()).toBe(total.local!.partialStart.getTime() - 12 * 3_600_000);
    expect(total.sutak!.end.getTime()).toBe(total.local!.partialEnd.getTime());
  });
});
