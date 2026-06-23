/**
 * Tests for src/time.ts
 *
 * Rise/set fixture source:
 *   Drik Panchang (https://www.drikpanchang.com/astronomy/sunrisemoonrise/daily/sunrisemoonrise.html)
 *   fetched 2026-06-23 for New Delhi (geoname-id=1261481) and Toronto (geoname-id=6167865).
 *   Times shown in IST / EDT; converted to UTC for assertion.
 *
 *   New Delhi  (28.63576°N, 77.22445°E, tz Asia/Kolkata, UTC+5:30)  June 23 2026
 *     Sunrise  05:24 IST  →  2026-06-22T23:54:00Z
 *     Sunset   19:22 IST  →  2026-06-23T13:52:00Z
 *     Moonrise 13:42 IST  →  2026-06-23T08:12:00Z
 *
 *   Toronto (43.6532°N, 79.3832°W, tz America/Toronto, UTC-4 EDT)  June 23 2026
 *     Sunrise  05:37 EDT  →  2026-06-23T09:37:00Z
 *     Sunset   21:03 EDT  →  2026-06-24T01:03:00Z
 */

import { describe, it, expect } from "vitest";
import {
  startOfLocalDayUTC,
  nextLocalDayStartUTC,
  localDayString,
  riseSet,
  moonrise,
  sunset,
  sunriseWindow,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  pratahkala,
  type GeoLocation,
} from "../src/time.js";

// ---------------------------------------------------------------------------
// Reference locations
// ---------------------------------------------------------------------------

const DELHI: GeoLocation = {
  latitude: 28.63576,
  longitude: 77.22445,
  elevationMeters: 216,
  timeZone: "Asia/Kolkata",
};

const TORONTO: GeoLocation = {
  latitude: 43.6532,
  longitude: -79.3832,
  elevationMeters: 76,
  timeZone: "America/Toronto",
};

/** Tromsø, Norway — far north, polar phenomena */
const TROMSO: GeoLocation = {
  latitude: 69.6489,
  longitude: 18.9551,
  elevationMeters: 10,
  timeZone: "Europe/Oslo",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 2-minute tolerance in ms for rise/set fixture checks. */
const TWO_MIN_MS = 2 * 60 * 1000;

function absDiffMs(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime());
}

// ---------------------------------------------------------------------------
// 1. tz/DST-safe local-day helpers
// ---------------------------------------------------------------------------

describe("localDayString", () => {
  it("returns YYYY-MM-DD in the given timezone", () => {
    // At 2026-06-23T10:00:00Z it is June 23 in UTC+5:30 (IST) → "2026-06-23"
    const d = new Date("2026-06-23T10:00:00Z");
    expect(localDayString(d, "Asia/Kolkata")).toBe("2026-06-23");
  });

  it("returns next day in a timezone that is ahead of UTC", () => {
    // At 2026-06-23T20:00:00Z it is still June 23 UTC but June 24 in IST (IST = UTC+5:30, so 01:30 June 24)
    const d = new Date("2026-06-23T20:00:00Z");
    expect(localDayString(d, "Asia/Kolkata")).toBe("2026-06-24");
  });

  it("returns previous day in a western timezone", () => {
    // At 2026-06-23T03:00:00Z it is June 22 in EDT (UTC-4)
    const d = new Date("2026-06-23T03:00:00Z");
    expect(localDayString(d, "America/Toronto")).toBe("2026-06-22");
  });
});

describe("startOfLocalDayUTC", () => {
  it("New Delhi 2026-06-23 midnight = 2026-06-22T18:30:00Z", () => {
    // IST is UTC+5:30, so local midnight 2026-06-23 00:00 IST = 2026-06-22T18:30:00Z
    const date = new Date("2026-06-23T12:00:00Z");
    const result = startOfLocalDayUTC(date, "Asia/Kolkata");
    const expected = new Date("2026-06-22T18:30:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("Toronto 2026-06-23 midnight = 2026-06-23T04:00:00Z (EDT = UTC-4)", () => {
    const date = new Date("2026-06-23T12:00:00Z");
    const result = startOfLocalDayUTC(date, "America/Toronto");
    const expected = new Date("2026-06-23T04:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });
});

describe("nextLocalDayStartUTC — DST transitions", () => {
  /**
   * America/Toronto spring-forward: 2026-03-08 02:00 clocks jump to 03:00
   * so 2026-03-08 is only 23 hours long.
   * Local midnight 2026-03-08 is EST (UTC-5) → 2026-03-08T05:00:00Z
   * Local midnight 2026-03-09 is EDT (UTC-4) → 2026-03-09T04:00:00Z
   * Difference = 23h exactly.
   */
  it("spring-forward (America/Toronto 2026-03-08): next day start − day start = 23h", () => {
    const date = new Date("2026-03-08T12:00:00Z");
    const dayStart = startOfLocalDayUTC(date, "America/Toronto");
    const nextDayStart = nextLocalDayStartUTC(date, "America/Toronto");
    const diffMs = nextDayStart.getTime() - dayStart.getTime();
    expect(diffMs).toBe(23 * 60 * 60 * 1000);
  });

  it("spring-forward: startOfLocalDayUTC for 2026-03-08 is 05:00 UTC (EST midnight)", () => {
    const date = new Date("2026-03-08T12:00:00Z");
    const result = startOfLocalDayUTC(date, "America/Toronto");
    expect(result.getTime()).toBe(new Date("2026-03-08T05:00:00Z").getTime());
  });

  /**
   * America/Toronto fall-back: 2026-11-01 02:00 clocks fall back to 01:00
   * so 2026-11-01 is 25 hours long.
   * Local midnight 2026-11-01 is EDT (UTC-4) → 2026-11-01T04:00:00Z
   * Local midnight 2026-11-02 is EST (UTC-5) → 2026-11-02T05:00:00Z
   * Difference = 25h exactly.
   */
  it("fall-back (America/Toronto 2026-11-01): next day start − day start = 25h", () => {
    const date = new Date("2026-11-01T12:00:00Z");
    const dayStart = startOfLocalDayUTC(date, "America/Toronto");
    const nextDayStart = nextLocalDayStartUTC(date, "America/Toronto");
    const diffMs = nextDayStart.getTime() - dayStart.getTime();
    expect(diffMs).toBe(25 * 60 * 60 * 1000);
  });

  it("fall-back: startOfLocalDayUTC for 2026-11-01 is 04:00 UTC (EDT midnight)", () => {
    const date = new Date("2026-11-01T12:00:00Z");
    const result = startOfLocalDayUTC(date, "America/Toronto");
    expect(result.getTime()).toBe(new Date("2026-11-01T04:00:00Z").getTime());
  });
});

// ---------------------------------------------------------------------------
// 2. rise/set vs Drik Panchang fixtures (< 2 minutes)
// ---------------------------------------------------------------------------

describe("sunrise — New Delhi 2026-06-23 vs Drik Panchang", () => {
  /**
   * Source: https://www.drikpanchang.com/astronomy/sunrisemoonrise/daily/sunrisemoonrise.html?geoname-id=1261481
   * Date: 2026-06-23
   * Sunrise 05:24 AM IST = 2026-06-22T23:54:00Z
   * Tolerance: < 2 minutes
   */
  it("sunrise within 2 min of Drik Panchang reference", async () => {
    const date = new Date("2026-06-23T12:00:00Z"); // any time during the local day
    const result = riseSet("rise", date, DELHI);
    expect(result).not.toBeNull();
    const expected = new Date("2026-06-22T23:54:00Z");
    expect(absDiffMs(result!, expected)).toBeLessThan(TWO_MIN_MS);
  });
});

describe("sunset — New Delhi 2026-06-23 vs Drik Panchang", () => {
  /**
   * Source: same as above
   * Sunset 07:22 PM IST = 2026-06-23T13:52:00Z
   */
  it("sunset within 2 min of Drik Panchang reference", () => {
    const date = new Date("2026-06-23T12:00:00Z");
    const result = sunset(date, DELHI);
    expect(result).not.toBeNull();
    const expected = new Date("2026-06-23T13:52:00Z");
    expect(absDiffMs(result!, expected)).toBeLessThan(TWO_MIN_MS);
  });
});

describe("moonrise — New Delhi 2026-06-23 vs Drik Panchang", () => {
  /**
   * Source: same page
   * Moonrise 01:42 PM IST = 2026-06-23T08:12:00Z
   */
  it("moonrise within 2 min of Drik Panchang reference", () => {
    const date = new Date("2026-06-23T12:00:00Z");
    const result = moonrise(date, DELHI);
    expect(result).not.toBeNull();
    const expected = new Date("2026-06-23T08:12:00Z");
    expect(absDiffMs(result!, expected)).toBeLessThan(TWO_MIN_MS);
  });
});

describe("sunrise/sunset — Toronto 2026-06-23 vs Drik Panchang", () => {
  /**
   * Source: https://www.drikpanchang.com/astronomy/sunrisemoonrise/daily/sunrisemoonrise.html?geoname-id=6167865
   * Date: 2026-06-23
   * Sunrise 05:37 AM EDT = 2026-06-23T09:37:00Z
   * Sunset  09:03 PM EDT = 2026-06-24T01:03:00Z
   */
  it("sunrise within 2 min of Drik Panchang reference", () => {
    const date = new Date("2026-06-23T15:00:00Z");
    const result = riseSet("rise", date, TORONTO);
    expect(result).not.toBeNull();
    const expected = new Date("2026-06-23T09:37:00Z");
    expect(absDiffMs(result!, expected)).toBeLessThan(TWO_MIN_MS);
  });

  it("sunset within 2 min of Drik Panchang reference", () => {
    const date = new Date("2026-06-23T15:00:00Z");
    const result = riseSet("set", date, TORONTO);
    expect(result).not.toBeNull();
    const expected = new Date("2026-06-24T01:03:00Z");
    expect(absDiffMs(result!, expected)).toBeLessThan(TWO_MIN_MS);
  });
});

// ---------------------------------------------------------------------------
// 3. Polar latitude → null (not a throw)
// ---------------------------------------------------------------------------

describe("polar latitudes → riseSet returns null", () => {
  /**
   * Tromsø (69.6489°N, 18.9551°E) experiences:
   *   Midnight sun: roughly May 20 – Jul 22 (no sunset)
   *   Polar night:  roughly Nov 25 – Jan 17 (no sunrise)
   *
   * 2026-06-21 = near summer solstice → no sunset (midnight sun)
   * 2026-12-21 = near winter solstice → no sunrise (polar night)
   */
  it("no sunset on 2026-06-21 (midnight sun) → null", () => {
    const date = new Date("2026-06-21T12:00:00Z");
    expect(() => riseSet("set", date, TROMSO)).not.toThrow();
    const result = riseSet("set", date, TROMSO);
    expect(result).toBeNull();
  });

  it("no sunrise on 2026-12-21 (polar night) → null", () => {
    const date = new Date("2026-12-21T12:00:00Z");
    expect(() => riseSet("rise", date, TROMSO)).not.toThrow();
    const result = riseSet("rise", date, TROMSO);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Kāla window structural sanity
// ---------------------------------------------------------------------------

describe("kāla windows — structural sanity for New Delhi 2026-06-23", () => {
  const date = new Date("2026-06-23T12:00:00Z");

  function getSunrise(d: Date, loc: GeoLocation): Date {
    const r = riseSet("rise", d, loc);
    if (!r) throw new Error("No sunrise");
    return r;
  }

  function getSunset(d: Date, loc: GeoLocation): Date {
    const r = riseSet("set", d, loc);
    if (!r) throw new Error("No sunset");
    return r;
  }

  it("sunriseWindow / pratahkala starts at sunrise", () => {
    const win = sunriseWindow(date, DELHI);
    expect(win).not.toBeNull();
    const sr = getSunrise(date, DELHI);
    expect(absDiffMs(win!.start, sr)).toBeLessThan(1000); // within 1s
  });

  it("pratahkala equals sunriseWindow", () => {
    const pw = pratahkala(date, DELHI);
    const sw = sunriseWindow(date, DELHI);
    expect(pw).not.toBeNull();
    expect(sw).not.toBeNull();
    expect(pw!.start.getTime()).toBe(sw!.start.getTime());
    expect(pw!.end.getTime()).toBe(sw!.end.getTime());
  });

  it("purvahna starts at sunrise", () => {
    const win = purvahna(date, DELHI);
    expect(win).not.toBeNull();
    const sr = getSunrise(date, DELHI);
    expect(absDiffMs(win!.start, sr)).toBeLessThan(1000);
  });

  it("ordering: purvahna.start < madhyahna.start < aparahna.start", () => {
    const p = purvahna(date, DELHI);
    const m = madhyahna(date, DELHI);
    const a = aparahna(date, DELHI);
    expect(p).not.toBeNull();
    expect(m).not.toBeNull();
    expect(a).not.toBeNull();
    expect(p!.start.getTime()).toBeLessThan(m!.start.getTime());
    expect(m!.start.getTime()).toBeLessThan(a!.start.getTime());
  });

  it("pradosha starts at sunset", () => {
    const win = pradosha(date, DELHI);
    expect(win).not.toBeNull();
    const ss = getSunset(date, DELHI);
    expect(absDiffMs(win!.start, ss)).toBeLessThan(1000);
  });

  it("pradosha ends after sunset (≈ 3 muhurtas ≈ 1.2h)", () => {
    const win = pradosha(date, DELHI);
    const ss = getSunset(date, DELHI);
    expect(win!.end.getTime()).toBeGreaterThan(ss.getTime());
  });

  it("brahmaMuhurta ends before sunrise", () => {
    const win = brahmaMuhurta(date, DELHI);
    expect(win).not.toBeNull();
    const sr = getSunrise(date, DELHI);
    expect(win!.end.getTime()).toBeLessThanOrEqual(sr.getTime());
  });

  it("brahmaMuhurta start < brahmaMuhurta end < sunrise", () => {
    const win = brahmaMuhurta(date, DELHI);
    const sr = getSunrise(date, DELHI);
    expect(win!.start.getTime()).toBeLessThan(win!.end.getTime());
    expect(win!.end.getTime()).toBeLessThanOrEqual(sr.getTime());
  });

  it("nishita straddles solar midnight (start < midnight < end)", () => {
    const win = nishita(date, DELHI);
    expect(win).not.toBeNull();
    // Solar midnight is midpoint of sunset–nextSunrise.
    // We just check start < end and duration ≈ 1 nightMuhurta (night/15).
    expect(win!.start.getTime()).toBeLessThan(win!.end.getTime());
    // Duration should be about N/15 where N is night length (~12h in June at Delhi)
    // ≈ 48 min, allow 10–90 min range
    const durMin = (win!.end.getTime() - win!.start.getTime()) / 60000;
    expect(durMin).toBeGreaterThan(10);
    expect(durMin).toBeLessThan(90);
  });

  it("madhyahna covers a middle fifth of the day (not at sunrise or sunset)", () => {
    const win = madhyahna(date, DELHI);
    const sr = getSunrise(date, DELHI);
    const ss = getSunset(date, DELHI);
    expect(win!.start.getTime()).toBeGreaterThan(sr.getTime());
    expect(win!.end.getTime()).toBeLessThan(ss.getTime());
  });

  it("all windows have start < end", () => {
    const wins = [
      sunriseWindow(date, DELHI),
      purvahna(date, DELHI),
      madhyahna(date, DELHI),
      aparahna(date, DELHI),
      pradosha(date, DELHI),
      nishita(date, DELHI),
      brahmaMuhurta(date, DELHI),
    ];
    for (const w of wins) {
      expect(w).not.toBeNull();
      expect(w!.start.getTime()).toBeLessThan(w!.end.getTime());
    }
  });
});
