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

describe("Vat Sāvitrī / Shani Jayanti use daytime-vyāpti (day Amāvāsyā prevails through daylight)", () => {
  // Not pitṛ rites: day-long observances on the day whose daylight holds the
  // larger portion of Jyeṣṭha Amāvāsyā. A plain sunrise rule mis-dated the year
  // where Amāvāsyā ends mid-morning (2025 New Delhi), and an aparāhṇa rule
  // mis-selected at far-western longitudes (Calgary, where the late-afternoon
  // window clips only the start of an evening-beginning Amāvāsyā).
  it("2025 New Delhi → May 26 (Amāvāsyā fills the afternoon), not May 27", () => {
    expect(dateOf(2025, DELHI, "vat-savitri-vrat")).toBe("2025-05-26");
    expect(dateOf(2025, DELHI, "shani-jayanti")).toBe("2025-05-26");
  });
  it("2024 New Delhi → Jun 6 (= Drik)", () => {
    expect(dateOf(2024, DELHI, "vat-savitri-vrat")).toBe("2024-06-06");
  });
});

describe("Lahiri realization is Swiss-Ephemeris-aligned (O4 recalibration)", () => {
  // The anchor 23.8570923° + IAU 2006 precession matches Swiss Ephemeris
  // SE_SIDM_LAHIRI (≡ Drik Panchang) to < 0.05″ over 1900–2200. The decisive
  // conformance datum: Drik lists 2031 London Makar Saṅkrānti on Jan 15; the
  // pre-calibration model (23.853222° + IAU 1976, −13.9″ off) produced Jan 14.
  const LONDON: GeoLocation = { latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" };
  const SYDNEY: GeoLocation = { latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" };

  it("2031 London Makar Saṅkrānti → Jan 15 (= Drik, verified 2026-07-02)", () => {
    expect(dateOf(2031, LONDON, "makar-sankranti")).toBe("2031-01-15");
  });
  it("2031 London Lohri (Makar − 1) follows → Jan 14", () => {
    expect(dateOf(2031, LONDON, "lohri")).toBe("2031-01-14");
  });
  it("2031 Sydney Mithuna Saṅkrānti → Jun 16 (Swiss-aligned; same calibration)", () => {
    expect(dateOf(2031, SYDNEY, "sankranti-mithuna")).toBe("2031-06-16");
  });
  // The validated envelope must not move: the audit showed every 2024–2030
  // Makara ingress sits > 6 min from a date boundary at the tested cities.
  it("Makar Saṅkrānti 2024–2028 New Delhi dates unchanged by the recalibration", () => {
    expect(dateOf(2024, DELHI, "makar-sankranti")).toBe("2024-01-15");
    expect(dateOf(2025, DELHI, "makar-sankranti")).toBe("2025-01-14");
    expect(dateOf(2026, DELHI, "makar-sankranti")).toBe("2026-01-14");
    expect(dateOf(2027, DELHI, "makar-sankranti")).toBe("2027-01-15");
    expect(dateOf(2028, DELHI, "makar-sankranti")).toBe("2028-01-15");
  });
});

describe("Holika Dahan / Rakhi Bhadra day-retention (KNOWN_ISSUES O2, resolved)", () => {
  // The classical rule: a wholly-Bhadra-covered window keeps its own day when
  // Bhadra clears before the rite's deadline — MIDNIGHT for the Holikā night
  // fire, PRADOṢA-END for daytime Rakhi — and shifts to the Bhadra-free udaya
  // day only when Bhadra outlasts the deadline.
  // Drik-verified: Holika 2023 Mar 7 (Bhadra past midnight → shift),
  // 2024 Mar 24 (ends 23:14 → retain), 2025 Mar 13 (23:28 → retain),
  // 2026 Mar 3 (past midnight → shift; conformance-pinned);
  // Rakhi 2023 Aug 30 (Bhadra 21:02 < pradoṣa-end 21:18 → retain),
  // 2026 Aug 28 (21:33 > 21:22 → shift; conformance-pinned).
  it("Holika Dahan Delhi: 2023–2027 & 2031", () => {
    expect(dateOf(2023, DELHI, "holika-dahan")).toBe("2023-03-07");
    expect(dateOf(2024, DELHI, "holika-dahan")).toBe("2024-03-24"); // was Mar 25 (bug)
    expect(dateOf(2025, DELHI, "holika-dahan")).toBe("2025-03-13"); // was Mar 14 (bug)
    expect(dateOf(2026, DELHI, "holika-dahan")).toBe("2026-03-03");
    expect(dateOf(2027, DELHI, "holika-dahan")).toBe("2027-03-22"); // Bhadra to 05:16 → shift
    expect(dateOf(2031, DELHI, "holika-dahan")).toBe("2031-03-08"); // Bhadra to 22:01 → retain
  });
  it("Raksha Bandhan Delhi: 2023 & 2026–2032", () => {
    expect(dateOf(2023, DELHI, "raksha-bandhan")).toBe("2023-08-30"); // was Aug 31 (bug)
    expect(dateOf(2026, DELHI, "raksha-bandhan")).toBe("2026-08-28");
    expect(dateOf(2027, DELHI, "raksha-bandhan")).toBe("2027-08-17"); // Bhadra 23:45 > pradoṣa-end
    expect(dateOf(2029, DELHI, "raksha-bandhan")).toBe("2029-08-23"); // 19:02 < 21:27 → retain
    expect(dateOf(2031, DELHI, "raksha-bandhan")).toBe("2031-08-02"); // 21:10 < 21:53 → retain
    expect(dateOf(2032, DELHI, "raksha-bandhan")).toBe("2032-08-20"); // 21:15 < 21:31 → retain
  });
});

describe("Durga Ashtami udaya precedence (KNOWN_ISSUES O1, resolved)", () => {
  // Unified with maha-navami's udaya. The policies diverge only in 2028, where
  // published India dates (mpanchang/hindusphere, Drik-derived) give Ashtami
  // Sep 26 + Navami Sep 27 — the udaya reading (max-window-fraction gave Sep 25).
  it("2028 New Delhi: Ashtami Sep 26, Navami Sep 27, Dussehra Sep 27–28 window", () => {
    expect(dateOf(2028, DELHI, "durga-ashtami")).toBe("2028-09-26");
    expect(dateOf(2028, DELHI, "maha-navami")).toBe("2028-09-27");
  });
  it("2024–2027 unchanged by the unification", () => {
    expect(dateOf(2024, DELHI, "durga-ashtami")).toBe("2024-10-11");
    expect(dateOf(2025, DELHI, "durga-ashtami")).toBe("2025-09-30");
    expect(dateOf(2026, DELHI, "durga-ashtami")).toBe("2026-10-19");
    expect(dateOf(2027, DELHI, "durga-ashtami")).toBe("2027-10-07");
  });
});
