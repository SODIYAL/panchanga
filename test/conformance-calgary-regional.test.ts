/**
 * test/conformance-calgary-regional.test.ts — Drik Panchang conformance for the
 * additional regional festivals & jayantis (regionalFestivalRules), 2026.
 *
 * EXPECTED dates are from Drik Panchang's Calgary calendar (geoname-id 5913490).
 * Every one of these 21 festivals matches Drik Calgary EXACTLY — each anchored
 * on its ritual kāla: deity-birth jayantis on madhyāhna (Bhīṣma Aṣṭamī, Gaṅgā
 * Saptamī, Sītā Navamī) or pradoṣa/evening (Paraśurāma, Narasimha), tantric
 * observances on niśīta (Kālī Chaudas, Kālabhairava), snāna/vrata rites at
 * sunrise, the full-moon vrata at moonrise, Vishwakarma on the Kanya Saṅkrānti
 * day, plus the two special selectors — Onam (Śravaṇa nakṣatra in Siṃha) and
 * Varalakṣmī (the Friday before Śrāvaṇa Pūrṇimā).
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { allRules } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const CALGARY: GeoLocation = {
  latitude: 51.0447,
  longitude: -114.0719,
  timeZone: "America/Edmonton",
  elevationMeters: 1045,
};

const DRIK_CALGARY: Record<string, string> = {
  "ratha-saptami": "2026-01-25",
  "bhishma-ashtami": "2026-01-25",
  "gangaur": "2026-03-21",
  "yamuna-chhath": "2026-03-23",
  "swaminarayan-jayanti": "2026-03-26",
  "parashurama-jayanti": "2026-04-18",
  "ganga-saptami": "2026-04-22",
  "sita-navami": "2026-04-24",
  "narasimha-jayanti": "2026-04-29",
  "vat-savitri-vrat": "2026-05-16",
  "shani-jayanti": "2026-05-16",
  "vat-purnima-vrat": "2026-06-28",
  "radha-ashtami": "2026-09-18",
  "ganesh-visarjan": "2026-09-25",
  "vishwakarma-puja": "2026-09-16",
  "govatsa-dwadashi": "2026-11-05",
  "kali-chaudas": "2026-11-06",
  "kalabhairav-jayanti": "2026-11-30",
  "vivah-panchami": "2026-12-13",
  // Special selectors: nakṣatra-anchored (Onam) and weekday-anchored (Varalakṣmī).
  "onam": "2026-08-26", // Śravaṇa (Thiruvoṇam) nakṣatra, Sun in Siṃha
  "varalakshmi-vrat": "2026-08-21", // Friday before Śrāvaṇa Pūrṇimā (Aug 27)
};

// Compute with the full rule set so cross-referencing rules resolve (Varalakṣmī
// is anchored on the Śrāvaṇa-Pūrṇimā rule from a different generator).
const engine = new Map(
  computeFestivals(2026, CALGARY, { rules: allRules(2026) }).results.map((r) => [r.id, r.date]),
);

describe("Calgary regional-festival conformance — 2026 vs Drik Panchang (geoname-id 5913490)", () => {
  for (const [id, drik] of Object.entries(DRIK_CALGARY)) {
    it(`${id} → ${drik}`, () => {
      expect(engine.get(id)).toBe(drik);
    });
  }

  it("every regional festival resolves and matches Drik Calgary exactly (21/21)", () => {
    const ids = Object.keys(DRIK_CALGARY);
    const exact = ids.filter((id) => engine.get(id) === DRIK_CALGARY[id]).length;
    expect(exact).toBe(ids.length);
  });
});
