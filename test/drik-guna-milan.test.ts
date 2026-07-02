/**
 * test/drik-guna-milan.test.ts — END-TO-END conformance of the aṣṭakūṭa
 * scorer against Drik Panchang's own Kundali Match output (the authority of
 * record; same discipline as the festival conformance suites).
 *
 * EXPECTED values are transcribed from drikpanchang.com/jyotisha/
 * horoscope-match for the exact birth inputs below (transcribed 2026-07-02).
 * The inputs were engineered mid-pada (Moon ≥1.5° from any boundary), so
 * position disagreement cannot contaminate the table comparison — and Drik's
 * displayed lunar longitudes matched the engine to the shown precision
 * (1.67° / 121.67°).
 *
 * Run 1 found two table-cell corrections the TOTAL alone would have hidden
 * (engine had Yoni Aśva×Mūṣaka = 2 and Gaṇa Deva×Rākṣasa = 1; Drik: 3 and 0 —
 * the errors cancelled to the same 20/36). Per-kūṭa pins only, never bare
 * totals.
 */
import { describe, it, expect } from "vitest";
import { handle } from "../api/_lib.js";

const NOW = { today: "2026-07-02", year: 2026 };

interface DrikRun {
  name: string;
  query: Record<string, string>;
  janma: { groom: [string, string]; bride: [string, string] }; // [nakshatra, rashi]
  kootas: Record<string, number>;
  total: number;
}

const RUNS: DrikRun[] = [
  {
    // Drik: Vara 2000-01-14 22:20 New Delhi (Aśvinī/Meṣa, lunar lon 1.67°);
    // Kanya 2000-01-23 03:10 New Delhi (Maghā/Siṁha, 121.67°). Verdict: not
    // recommended (low points + Bhakuta dosha). Total 20/36.
    name: "Run 1: Ashwini p1 × Magha p1 (Deva×Rakshasa gana, Ashwa×Mushaka yoni)",
    query: {
      groomDob: "2000-01-14", groomTob: "22:20", groomPlace: "new-delhi",
      brideDob: "2000-01-23", brideTob: "03:10", bridePlace: "new-delhi",
    },
    janma: { groom: ["Ashwini", "Mesha"], bride: ["Magha", "Simha"] },
    kootas: { Varna: 1, Vashya: 0, Tara: 3, Yoni: 3, "Graha Maitri": 5, Gana: 0, Bhakoota: 0, Nadi: 8 },
    total: 20,
  },
];

describe("Drik Panchang guna-milan conformance (per-kūṭa, transcribed fixtures)", () => {
  for (const run of RUNS) {
    it(run.name, () => {
      const r = handle("/api/guna-milan", run.query, NOW);
      expect(r.status).toBe(200);
      const b = r.body as any;
      // Janma agreement first — separates position from table disagreements.
      expect(b.gunaMilan.groom.nakshatra).toBe(run.janma.groom[0]);
      expect(b.gunaMilan.groom.rashi).toBe(run.janma.groom[1]);
      expect(b.gunaMilan.bride.nakshatra).toBe(run.janma.bride[0]);
      expect(b.gunaMilan.bride.rashi).toBe(run.janma.bride[1]);
      // Per-kūṭa pins — the actual conformance.
      for (const [koota, expected] of Object.entries(run.kootas)) {
        const got = b.gunaMilan.kootas.find((k: any) => k.koota === koota);
        expect(got, `${koota} missing`).toBeTruthy();
        expect(got.scored, `${koota}: engine ${got.scored} vs Drik ${expected}`).toBe(expected);
      }
      expect(b.gunaMilan.total).toBe(run.total);
    });
  }
});
