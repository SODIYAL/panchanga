import { describe, it, expect } from "vitest";
import { Body } from "astronomy-engine";
import {
  ayanamsha,
  siderealLongitude,
  siderealSunRashi,
} from "../src/ayanamsha.js";

/**
 * FROZEN reference values — published Lahiri (Chitrapakṣa) ayanāṁśa.
 * Tolerance: < 1 arcmin = 1/60 deg ≈ 0.0166667 deg.
 * These targets are LOCKED. Do not edit them or the anchor to force a pass.
 *
 * Dates are constructed as UTC instants at the conventional start of the year
 * (Jan 1, 00:00 UTC) except J2000.0 which is the epoch itself
 * (2000-01-01 12:00 TT ≈ 2000-01-01 11:58:56 UTC; we use the Date that
 * astronomy-engine maps to tt ≈ 0).
 */
const ARCMIN = 1 / 60; // degrees
const TOL = ARCMIN; // < 1 arcmin

/** Convert D°M′S″ to decimal degrees. */
function dms(d: number, m: number, s: number): number {
  return d + m / 60 + s / 3600;
}

describe("Lahiri (Chitrapakṣa) mean ayanāṁśa — frozen published values", () => {
  it("1950.0 → 23°09′27″", () => {
    const date = new Date("1950-01-01T00:00:00Z");
    const expected = dms(23, 9, 27); // 23.1575°
    expect(Math.abs(ayanamsha(date) - expected)).toBeLessThan(TOL);
  });

  it("J2000.0 → 23°51′11″ (the canonical anchor)", () => {
    // J2000.0 = 2000-01-01 12:00 TT. A JS Date at this UTC instant maps to
    // tt ≈ 0 within ~1 minute, far below the tolerance.
    const date = new Date("2000-01-01T12:00:00Z");
    const expected = dms(23, 51, 11); // 23.853056° (anchor is 23.853222°)
    expect(Math.abs(ayanamsha(date) - expected)).toBeLessThan(TOL);
  });

  it("2025.0 → ≈ 24°12′ (24.205°)", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const expected = dms(24, 12, 0); // 24.200°
    expect(Math.abs(ayanamsha(date) - expected)).toBeLessThan(TOL);
  });
});

describe("ayanāṁśa: mean is the core; nutation is opt-in", () => {
  it("mean and true differ by ≤ ~17″ (nutation amplitude), both within tolerance", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const mean = ayanamsha(date);
    const trueAyan = ayanamsha(date, { nutation: true });
    const diffArcsec = Math.abs(trueAyan - mean) * 3600;
    // Nutation in longitude amplitude is ≤ ~17.2″.
    expect(diffArcsec).toBeGreaterThan(0); // they must actually differ
    expect(diffArcsec).toBeLessThanOrEqual(18);
  });

  it("default (no options) equals mean (precession only)", () => {
    const date = new Date("2025-06-21T00:00:00Z");
    expect(ayanamsha(date)).toBe(ayanamsha(date, { nutation: false }));
  });
});

describe("siderealLongitude", () => {
  it("= tropical longitude of date − ayanāṁśa, in [0,360)", () => {
    const date = new Date("2025-03-21T00:00:00Z");
    const lon = siderealLongitude(date, Body.Sun);
    expect(lon).toBeGreaterThanOrEqual(0);
    expect(lon).toBeLessThan(360);
  });

  it("Sun's sidereal longitude is ≈ ayanāṁśa behind its tropical longitude", () => {
    // Around the (tropical) vernal equinox the Sun's tropical longitude ≈ 0°,
    // so its sidereal longitude ≈ 360° − ayanāṁśa ≈ 335–336°.
    const date = new Date("2025-03-20T09:01:00Z"); // ~2025 vernal equinox
    const sid = siderealLongitude(date, Body.Sun);
    const ayan = ayanamsha(date, { nutation: true });
    // Expect sidereal ≈ (small tropical lon) − ayan, wrapped → ≈ 360 − ayan.
    const expected = (360 - ayan) % 360;
    // Within a couple degrees (the Sun moves ~1°/day; equinox instant is approximate).
    const diff = Math.min(
      Math.abs(sid - expected),
      360 - Math.abs(sid - expected),
    );
    expect(diff).toBeLessThan(2);
  });
});

describe("siderealSunRashi", () => {
  it("returns an integer in 0..11", () => {
    const r = siderealSunRashi(new Date("2025-06-21T00:00:00Z"));
    expect(Number.isInteger(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(11);
  });

  it("Sun is in Mesha (0) shortly after Mesha Saṅkrānti (~Apr 14)", () => {
    // Sidereal solar new year: Sun enters Mesha around April 14.
    // A few days after, the Sun is firmly in Mesha (rashi 0).
    expect(siderealSunRashi(new Date("2025-04-20T00:00:00Z"))).toBe(0);
  });

  it("Sun's rashi changes across a saṅkrānti (Mesha entry, mid-April)", () => {
    // Before mid-April the Sun is still in Mīna (11); after, Mesha (0).
    const before = siderealSunRashi(new Date("2025-04-10T00:00:00Z"));
    const after = siderealSunRashi(new Date("2025-04-20T00:00:00Z"));
    expect(before).toBe(11); // Mīna
    expect(after).toBe(0); // Mesha
    expect(before).not.toBe(after);
  });
});
