/**
 * test/conformance-calgary.test.ts — Drik Panchang conformance for Calgary.
 *
 * Companion to conformance.test.ts (New Delhi). HSNA is the Calgary Hindu
 * temple, so the engine must localise correctly to Calgary (Mountain Time,
 * ~12.5 h behind IST, 51°N) — not just reproduce the Indian reckoning. Calgary
 * is far enough west that sunrise/moonrise-selected festivals frequently fall
 * one civil day EARLIER than New Delhi; a correct engine must reproduce those
 * shifts, and reproduce them the way Drik Panchang's Calgary calendar does.
 *
 * What this asserts (gating, unlike the Delhi measurement test):
 *  1. EXTERNAL CONFORMANCE — the four festivals whose Calgary dates were taken
 *     directly from Drik Panchang's Calgary calendar (geoname-id 5913490),
 *     including the localised −1 shifts of Rakṣā Bandhan, Janmāṣṭamī and Karva
 *     Chauth, match the engine exactly. These are the hard external anchors.
 *  2. COVERAGE — every core festival resolves to a date at Calgary.
 *  3. LOCALISATION BOUND — every Calgary date is within ±1 day of the same
 *     festival's New Delhi date (the tithi instants are global; only the local
 *     day-assignment can move, and by at most one day). Also prints the full
 *     Delhi↔Calgary shift table.
 *  4. GOLDEN REGRESSION — the full Calgary core set is pinned to the fixture so
 *     any future drift in localisation surfaces as a failure to acknowledge.
 *
 * DO NOT tune rules/ayanamsha to make this pass — like its Delhi sibling, this
 * is a measuring instrument first.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { CORE_RULES } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";
import CALGARY_FIXTURE from "./fixtures/2026-calgary.json";

const YEAR = 2026;

// Calgary, Alberta (the HSNA temple's city). Drik Panchang geoname-id 5913490.
const CALGARY: GeoLocation = {
  latitude: 51.0447,
  longitude: -114.0719,
  timeZone: "America/Edmonton",
  elevationMeters: 1045,
};

// New Delhi — the same reference locale as conformance.test.ts, used here only
// to measure the localisation delta (engine-vs-engine, isolating the location).
const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
  elevationMeters: 216,
};

// ── Fixture: the four Drik-Calgary-confirmed anchors, and the golden slug map ──

interface ConfirmedEntry {
  date: string;
  delhi: string;
  note?: string;
  source: string;
}
const CONFIRMED = (CALGARY_FIXTURE as Record<string, unknown>)
  ._drik_calgary_confirmed as Record<string, ConfirmedEntry>;

const goldenEntries = Object.entries(CALGARY_FIXTURE as Record<string, unknown>).filter(
  ([k, v]) => !k.startsWith("_") && typeof v === "string",
) as [string, string][];

// ── Compute once, both locations ──

const calgary = computeFestivals(YEAR, CALGARY, { rules: CORE_RULES }).results;
const delhi = computeFestivals(YEAR, NEW_DELHI, { rules: CORE_RULES }).results;

const calDate = (id: string): string => calgary.find((r) => r.id === id)?.date ?? "";
const delDate = (id: string): string => delhi.find((r) => r.id === id)?.date ?? "";

const dayDiff = (a: string, b: string): number =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

describe("Calgary conformance — 2026 vs Drik Panchang (Calgary, geoname-id 5913490)", () => {
  // 1. EXTERNAL CONFORMANCE: the four anchors sourced from Drik Panchang Calgary.
  describe("matches Drik Panchang's Calgary calendar on the externally-confirmed dates", () => {
    for (const [id, entry] of Object.entries(CONFIRMED)) {
      const shift = dayDiff(entry.date, entry.delhi);
      const label = shift === 0 ? "no shift vs Delhi" : `localised ${shift > 0 ? "+" : ""}${shift}d vs Delhi`;
      it(`${id} → ${entry.date} (${label})`, () => {
        expect(calDate(id)).toBe(entry.date);
      });
    }
  });

  // 2. COVERAGE: every core festival resolves at Calgary.
  it("resolves every core festival at Calgary (full coverage)", () => {
    const undated = CORE_RULES.map((r) => r.id).filter((id) => calDate(id) === "");
    expect(undated).toEqual([]);
  });

  // 3. LOCALISATION BOUND: Calgary within ±1 day of New Delhi for every festival.
  it("keeps every Calgary date within ±1 day of New Delhi (localisation invariant)", () => {
    const violations = CORE_RULES.map((r) => r.id)
      .map((id) => ({ id, c: calDate(id), d: delDate(id) }))
      .filter(({ c, d }) => c && d && Math.abs(dayDiff(c, d)) > 1)
      .map(({ id, c, d }) => `${id}: Calgary ${c} vs Delhi ${d}`);
    expect(violations).toEqual([]);
  });

  // 4. GOLDEN REGRESSION: pin the full Calgary core set + print the shift table.
  it("matches the pinned Calgary fixture and prints the Delhi↔Calgary shift table", () => {
    let shifted = 0;
    const rows: string[] = [];
    for (const [id, golden] of goldenEntries) {
      const c = calDate(id);
      const d = delDate(id);
      const diff = c && d ? dayDiff(c, d) : null;
      if (diff !== null && diff !== 0) shifted++;
      const mark = diff === 0 || diff === null ? "" : `  (${diff > 0 ? "+" : ""}${diff}d vs Delhi)`;
      rows.push(`    ${id.padEnd(24)} ${c}${mark}`);
      expect(c, `Calgary ${id} drifted from the pinned fixture`).toBe(golden);
    }
    console.log("");
    console.log("══════════════════════════════════════════════════════════════════");
    console.log(`  CALGARY 2026 — core festivals (${shifted}/${goldenEntries.length} localised off New Delhi)`);
    console.log("══════════════════════════════════════════════════════════════════");
    console.log(rows.join("\n"));
    console.log("══════════════════════════════════════════════════════════════════");
    console.log("");
  });
});
