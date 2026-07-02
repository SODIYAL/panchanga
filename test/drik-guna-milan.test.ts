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
  {
    // Drik: Vara 2000-01-17 18:00 New Delhi (Rohiṇī/Vṛṣabha, 41.66°);
    // Kanya 2000-01-27 13:55 New Delhi (Citrā/Tulā, 181.64°). Total 20/36,
    // Bhakuta dosha verdict. Cell-for-cell agreement with the engine's
    // tables — notably pins Gaṇa Manuṣya-groom × Rākṣasa-bride = 0 (the
    // "2 points" variant published elsewhere is NOT Drik's), Vaśya
    // Chatuṣpada×Mānava = 1, and Yoni Sarpa×Vyāghra = 2.
    // (Drik labels the tārās "Kshema/Pratyaka" where our count arithmetic
    // names them differently, but the awarded POINTS agree in every fixture
    // so far — scores, not labels, are what we pin.)
    name: "Run 2: Rohini p1 × Chitra p3 (Manushya×Rakshasa gana, half-sign vashya rows)",
    query: {
      groomDob: "2000-01-17", groomTob: "18:00", groomPlace: "new-delhi",
      brideDob: "2000-01-27", brideTob: "13:55", bridePlace: "new-delhi",
    },
    janma: { groom: ["Rohini", "Vrishabha"], bride: ["Chitra", "Tula"] },
    kootas: { Varna: 1, Vashya: 1, Tara: 3, Yoni: 2, "Graha Maitri": 5, Gana: 0, Bhakoota: 0, Nadi: 8 },
    total: 20,
  },
  {
    // Drik: Vara 2000-01-05 06:50 New Delhi (Mūla/Dhanu, 241.67°); Kanya
    // 2000-01-09 04:35 New Delhi (Śravaṇa/Makara, 288.31°). Total 17/36,
    // Bhakuta dosha verdict. Cell-for-cell agreement, pinning FOUR
    // previously untested cells at once:
    //  • Vaśya half-sign splits (Dhanu 1st half → Mānava; Makara 2nd half →
    //    Jalacara) AND the Mānava×Jalacara = 0.5 cell.
    //  • Graha-Maitrī both-neutral (Jupiter/Saturn) = 3.
    //  • Gaṇa Rākṣasa-groom × Deva-bride = 1.
    //  • Tārā scoring on a one-direction-malefic case: 1.5 (girl→boy count
    //    25 ≡ 7 Vadha) — Drik's own labels ("Janma/Kshema") are both benefic
    //    names yet they award 1.5, confirming labels are display quirks and
    //    POINTS are the conformance target.
    name: "Run 3: Mula p1 × Shravana p3 (half-sign vashya, N/N maitri, Rak×Deva gana)",
    query: {
      groomDob: "2000-01-05", groomTob: "06:50", groomPlace: "new-delhi",
      brideDob: "2000-01-09", brideTob: "04:35", bridePlace: "new-delhi",
    },
    janma: { groom: ["Mula", "Dhanu"], bride: ["Shravana", "Makara"] },
    kootas: { Varna: 1, Vashya: 0.5, Tara: 1.5, Yoni: 2, "Graha Maitri": 3, Gana: 1, Bhakoota: 0, Nadi: 8 },
    total: 17,
  },
  {
    // Drik: Vara 2000-01-14 22:20 MUMBAI (Aśvinī/Meṣa, 1.67° — same Moon as
    // Run 1's New Delhi groom: geocentric, location-independent); Kanya
    // 2000-01-15 21:25 New Delhi (Bharaṇī/Meṣa, 14.99°). Total 34/36,
    // "Union is Excellent". Cell-for-cell agreement, newly pinning Yoni
    // Aśva×Gaja = 2 and Gaṇa Deva-groom × Mānava-bride = 6, plus same-rāśi
    // Bhakūṭa = 7 and same-class Vaśya = 2.
    name: "Run 4: Ashwini p1 (Mumbai) × Bharani p1 (Ashwa×Gaja yoni, Deva×Manava gana)",
    query: {
      groomDob: "2000-01-14", groomTob: "22:20", groomPlace: "mumbai",
      brideDob: "2000-01-15", brideTob: "21:25", bridePlace: "new-delhi",
    },
    janma: { groom: ["Ashwini", "Mesha"], bride: ["Bharani", "Mesha"] },
    kootas: { Varna: 1, Vashya: 2, Tara: 3, Yoni: 2, "Graha Maitri": 5, Gana: 6, Bhakoota: 7, Nadi: 8 },
    total: 34,
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
