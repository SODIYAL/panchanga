/**
 * Tests for the newly added aṅgas and the daily aggregator:
 *   • yoga  (src/elements.ts)  — (Sun+Moon) sidereal longitude / 13°20′
 *   • karanaBoundaries (src/elements.ts)
 *   • vāra  (src/time.ts)      — sunrise-to-sunrise weekday
 *   • dailyPanchanga (src/panchanga.ts) — the five-aṅga aggregator
 *
 * The 2026-01-23 New Delhi anchor is Vasant Pañcamī (already in the festival
 * conformance set): Māgha, Śukla Pañcamī, Friday — externally fixed facts the
 * aggregator must reproduce. Yoga/nakṣatra/karaṇa are checked for internal
 * self-consistency (boundaries bracket the instant; the index matches the raw
 * sidereal formula), since they share the ayanāṁśa machinery already validated
 * against Drik in elements.test.ts.
 */

import { describe, it, expect } from "vitest";
import { Body } from "astronomy-engine";
import { siderealLongitude, normalize360 } from "../src/ayanamsha.js";
import {
  yogaAt,
  yogaBoundaries,
  YOGA_NAMES,
  karanaBoundaries,
  karanaAt,
  karanaIndexAt,
} from "../src/elements.js";
import { varaAt, VARA_NAMES } from "../src/time.js";
import { dailyPanchanga } from "../src/panchanga.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
};

const DEG_PER_YOGA = 360 / 27;
function expectedYoga(d: Date): number {
  const sum = normalize360(
    siderealLongitude(d, Body.Sun) + siderealLongitude(d, Body.Moon),
  );
  return Math.floor(sum / DEG_PER_YOGA);
}

describe("yoga — nitya-yoga from (Sun+Moon) sidereal longitude", () => {
  it("has 27 distinct names", () => {
    expect(YOGA_NAMES).toHaveLength(27);
    expect(new Set(YOGA_NAMES).size).toBe(27);
  });

  it("yogaAt matches floor((sunSid+moonSid)/13°20′) across the year", () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(2026, m, 15, 6, 0, 0));
      const idx = yogaAt(d);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(27);
      expect(idx).toBe(expectedYoga(d));
    }
  });

  it("yogaBoundaries bracket the instant and increment cleanly at the edges", () => {
    const samples = [
      new Date("2026-01-23T02:00:00Z"),
      new Date("2026-06-22T06:00:00Z"),
      new Date("2026-10-11T03:00:00Z"),
    ];
    for (const d of samples) {
      const { index, start, end } = yogaBoundaries(d);
      // the instant lies within [start, end)
      expect(start.getTime()).toBeLessThanOrEqual(d.getTime());
      expect(end.getTime()).toBeGreaterThan(d.getTime());
      // the current yoga holds just after start, the previous one just before
      expect(yogaAt(new Date(start.getTime() + 1000))).toBe(index);
      expect(yogaAt(new Date(start.getTime() - 1000))).toBe((index + 26) % 27);
      // and the next yoga begins at end
      expect(yogaAt(new Date(end.getTime() + 1000))).toBe((index + 1) % 27);
    }
  });
});

describe("vāra — sunrise-to-sunrise weekday", () => {
  it("has 7 names, Ravivara first", () => {
    expect(VARA_NAMES).toHaveLength(7);
    expect(VARA_NAMES[0]).toBe("Ravivara");
  });

  it("returns the civil weekday after sunrise (2026-01-23 = Friday)", () => {
    const noon = new Date("2026-01-23T06:30:00Z"); // 12:00 IST, well after sunrise
    expect(varaAt(noon, NEW_DELHI)).toEqual({ index: 5, name: "Shukravara" });
  });

  it("rolls back to the previous weekday before sunrise", () => {
    // 02:00 IST on Fri 2026-01-23 is before sunrise (~07:13 IST) → Thursday.
    const preDawn = new Date("2026-01-22T20:30:00Z");
    expect(varaAt(preDawn, NEW_DELHI)).toEqual({ index: 4, name: "Guruvara" });
  });
});

describe("karanaBoundaries — half-tithi span", () => {
  it("brackets the instant and reports the karaṇa at that instant", () => {
    const d = new Date("2026-01-23T06:00:00Z");
    const kb = karanaBoundaries(d);
    expect(kb.index).toBe(karanaIndexAt(d));
    expect(kb.name).toBe(karanaAt(d));
    expect(kb.index).toBeGreaterThanOrEqual(0);
    expect(kb.index).toBeLessThan(60);
    expect(kb.start.getTime()).toBeLessThanOrEqual(d.getTime());
    expect(kb.end.getTime()).toBeGreaterThan(d.getTime());
  });
});

describe("dailyPanchanga — the five aṅgas for one day", () => {
  const p = dailyPanchanga(new Date("2026-01-23T00:00:00Z"), NEW_DELHI);

  it("labels the right civil day, vāra, tithi and month (Vasant Pañcamī 2026)", () => {
    expect(p.date).toBe("2026-01-23");
    expect(p.vara).toEqual({ index: 5, name: "Shukravara" });
    expect(p.tithi.number).toBe(5);
    expect(p.tithi.name).toBe("Panchami");
    expect(p.tithi.paksha).toBe("shukla");
    expect(p.month.purnimanta).toBe("Magha");
    expect(p.month.paksha).toBe("shukla");
  });

  it("includes all five aṅgas with in-range indices and ISO instants", () => {
    expect(p.sunrise).toMatch(/^2026-01-23T/);
    expect(p.sunset).toMatch(/^2026-01-23T/);
    expect(p.moonrise).toMatch(/^2026-01-23T/);
    expect(p.nakshatra.index).toBeGreaterThanOrEqual(0);
    expect(p.nakshatra.index).toBeLessThan(27);
    expect(p.yoga.index).toBeGreaterThanOrEqual(0);
    expect(p.yoga.index).toBeLessThan(27);
    expect(p.karana.index).toBeGreaterThanOrEqual(0);
    expect(p.karana.index).toBeLessThan(60);
    // each running aṅga was prevailing AT sunrise, so it ends after sunrise
    const sr = new Date(p.sunrise!).getTime();
    expect(new Date(p.tithi.endsAt).getTime()).toBeGreaterThan(sr);
    expect(new Date(p.nakshatra.endsAt).getTime()).toBeGreaterThan(sr);
    expect(new Date(p.yoga.endsAt).getTime()).toBeGreaterThan(sr);
    expect(new Date(p.karana.endsAt).getTime()).toBeGreaterThan(sr);
  });

  it("resolves yoga at sunrise (the sunrise instant lies inside the reported yoga)", () => {
    const sr = new Date(p.sunrise!);
    expect(yogaBoundaries(sr).index).toBe(p.yoga.index);
  });
});
