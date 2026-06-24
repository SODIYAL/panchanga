/**
 * Multi-location robustness for `dailyPanchanga`. The engine had only ever been
 * exercised at New Delhi; these cases prove it generalises across timezones,
 * the southern hemisphere, and the polar fallback path.
 *
 * The aṅgas can't be asserted to exact Drik values here (no reference fixtures
 * for these places), so we check the facts that ARE externally fixed — the
 * civil day, the weekday (vāra), sunrise < sunset, in-range indices, and that
 * the day-part muhūrtas fall inside the daytime — plus the polar-night
 * behaviour (no sun events, muhūrtas null, aṅgas still resolved at the noon
 * fallback).
 */

import { describe, it, expect } from "vitest";
import { dailyPanchanga, type DailyPanchanga } from "../src/panchanga.js";
import type { GeoLocation } from "../src/types.js";

function expectAngaRanges(p: DailyPanchanga): void {
  expect(p.tithi.number).toBeGreaterThanOrEqual(1);
  expect(p.tithi.number).toBeLessThanOrEqual(30);
  expect(p.nakshatra.index).toBeGreaterThanOrEqual(0);
  expect(p.nakshatra.index).toBeLessThan(27);
  expect(p.yoga.index).toBeGreaterThanOrEqual(0);
  expect(p.yoga.index).toBeLessThan(27);
  expect(p.karana.index).toBeGreaterThanOrEqual(0);
  expect(p.karana.index).toBeLessThan(60);
  expect(p.vara.index).toBeGreaterThanOrEqual(0);
  expect(p.vara.index).toBeLessThan(7);
}

const TORONTO: GeoLocation = { latitude: 43.65, longitude: -79.38, timeZone: "America/Toronto" };
const SYDNEY: GeoLocation = { latitude: -33.87, longitude: 151.21, timeZone: "Australia/Sydney" };
const LONGYEARBYEN: GeoLocation = { latitude: 78.22, longitude: 15.65, timeZone: "Arctic/Longyearbyen" };

describe("dailyPanchanga — western timezone (Toronto)", () => {
  // 12:00 EST on Fri 2026-01-23 (an instant unambiguously inside the Toronto day).
  const p = dailyPanchanga(new Date("2026-01-23T17:00:00Z"), TORONTO);

  it("resolves the local civil day and weekday", () => {
    expect(p.date).toBe("2026-01-23");
    expect(p.vara.name).toBe("Shukravara"); // Friday
    expectAngaRanges(p);
  });

  it("has sunrise before sunset and muhūrtas inside the daytime", () => {
    const sr = new Date(p.sunrise!).getTime();
    const ss = new Date(p.sunset!).getTime();
    expect(sr).toBeLessThan(ss);
    const rk = p.muhurta.rahuKala!;
    expect(new Date(rk.start).getTime()).toBeGreaterThanOrEqual(sr);
    expect(new Date(rk.end).getTime()).toBeLessThanOrEqual(ss + 2);
  });
});

describe("dailyPanchanga — southern hemisphere (Sydney)", () => {
  // 12:00 AEDT on Fri 2026-01-23.
  const p = dailyPanchanga(new Date("2026-01-23T01:00:00Z"), SYDNEY);

  it("resolves the local civil day and weekday south of the equator", () => {
    expect(p.date).toBe("2026-01-23");
    expect(p.vara.name).toBe("Shukravara"); // Friday
    expectAngaRanges(p);
  });

  it("still has sunrise before sunset (morning rise, evening set)", () => {
    expect(new Date(p.sunrise!).getTime()).toBeLessThan(new Date(p.sunset!).getTime());
    expect(p.muhurta.abhijit).not.toBeNull();
  });
});

describe("dailyPanchanga — polar night fallback (Longyearbyen, 21 Dec)", () => {
  const p = dailyPanchanga(new Date("2026-12-21T11:00:00Z"), LONGYEARBYEN);

  it("reports no sun events and no day-part muhūrtas during polar night", () => {
    expect(p.sunrise).toBeNull();
    expect(p.sunset).toBeNull();
    expect(p.muhurta.rahuKala).toBeNull();
    expect(p.muhurta.yamaganda).toBeNull();
    expect(p.muhurta.gulika).toBeNull();
    expect(p.muhurta.abhijit).toBeNull();
  });

  it("still resolves the five aṅgas (at the local-noon fallback) and the weekday", () => {
    expect(p.date).toBe("2026-12-21");
    expect(p.vara.name).toBe("Somavara"); // Monday
    expect(p.month.purnimanta).not.toBe("");
    expectAngaRanges(p);
  });
});
