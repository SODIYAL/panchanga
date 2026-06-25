/**
 * test/conformance-calgary.test.ts — Drik Panchang conformance for Calgary,
 * 2026 core festivals. Companion to conformance.test.ts (New Delhi).
 *
 * EXPECTED dates are transcribed from Drik Panchang's Calgary calendar
 * (geoname-id 5913490) — the authority, localised to Mountain Time. HSNA is the
 * Calgary temple, so the engine must reproduce Drik's CALGARY reckoning, which
 * is frequently one civil day earlier than New Delhi for sunrise/moonrise
 * festivals.
 *
 * Result: all 24 core festivals match Drik Panchang Calgary EXACTLY, including
 * every localised −1 shift (Holika, Hanuman Jayanti, Mesha Sankranti, Rakṣā
 * Bandhan, Janmāṣṭamī, Karva Chauth, Naraka Caturdaśī, Govardhan, Bhai Dūj,
 * Gītā Jayantī) and Navrātri Ghaṭasthāpana (Oct 11) once Navrātri was moved to
 * the udaya precedence Drik uses.
 *
 * DO NOT tune the engine to make a pinned diff pass — like its Delhi sibling,
 * this is a measuring instrument.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { CORE_RULES } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const YEAR = 2026;
// Calgary, Alberta (the HSNA temple's city). Drik Panchang geoname-id 5913490.
const CALGARY: GeoLocation = {
  latitude: 51.0447,
  longitude: -114.0719,
  timeZone: "America/Edmonton",
  elevationMeters: 1045,
};
const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
  elevationMeters: 216,
};

// Drik Panchang, Calgary, 2026 — core festivals (Smārta).
const DRIK_CALGARY: Record<string, string> = {
  "makar-sankranti": "2026-01-14",
  "vasant-panchami": "2026-01-23",
  "maha-shivratri": "2026-02-15",
  "holika-dahan": "2026-03-02",
  "holi": "2026-03-03",
  "rama-navami": "2026-03-26",
  "hanuman-jayanti": "2026-04-01",
  "mesha-sankranti": "2026-04-13",
  "akshaya-tritiya": "2026-04-19",
  "guru-purnima": "2026-07-29",
  "raksha-bandhan": "2026-08-27",
  "krishna-janmashtami": "2026-09-03", // Smārta (Drik ISKCON is 09-04)
  "ganesh-chaturthi": "2026-09-14",
  "sharadiya-navratri": "2026-10-11",
  "durga-ashtami": "2026-10-18",
  "maha-navami": "2026-10-19",
  "vijayadashami": "2026-10-20",
  "karva-chauth": "2026-10-28",
  "dhanteras": "2026-11-06",
  "naraka-chaturdashi": "2026-11-07",
  "diwali-lakshmi-puja": "2026-11-08",
  "govardhan-puja": "2026-11-09",
  "bhai-dooj": "2026-11-10",
  "gita-jayanti": "2026-12-19",
};

// Festivals the engine resolves to a ±1 neighbour of the Drik Calgary date. We
// pin the ACTUAL produced date (the `// Drik:` note gives the target), so BOTH a
// regression AND a future fix surface as a failure that must be acknowledged.
// (Currently empty — Navrātri, the prior diff, is fixed by the udaya precedence.)
const KNOWN_DIFFS: Record<string, string> = {};

const engine = new Map(
  computeFestivals(YEAR, CALGARY, { rules: CORE_RULES }).results.map((r) => [r.id, r.date]),
);
const delhi = new Map(
  computeFestivals(YEAR, NEW_DELHI, { rules: CORE_RULES }).results.map((r) => [r.id, r.date]),
);
const dayDiff = (a: string, b: string): number =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

describe("Calgary core conformance — 2026 vs Drik Panchang (geoname-id 5913490)", () => {
  for (const [id, drik] of Object.entries(DRIK_CALGARY)) {
    const pinned = KNOWN_DIFFS[id];
    it(`${id}${pinned ? " (pinned ±1 diff)" : ""} → ${pinned ?? drik}`, () => {
      expect(engine.get(id)).toBe(pinned ?? drik);
    });
  }

  it("matches Drik Panchang Calgary on every core festival", () => {
    const ids = Object.keys(DRIK_CALGARY);
    const exact = ids.filter((id) => engine.get(id) === DRIK_CALGARY[id]).length;
    expect(exact).toBe(ids.length - Object.keys(KNOWN_DIFFS).length); // 24 / 24
  });

  it("keeps every Calgary date within ±1 day of New Delhi (localisation invariant)", () => {
    const bad = Object.keys(DRIK_CALGARY)
      .map((id) => ({ id, c: engine.get(id) ?? "", d: delhi.get(id) ?? "" }))
      .filter(({ c, d }) => c && d && Math.abs(dayDiff(c, d)) > 1)
      .map(({ id, c, d }) => `${id}: Calgary ${c} vs Delhi ${d}`);
    expect(bad).toEqual([]);
  });
});
