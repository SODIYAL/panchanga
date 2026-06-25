/**
 * test/conformance-calgary-vratas.test.ts — Calgary conformance across ALL the
 * recurring vratas, not just the 24 core festivals (see conformance-calgary.ts).
 *
 * Covers every recurring category the engine generates: Ekādaśī, Saṅkaṣṭī
 * Caturthī, Pradoṣa, Masik Śivarātri, Pūrṇimā Vrata, Amāvāsyā, and the minor
 * Saṅkrāntis — 114 rules for 2026.
 *
 * What this asserts:
 *  1. EXTERNAL CONFORMANCE — Ekādaśī dates taken directly from Drik Panchang's
 *     Calgary calendar (geoname-id 5913490) match the engine, including the
 *     localised −1 shift of Devshayani Ekādaśī (Jul 24 vs New Delhi's Jul 25).
 *  2. LOCALISATION INVARIANT — every dated vrata is within ±1 day of its New
 *     Delhi date. Saṅkaṣṭī (a moonrise vrata) legitimately shifts BOTH ways, so
 *     the bound is |Δ| ≤ 1, not Δ ≤ 0.
 *  3. COVERAGE per category — pinned, including the two Masik Śivarātri entries
 *     that resolve to NO date at Calgary (a known localisation gap: the Kṛṣṇa
 *     Caturdaśī ends ~1 h before Calgary's niśīta window on every candidate day,
 *     and the tithi-pervasion selector has no fallback).
 *  4. GOLDEN REGRESSION — the full Calgary vrata set is pinned to the fixture,
 *     and a per-category Delhi↔Calgary shift summary is printed.
 *
 * Like its siblings, this is a measuring instrument — do NOT tune the engine to
 * make it pass.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { allRules } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";
import FIXTURE from "./fixtures/2026-calgary-vratas.json";

const YEAR = 2026;

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

// Categories the engine generates, with the per-category Calgary-dated count
// pinned (113 total dated; 2 Masik Śivarātri are the known niśīta gap).
const CATEGORIES: { prefix: string; name: string; dated: number }[] = [
  { prefix: "ekadashi-", name: "Ekadashi", dated: 26 },
  { prefix: "sankashti-chaturthi-", name: "Sankashti Chaturthi", dated: 13 },
  { prefix: "pradosh-", name: "Pradosh Vrat", dated: 26 },
  { prefix: "masik-shivaratri-", name: "Masik Shivaratri", dated: 11 },
  { prefix: "purnima-vrat-", name: "Purnima Vrat", dated: 13 },
  { prefix: "amavasya-", name: "Amavasya", dated: 13 },
  { prefix: "sankranti-", name: "Minor Sankranti", dated: 10 },
];

// ── Fixture extraction ──

interface ConfirmedEntry {
  name: string;
  date: string;
  delhi: string;
  note?: string;
  source: string;
}
const F = FIXTURE as Record<string, unknown>;
const CONFIRMED = F._drik_calgary_confirmed as Record<string, ConfirmedEntry>;
const CALGARY_UNDATED = F._calgary_undated as string[];
const goldenEntries = Object.entries(F).filter(
  ([k, v]) => !k.startsWith("_") && typeof v === "string",
) as [string, string][];

// ── Compute once, both locations ──

const rules = allRules(YEAR);
const cal = new Map(computeFestivals(YEAR, CALGARY, { rules }).results.map((r) => [r.id, r.date]));
const del = new Map(computeFestivals(YEAR, NEW_DELHI, { rules }).results.map((r) => [r.id, r.date]));

const vratIds = rules.map((r) => r.id).filter((id) => CATEGORIES.some((c) => id.startsWith(c.prefix)));
const dayDiff = (a: string, b: string): number =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

describe("Calgary vrata conformance — 2026 (Drik Panchang Calgary, geoname-id 5913490)", () => {
  // 1. EXTERNAL CONFORMANCE: Ekādaśī anchors from Drik Panchang Calgary.
  describe("matches Drik Panchang's Calgary calendar on externally-confirmed vratas", () => {
    for (const [id, entry] of Object.entries(CONFIRMED)) {
      const shift = dayDiff(entry.date, entry.delhi);
      const label = shift === 0 ? "no shift vs Delhi" : `localised ${shift > 0 ? "+" : ""}${shift}d vs Delhi`;
      it(`${entry.name} (${id}) → ${entry.date} (${label})`, () => {
        expect(cal.get(id)).toBe(entry.date);
      });
    }
  });

  // 2. LOCALISATION INVARIANT: every dated vrata within ±1 day of New Delhi.
  it("keeps every vrata within ±1 day of New Delhi (Sankashti may shift either way)", () => {
    const violations = vratIds
      .map((id) => ({ id, c: cal.get(id) ?? "", d: del.get(id) ?? "" }))
      .filter(({ c, d }) => c && d && Math.abs(dayDiff(c, d)) > 1)
      .map(({ id, c, d }) => `${id}: Calgary ${c} vs Delhi ${d}`);
    expect(violations).toEqual([]);
  });

  // 3. COVERAGE per category, with the known Calgary niśīta gap pinned.
  describe("coverage per category at Calgary", () => {
    for (const c of CATEGORIES) {
      it(`${c.name}: ${c.dated} dated`, () => {
        const dated = vratIds.filter((id) => id.startsWith(c.prefix) && cal.get(id));
        expect(dated.length).toBe(c.dated);
      });
    }
    it("the only undated Calgary vratas are the pinned niśīta gap", () => {
      const undated = vratIds.filter((id) => !cal.get(id)).sort();
      expect(undated).toEqual([...CALGARY_UNDATED].sort());
    });
  });

  // 4. GOLDEN REGRESSION + printed per-category shift summary.
  it("matches the pinned Calgary vrata fixture and prints the shift summary", () => {
    expect(goldenEntries.length).toBe(vratIds.length); // fixture covers every rule

    const perCat: Record<string, { shifted: number; total: number }> = {};
    for (const [id, golden] of goldenEntries) {
      expect(cal.get(id) ?? "", `Calgary ${id} drifted from the pinned fixture`).toBe(golden);
      const cat = CATEGORIES.find((c) => id.startsWith(c.prefix))!.name;
      const c = cal.get(id) ?? "";
      const d = del.get(id) ?? "";
      const shifted = c && d && dayDiff(c, d) !== 0 ? 1 : 0;
      perCat[cat] ??= { shifted: 0, total: 0 };
      perCat[cat].shifted += shifted;
      perCat[cat].total += 1;
    }

    console.log("");
    console.log("══════════════════════════════════════════════════════════════════");
    console.log("  CALGARY 2026 — vrata localisation vs New Delhi (Δ ≠ 0 / total)");
    console.log("══════════════════════════════════════════════════════════════════");
    for (const c of CATEGORIES) {
      const s = perCat[c.name];
      console.log(`    ${c.name.padEnd(22)} ${s.shifted}/${s.total} localised`);
    }
    console.log("══════════════════════════════════════════════════════════════════");
    console.log("");
  });
});
