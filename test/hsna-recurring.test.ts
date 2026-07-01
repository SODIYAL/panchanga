/**
 * Conformance of the recurring monthly vratas (Pradoṣa, Masik Śivarātri,
 * Pūrṇimā Vrata, Amāvāsyā, minor Sankrāntis) against the HSNA 2026 calendar
 * (hsna.ca/hindu-calendar-2025, New Delhi).
 *
 * For each category we check that every HSNA date is PRODUCED by the engine
 * (set membership — the engine also emits adhika-month and ±1 neighbour dates,
 * which is fine). The handful of dates the engine does NOT reproduce are pinned
 * as `knownDiffs` — all ±1-day convention edge cases (sankrānti day-attribution
 * near midnight/dawn, the 2-day Pūrṇimā split, niśīta/pradoṣa boundaries). The
 * test fails if a pinned diff silently changes in either direction, so the list
 * stays honest.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { allRules } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
};

const { results } = computeFestivals(2026, NEW_DELHI, { rules: allRules(2026) });
const producedDates = (prefix: string): Set<string> =>
  new Set(results.filter((r) => r.id.startsWith(prefix) && r.date).map((r) => r.date));

interface Category {
  prefix: string;
  expected: string[]; // HSNA 2026 dates
  knownDiffs: string[]; // HSNA dates the engine resolves to a ±1 neighbour
}

const CATEGORIES: Record<string, Category> = {
  "Minor Sankrantis": {
    prefix: "sankranti-",
    expected: [
      "2026-02-13", "2026-03-14", "2026-05-15", "2026-06-15", "2026-07-16",
      "2026-08-16", "2026-09-16", "2026-10-17", "2026-11-16", "2026-12-16",
    ],
    knownDiffs: ["2026-03-14", "2026-08-16", "2026-09-16"],
  },
  "Masik Shivaratri": {
    prefix: "masik-shivaratri-",
    expected: [
      "2026-01-15", "2026-02-15", "2026-03-17", "2026-04-15", "2026-05-15",
      "2026-06-13", "2026-07-12", "2026-08-11", "2026-09-09", "2026-10-08", "2026-12-07",
    ],
    knownDiffs: ["2026-01-15"],
  },
  "Pradosh Vrat": {
    prefix: "pradosh-",
    expected: [
      "2026-01-01", "2026-01-15", "2026-01-30", "2026-02-14", "2026-02-28",
      "2026-03-16", "2026-03-30", "2026-04-15", "2026-04-28", "2026-05-14",
      "2026-05-28", "2026-06-12", "2026-06-27", "2026-07-12", "2026-07-26",
      "2026-08-10", "2026-08-25", "2026-09-08", "2026-09-24", "2026-10-08",
      "2026-10-23", "2026-11-06", "2026-11-22", "2026-12-06", "2026-12-21",
    ],
    knownDiffs: ["2026-01-15", "2026-02-28"],
  },
  "Purnima Vrat": {
    prefix: "purnima-vrat-",
    expected: [
      "2026-01-02", "2026-02-01", "2026-03-02", "2026-04-01", "2026-05-01",
      "2026-05-30", "2026-06-29", "2026-07-29", "2026-08-27", "2026-09-26",
      "2026-10-25", "2026-11-24", "2026-12-23",
    ],
    // Vaiśākha Pūrṇimā now resolves exactly to HSNA's 2026-05-01 (the full moon
    // rises during Pūrṇimā on May 1 at New Delhi). Before the localMidnightUTC
    // month-end-day-skip fix, Apr 30 (month-end) skipped May 1 as a candidate and
    // the vrata landed a day early — so 2026-05-01 was formerly a ±1 diff. Only
    // Āṣāḍha (engine 07-28 vs HSNA 07-29) remains a genuine ±1 edge.
    knownDiffs: ["2026-07-29"],
  },
  "Amavasya": {
    prefix: "amavasya-",
    expected: [
      "2026-01-18", "2026-02-17", "2026-04-17", "2026-05-16", "2026-06-15",
      "2026-07-14", "2026-08-12", "2026-09-11", "2026-10-10", "2026-12-08",
    ],
    knownDiffs: [],
  },
};

describe("HSNA 2026 recurring-vrata conformance", () => {
  for (const [name, c] of Object.entries(CATEGORIES)) {
    it(`${name}: matches HSNA except the pinned ±1 diffs`, () => {
      const got = producedDates(c.prefix);
      const missing = c.expected.filter((d) => !got.has(d)).sort();
      expect(missing).toEqual([...c.knownDiffs].sort());
    });
  }

  it("overall exact match rate is ≥ 85% of HSNA recurring dates", () => {
    let total = 0;
    let hit = 0;
    for (const c of Object.values(CATEGORIES)) {
      const got = producedDates(c.prefix);
      total += c.expected.length;
      hit += c.expected.filter((d) => got.has(d)).length;
    }
    expect(hit / total).toBeGreaterThanOrEqual(0.85);
  });

  // Pin the exact number of dates each category produces — membership checks
  // alone can't catch an engine that over-produces spurious dates or silently
  // drops a rule to empty. (= the rules' non-empty results; extras over the
  // HSNA list are the adhika-month entries and the ±1 neighbours of diffs.)
  it("produces exactly the expected count per category (no over/under-production)", () => {
    const PRODUCED: Record<string, number> = {
      "sankranti-": 10,
      "masik-shivaratri-": 13,
      // 26 after the localMidnightUTC month-end fix: Phālguna Śukla pradoṣa
      // (Trayodaśī ≈ Mar 1, before Holika Mar 3) was formerly dropped to (none)
      // because its Feb-28 month-end candidate skipped Mar 1; it now resolves.
      "pradosh-": 26,
      "purnima-vrat-": 13,
      "amavasya-": 13,
    };
    for (const c of Object.values(CATEGORIES)) {
      expect(producedDates(c.prefix).size).toBe(PRODUCED[c.prefix]);
    }
  });
});
