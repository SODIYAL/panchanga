/**
 * test/moonset.test.ts — moonset as a first-class pañcāṅga quantity.
 *
 * `riseSet("set", …, Body.Moon)` could always compute it, but nothing exported
 * it and `dailyPanchanga` had no slot for it, so a pañcāṅga produced by this
 * engine was missing an aṅga every printed pañcāṅga carries.
 *
 * The expected instants are transcribed from the Government of India
 * *Rashtriya Panchang* 1948 S.E. for its adopted Central Station, which is the
 * only place its timings are valid. The book prints to the whole minute, so a
 * ±0.5 min quantisation floor is baked in before any ephemeris difference; the
 * tolerance below is 1 minute.
 */

import { describe, it, expect } from "vitest";
import { dailyPanchanga } from "../src/panchanga.js";
import { moonset, moonrise } from "../src/time.js";
import type { GeoLocation } from "../src/types.js";

/** RP Central Station of India: 82°30′E, 23°11′N — its LMT is exactly I.S.T. */
const CENTRAL_STATION: GeoLocation = {
  latitude: 23 + 11 / 60,
  longitude: 82.5,
  timeZone: "Asia/Kolkata",
};

/** Noon IST of a civil date — a safe interior instant for naming the local day. */
const noonIst = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12 - 5, -30));
};

/** IST wall clock of an ISO-UTC instant, as "HH-MM" — the RP's own notation. */
const ist = (iso: string): string => {
  const t = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}-${String(t.getUTCMinutes()).padStart(2, "0")}`;
};

const minutesBetween = (iso: string, target: string): number =>
  Math.abs(new Date(iso).getTime() - new Date(target).getTime()) / 60_000;

/** RP-printed moonsets that fall inside the civil day, so no re-bucketing applies. */
const RP_MOONSETS: Array<[date: string, istHM: string]> = [
  ["2026-12-06", "15-04"],
  ["2026-12-07", "15-46"],
  ["2026-12-08", "16-31"],
  ["2026-12-09", "17-21"],
];

describe("moonset", () => {
  it("is reported by dailyPanchanga", () => {
    const p = dailyPanchanga(noonIst("2026-12-06"), CENTRAL_STATION);
    expect(typeof p.moonset).toBe("string");
  });

  it("matches the Rashtriya Panchang Central Station to within a minute", () => {
    for (const [date, hm] of RP_MOONSETS) {
      const p = dailyPanchanga(noonIst(date), CENTRAL_STATION);
      const [y, mo, d] = date.split("-").map(Number);
      const [h, m] = hm.split("-").map(Number);
      const target = new Date(
        Date.UTC(y, mo - 1, d) - 5.5 * 3600_000 + h * 3600_000 + m * 60_000
      ).toISOString();

      expect(p.moonset, `${date} moonset missing`).not.toBeNull();
      expect(
        minutesBetween(p.moonset!, target),
        `${date}: engine ${ist(p.moonset!)} vs RP ${hm}`
      ).toBeLessThanOrEqual(1);
    }
  });

  it("exports a moonset() helper that agrees with dailyPanchanga", () => {
    const day = noonIst("2026-12-08");
    const p = dailyPanchanga(day, CENTRAL_STATION);
    expect(moonset(day, CENTRAL_STATION)?.toISOString()).toBe(p.moonset);
  });

  it("resolves moonset on the civil day, independently of moonrise", () => {
    // 2026-12-08 has a moonset (16-31 IST) but NO moonrise inside the sunrise
    // day — the RP prints no Moonrise for it. A null moonrise must not suppress
    // the moonset.
    const p = dailyPanchanga(noonIst("2026-12-08"), CENTRAL_STATION);
    expect(typeof p.moonset).toBe("string");
    expect(ist(p.moonset!)).toBe("16-31");
    // The rise that the RP omits for this day is the engine's own civil-day
    // rise; whatever it reports there must not have suppressed the set.
    expect(moonrise(noonIst("2026-12-08"), CENTRAL_STATION)).not.toBeUndefined();
  });
});
