/**
 * Cross-year / cross-longitude regression guards for the nirṇaya audit fixes.
 *
 * The engine's original conformance suite pinned only 2026 at New Delhi and
 * Calgary — a single year, and (for the harder localisation) only a negative-UTC
 * -offset city. That envelope hid a family of bugs that surface in other years
 * and at other longitudes. These cases lock in the corrected behaviour, each
 * cross-checked against Drik Panchang / widely-published dates.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { allRules, ekadashiRules, adhikaMonthLabel } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };

const dateOf = (year: number, loc: GeoLocation, id: string): string =>
  computeFestivals(year, loc, { rules: allRules(year) }).results.find((r) => r.id === id)?.date ?? "";

describe("month-end day-skip (localMidnightUTC) no longer drops festivals at positive-offset", () => {
  // All previously returned "" (silent drop) at New Delhi because the udaya/vrata
  // day was the 1st of a month, which nextLocalDayStartUTC skipped.
  it("Apara Ekadashi 2027 → Jun 1", () => {
    expect(dateOf(2027, DELHI, "ekadashi-jyeshtha-krishna")).toBe("2027-06-01");
  });
  it("Mokshada/Margashirsha-shukla Ekadashi 2025 → Dec 1", () => {
    expect(dateOf(2025, DELHI, "ekadashi-margashirsha-shukla")).toBe("2025-12-01");
  });
  it("Putrada/Shravana-shukla Ekadashi 2028 → Aug 1", () => {
    expect(dateOf(2028, DELHI, "ekadashi-shravana-shukla")).toBe("2028-08-01");
  });
  it("Maha Navami 2025 → Oct 1", () => {
    expect(dateOf(2025, DELHI, "maha-navami")).toBe("2025-10-01");
  });
});

describe("Makar Sankranti after-sunset ingress shifts to the puṇya-kāla day", () => {
  // Drik: an after-sunset Makara ingress postpones the puṇya-kāla (and the
  // observance date) to the next sunrise.
  const expected: Record<number, string> = {
    2024: "2024-01-15", // ingress after IST midnight → next day already
    2025: "2025-01-14", // daytime ingress
    2026: "2026-01-14", // daytime ingress
    2027: "2027-01-15", // ingress 21:05 IST, after 17:45 sunset → shifted
    2028: "2028-01-15", // ingress 03:18 IST → 15th already
  };
  for (const [year, date] of Object.entries(expected)) {
    it(`${year} New Delhi → ${date}`, () => {
      expect(dateOf(Number(year), DELHI, "makar-sankranti")).toBe(date);
    });
  }
});

describe("Sarva-Pitṛ (Mahālaya) Amāvāsyā is aparāhṇa-vyāpinī, not sunrise", () => {
  // Pitṛ (śrāddha) rites are performed when Amāvāsyā prevails in the afternoon.
  // In years where Amāvāsyā ends before the second day's aparāhṇa, sunrise and
  // aparāhṇa diverge; the afternoon (aparāhṇa) day is correct.
  it("2027 New Delhi → Sep 29 (aparāhṇa), not Sep 30 (sunrise)", () => {
    expect(dateOf(2027, DELHI, "amavasya-ashwina")).toBe("2027-09-29");
  });
  it("2026 New Delhi → Oct 10 (aparāhṇa and sunrise coincide)", () => {
    expect(dateOf(2026, DELHI, "amavasya-ashwina")).toBe("2026-10-10");
  });
});

describe("adhika-māsa observances land in the year's actual leap month", () => {
  it("detects the real leap month per year", () => {
    expect(adhikaMonthLabel(2026)).toBe("Adhika Jyeshtha");
    expect(adhikaMonthLabel(2029)).toBe("Adhika Chaitra");
    expect(adhikaMonthLabel(2031)).toBe("Adhika Bhadrapada");
    expect(adhikaMonthLabel(2027)).toBeNull(); // no leap month
  });

  it("2029 (Adhika Chaitra): Padminī + Paramā Ekādaśī resolve — 26 Ekādaśīs, not 24", () => {
    // Previously the leap Ekādaśīs were hardcoded to "Adhika Jyeshtha" and so
    // vanished in every year whose leap month was not Jyeṣṭha.
    const ids = ekadashiRules(2029).map((r) => r.id);
    expect(ids).toContain("ekadashi-adhika-chaitra-shukla"); // Padminī
    expect(ids).toContain("ekadashi-adhika-chaitra-krishna"); // Paramā
    const dated = new Set(
      computeFestivals(2029, DELHI, { rules: allRules(2029) }).results
        .filter((r) => r.id.startsWith("ekadashi-") && r.date)
        .map((r) => r.date),
    );
    expect(dated.size).toBe(26);
  });

  it("non-leap years emit no adhika entries at all", () => {
    expect(ekadashiRules(2027).filter((r) => /adhika/i.test(r.id))).toHaveLength(0);
  });
});
