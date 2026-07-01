/**
 * Regression tests for the `moonrise` observance fallback (resolveMoonrise) when
 * NO moonrise falls inside the tithi. The two moonrise rites resolve opposite
 * ways and a single "nearest moonrise" heuristic gets one of them wrong:
 *
 *  • Caturthī/Caturdaśī FASTS (Karva Chauth, Sankaṣṭī) are observed on the day
 *    the moon is sighted to break the fast — the earliest moonrise at/after the
 *    tithi's start, which may fall just after the tithi has passed.
 *  • Pūrṇimā evening WORSHIP (Pūrṇimā Vrat) is observed on the night the full
 *    moon is up while Pūrṇimā runs — the latest moonrise before the tithi ends.
 *
 * Before the fix the fallback kept the globally-earliest moonrise, which chose a
 * moonrise preceding the tithi entirely (Karva Chauth 2025 New Delhi → Oct 9,
 * whose 19:23 IST moonrise is still Tṛtīyā, instead of the correct Oct 10).
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { allRules } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };
const CALGARY: GeoLocation = {
  latitude: 51.0447, longitude: -114.0719, timeZone: "America/Edmonton", elevationMeters: 1045,
};

const dateOf = (year: number, loc: GeoLocation, id: string): string =>
  computeFestivals(year, loc, { rules: allRules(year) }).results.find((r) => r.id === id)?.date ?? "";

describe("moonrise fallback — fast vs worship convention", () => {
  it("Karva Chauth 2025 New Delhi → Oct 10 (fast broken at the moonrise after Caturthī)", () => {
    // Caturthī 09 Oct 22:55 → 10 Oct 19:39 IST; moon sighted 10 Oct 20:13 IST.
    expect(dateOf(2025, NEW_DELHI, "karva-chauth")).toBe("2025-10-10");
  });

  it("Pūrṇimā Vrat (Māgha) 2026 Calgary → Jan 31 (full moon up before Pūrṇimā ends)", () => {
    expect(dateOf(2026, CALGARY, "purnima-vrat-magha")).toBe("2026-01-31");
  });

  it("Pūrṇimā Vrat (Chaitra) 2026 Calgary → Mar 31 (not the Apr 1 moonrise 2 min past Pūrṇimā)", () => {
    expect(dateOf(2026, CALGARY, "purnima-vrat-chaitra")).toBe("2026-03-31");
  });
});
