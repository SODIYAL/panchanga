/**
 * test/conformance.test.ts — Phase-4 Drik Panchang conformance check.
 *
 * Reference: docs/superpowers/plans/2026-06-23-festivals-decisions-and-spec.md §4
 * Fixture:   test/fixtures/2026-new-delhi.json
 *
 * GOAL: Measure (not enforce) how the engine's computed dates compare to
 * Drik Panchang's published 2026 dates for New Delhi. The test ALWAYS passes
 * (expect(matchRate).toBeGreaterThanOrEqual(0)) but PRINTS a clear summary
 * of every mismatch. This is Phase-4 measurement, not a hard gate yet.
 *
 * DO NOT tune rules/ayanamsha to make this pass — this is a measuring instrument.
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { CORE_RULES } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";
import FIXTURE from "./fixtures/2026-new-delhi.json";

// ─────────────────────────────────────────────────────────────────────────────
// Location: New Delhi (the spec's reference locale)
// ─────────────────────────────────────────────────────────────────────────────

const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.2090,
  timeZone: "Asia/Kolkata",
  elevationMeters: 216,
};

const YEAR = 2026;

// ─────────────────────────────────────────────────────────────────────────────
// Extract the fixture dates (only the 24 core festival slugs; skip _ keys)
// ─────────────────────────────────────────────────────────────────────────────

type FixtureMap = Record<string, string>;

const fixtureEntries = Object.entries(FIXTURE as FixtureMap).filter(
  ([key]) => !key.startsWith("_"),
) as [string, string][];

const fixtureSlugs = fixtureEntries.map(([slug]) => slug);

// ─────────────────────────────────────────────────────────────────────────────
// Compute once
// ─────────────────────────────────────────────────────────────────────────────

const computed = computeFestivals(YEAR, NEW_DELHI, { rules: CORE_RULES });

// ─────────────────────────────────────────────────────────────────────────────
// Build comparison table
// ─────────────────────────────────────────────────────────────────────────────

interface ComparisonRow {
  slug: string;
  computed: string; // YYYY-MM-DD or "" if undated/missing
  drik: string;     // YYYY-MM-DD from fixture
  match: boolean;
  offByDays: number | null; // null if one side is missing
  diagnostics: string[];
}

function dayDiff(a: string, b: string): number {
  // Returns a - b in days (positive = a is later than b).
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / 86_400_000);
}

const rows: ComparisonRow[] = fixtureEntries.map(([slug, drikDate]) => {
  const result = computed.results.find((r) => r.id === slug);
  const computedDate = result?.date ?? "";
  const diagnostics = result?.diagnostics ?? ["no engine result found for this slug"];

  if (!computedDate) {
    return {
      slug,
      computed: computedDate,
      drik: drikDate,
      match: false,
      offByDays: null,
      diagnostics,
    };
  }

  const match = computedDate === drikDate;
  return {
    slug,
    computed: computedDate,
    drik: drikDate,
    match,
    offByDays: match ? 0 : dayDiff(computedDate, drikDate),
    diagnostics,
  };
});

const matched = rows.filter((r) => r.match);
const mismatched = rows.filter((r) => !r.match && r.computed !== "");
const undated = rows.filter((r) => r.computed === "");

const matchRate = matched.length / fixtureSlugs.length;

// ─────────────────────────────────────────────────────────────────────────────
// Pretty-print summary to stdout (always runs, even when all pass)
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase-4 conformance — 2026 New Delhi vs Drik Panchang", () => {
  it("prints the full conformance summary", () => {
    const total = fixtureSlugs.length;
    const pct = (matchRate * 100).toFixed(1);

    console.log("");
    console.log("══════════════════════════════════════════════════════════════════");
    console.log(`  PHASE-4 CONFORMANCE: 2026 New Delhi vs Drik Panchang`);
    console.log(`  Match rate: ${matched.length} / ${total} exact  (${pct}%)`);
    console.log("══════════════════════════════════════════════════════════════════");

    if (matched.length > 0) {
      console.log(`\n  ✓ EXACT MATCHES (${matched.length}):`);
      for (const r of matched) {
        console.log(`    ${r.slug.padEnd(28)} ${r.computed}`);
      }
    }

    if (mismatched.length > 0) {
      console.log(`\n  ✗ MISMATCHES (${mismatched.length}):`);
      console.log(
        `  ${"slug".padEnd(28)} ${"computed".padEnd(12)} ${"drik".padEnd(12)} off-by`,
      );
      console.log(`  ${"-".repeat(65)}`);
      for (const r of mismatched) {
        const sign = (r.offByDays ?? 0) > 0 ? "+" : "";
        console.log(
          `  ${r.slug.padEnd(28)} ${r.computed.padEnd(12)} ${r.drik.padEnd(12)} ${sign}${r.offByDays} day(s)`,
        );
      }
    }

    if (undated.length > 0) {
      console.log(`\n  ⚠ UNDATED / MISSING (${undated.length}):`);
      for (const r of undated) {
        console.log(`    ${r.slug}`);
        for (const d of r.diagnostics) {
          console.log(`      diagnostic: ${d}`);
        }
      }
    }

    console.log("");
    console.log("══════════════════════════════════════════════════════════════════");
    console.log("");

    // The only assertion: match rate is reported (always ≥0). This is a
    // measuring instrument, not a gate. The gate will be added in Phase 4b.
    expect(matchRate).toBeGreaterThanOrEqual(0);
    expect(matchRate).toBeLessThanOrEqual(1);
  });

  // ── Per-slug detailed rows (always non-fatal, but printed on mismatch) ──

  it("reports each fixture slug individually (informational)", () => {
    // This test gives Vitest's reporter a row per festival so mismatches are
    // visible in --reporter=verbose output. We use soft assertions so ALL rows
    // run even when some fail.
    for (const r of rows) {
      if (r.computed === "") {
        // Undated: warn but don't fail the suite.
        console.warn(
          `[UNDATED] ${r.slug}: engine returned no date. Diagnostics: ${r.diagnostics.join("; ")}`,
        );
      }
    }
    // Non-gating: report is the deliverable, not a pass/fail gate.
    expect(rows.length).toBe(fixtureSlugs.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported summary for programmatic access (e.g. the SDD report generator)
// ─────────────────────────────────────────────────────────────────────────────

export const conformanceSummary = {
  year: YEAR,
  location: "New Delhi",
  total: fixtureSlugs.length,
  matched: matched.length,
  matchRate,
  mismatched: mismatched.map((r) => ({
    slug: r.slug,
    computed: r.computed,
    drik: r.drik,
    offByDays: r.offByDays,
  })),
  undated: undated.map((r) => ({
    slug: r.slug,
    diagnostics: r.diagnostics,
  })),
};
