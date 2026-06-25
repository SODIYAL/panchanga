/**
 * Tests for src/eclipses.ts — grahaṇa enumeration, local visibility, and sūtak.
 *
 * 2026 reference (astronomically fixed): two lunar eclipses (3 Mar total,
 * 28 Aug partial) and two solar (17 Feb annular, 12 Aug total). The 3 Mar total
 * lunar is a MOONRISE eclipse from New Delhi (the Moon rises at 18:22 IST while
 * the umbral phase runs to 18:47 IST, so its tail is visible) and is high in the
 * sky from the Americas; the 28 Aug partial is not visible from New Delhi (Moon
 * below the horizon throughout its umbral phase); the 12 Aug total solar is
 * visible from Spain — together they exercise the visible/sūtak paths, including
 * the moonrise case a peak-only altitude check would miss.
 */

import { describe, it, expect } from "vitest";
import { lunarEclipses, solarEclipses } from "../src/eclipses.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };
const LOS_ANGELES: GeoLocation = { latitude: 34.05, longitude: -118.24, timeZone: "America/Los_Angeles" };
const MADRID: GeoLocation = { latitude: 40.42, longitude: -3.7, timeZone: "Europe/Madrid" };

const day = (s: string) => s.slice(0, 10);
const ms = (s: string) => new Date(s).getTime();

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
    expect(ms(total.penumbral.start)).toBeLessThan(ms(total.partial!.start));
    expect(ms(total.partial!.start)).toBeLessThan(ms(total.total!.start));
    expect(ms(total.total!.end)).toBeLessThan(ms(total.partial!.end));
    expect(ms(total.partial!.end)).toBeLessThan(ms(total.penumbral.end));
    // a partial eclipse has no totality
    expect(eclipses[1].total).toBeNull();
  });

  it("counts the 3 Mar total as a MOONRISE eclipse from New Delhi (umbral tail visible as the Moon rises)", () => {
    // Greatest eclipse (17:03 IST) is below the horizon, but the Moon rises at
    // 18:22 IST while the umbral (partial) phase runs to 18:47 IST — ~25 min of
    // the umbral eclipse is visible. A peak-only altitude check would wrongly
    // call this "not visible"; sampling across the umbral phase catches it.
    const total = lunarEclipses(2026, NEW_DELHI).find((e) => e.kind === "total")!;
    expect(total.visible).toBe(true);
    expect(total.sutak).not.toBeNull();
  });

  it("does NOT count the 28 Aug partial from New Delhi (Moon below the horizon all through the umbral phase)", () => {
    const partial = lunarEclipses(2026, NEW_DELHI).find((e) => e.kind === "partial")!;
    expect(partial.visible).toBe(false);
    expect(partial.sutak).toBeNull();
  });

  it("is visible from Los Angeles, with sūtak starting 9h before umbral first contact", () => {
    const total = lunarEclipses(2026, LOS_ANGELES).find((e) => e.kind === "total")!;
    expect(total.visible).toBe(true);
    expect(total.sutak).not.toBeNull();
    // sūtak starts 9h before the umbral (partial) first contact and ends at mokṣa
    const expectStart = ms(total.partial!.start) - 9 * 3_600_000;
    expect(ms(total.sutak!.start)).toBe(expectStart);
    expect(ms(total.sutak!.end)).toBe(ms(total.partial!.end));
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
    expect(ms(total.sutak!.start)).toBe(ms(total.local!.partialStart) - 12 * 3_600_000);
    expect(ms(total.sutak!.end)).toBe(ms(total.local!.partialEnd));
  });
});
