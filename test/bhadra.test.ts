/**
 * Tests for the Bhadra (Viṣṭi) Mukha/Pucchā split + Vāsa — `bhadraSplit`
 * (src/elements.ts) and its wiring into the festival evaluator
 * (src/festivals.ts).
 *
 * Convention (Muhūrta-Chintāmaṇi, as Drik Panchang displays it): Mukha = the
 * leading 1/6 of the Viṣṭi span (5 of a 30-ghaṭī karaṇa); Pucchā = the trailing
 * 1/10 (3 ghaṭī). Vāsa from the Moon's rāśi at Bhadra's start — svarga for
 * Meṣa/Vṛṣabha/Mithuna/Vṛścika, pātāla for Kanyā/Tulā/Dhanu/Makara, pṛthvī for
 * Karka/Siṃha/Kumbha/Mīna. The vāsa check below re-derives that verse
 * independently, so it is not circular with the table in the source.
 */

import { describe, it, expect } from "vitest";
import { Body } from "astronomy-engine";
import { siderealLongitude } from "../src/ayanamsha.js";
import { bhadraIntervals, bhadraSplit } from "../src/elements.js";
import { computeFestival } from "../src/festivals.js";
import { CORE_RULES } from "../src/rules.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
};

/** The classical verse, re-expressed independently of the source table. */
function expectedVasa(rashi: number): "svarga" | "prithvi" | "patala" {
  const svarga = [0, 1, 2, 7]; // Meṣa, Vṛṣabha, Mithuna, Vṛścika
  const patala = [5, 6, 8, 9]; // Kanyā, Tulā, Dhanu, Makara
  return svarga.includes(rashi) ? "svarga" : patala.includes(rashi) ? "patala" : "prithvi";
}

describe("bhadraSplit — Mukha (leading 1/6) and Pucchā (trailing 1/10)", () => {
  it("anchors Mukha at Bhadra's start and Pucchā at its end with the right proportions", () => {
    const iv = bhadraIntervals(new Date("2026-03-02T12:00:00Z"))[0];
    const span = iv.end.getTime() - iv.start.getTime();
    const d = bhadraSplit(iv);

    expect(d.mukha.start.getTime()).toBe(iv.start.getTime());
    expect(d.puccha.end.getTime()).toBe(iv.end.getTime());
    expect(Math.abs((d.mukha.end.getTime() - d.mukha.start.getTime()) - span / 6)).toBeLessThan(2);
    expect(Math.abs((d.puccha.end.getTime() - d.puccha.start.getTime()) - span / 10)).toBeLessThan(2);
    // for a normal Bhadra the two sub-windows are disjoint (Mukha well before Pucchā)
    expect(d.mukha.end.getTime()).toBeLessThan(d.puccha.start.getTime());
  });
});

describe("bhadraSplit — Vāsa from the Moon's rāśi (classical verse)", () => {
  it("matches the verse across many Bhadras in 2026 and covers more than one loka", () => {
    // Collect distinct Bhadra intervals across the year.
    const anchors = ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"].map(
      (s) => new Date(`${s}T12:00:00Z`),
    );
    const byStart = new Map<number, { start: Date; end: Date }>();
    for (const a of anchors) {
      for (const iv of bhadraIntervals(a)) byStart.set(Math.round(iv.start.getTime() / 1000), iv);
    }
    const intervals = [...byStart.values()];
    expect(intervals.length).toBeGreaterThan(4);

    const seenVasa = new Set<string>();
    for (const iv of intervals) {
      const d = bhadraSplit(iv);
      const rashi = Math.floor(siderealLongitude(iv.start, Body.Moon) / 30) % 12;
      expect(d.moonRashi).toBe(rashi);
      expect(d.vasa).toBe(expectedVasa(rashi));
      seenVasa.add(d.vasa);
    }
    expect(seenVasa.size).toBeGreaterThanOrEqual(2);
  });
});

describe("festival wiring — Bhadra-day festivals surface Mukha/Pucchā/Vāsa", () => {
  it("Rakṣā Bandhan 2025 (Bhadra on the observance day) emits the split in instants", () => {
    const rule = CORE_RULES.find((r) => r.id === "raksha-bandhan")!;
    const res = computeFestival(rule, 2025, NEW_DELHI);

    expect(["svarga", "prithvi", "patala"]).toContain(res.instants.bhadraVasa);
    for (const k of ["bhadraMukhaStart", "bhadraMukhaEnd", "bhadraPucchaStart", "bhadraPucchaEnd"]) {
      expect(res.instants[k]).toBeDefined();
    }
    const bStart = new Date(res.instants.bhadraStart).getTime();
    const bEnd = new Date(res.instants.bhadraEnd).getTime();
    const mukhaStart = new Date(res.instants.bhadraMukhaStart).getTime();
    const pucchaEnd = new Date(res.instants.bhadraPucchaEnd).getTime();
    const pucchaStart = new Date(res.instants.bhadraPucchaStart).getTime();
    // Mukha opens Bhadra; Pucchā closes it; Pucchā is the trailing slice.
    expect(mukhaStart).toBe(bStart);
    expect(pucchaEnd).toBe(bEnd);
    expect(pucchaStart).toBeGreaterThan(mukhaStart);
  });
});
