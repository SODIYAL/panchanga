/**
 * test/vargas.test.ts — the BPHS ṣoḍaśavarga rules and the pratyantardaśā
 * ladder. Known-value anchors are taken directly from the BPHS mapping rules
 * (each varga's rule is stated in src/vargas.ts's header).
 */
import { describe, it, expect } from "vitest";
import { vargaRashi, shodashavarga, isVargottama, SHODASHAVARGA } from "../src/vargas.js";
import { navamsaRashi, kundali } from "../src/kundali.js";
import { vimshottariDasha, VIMSHOTTARI_SEQUENCE } from "../src/dashas.js";
import { janmaFacts } from "../src/grahas.js";
import type { GeoLocation } from "../src/types.js";

const DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };
// Rāśi indices for readability.
const [MESHA, VRISHABHA, MITHUNA, KARKA, SIMHA, KANYA, TULA, VRISHCHIKA, DHANU, MAKARA, KUMBHA, MEENA] =
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("ṣoḍaśavarga — BPHS known-value anchors", () => {
  it("D2 horā: luminaries only — odd signs Sun-then-Moon, even signs reversed", () => {
    expect(vargaRashi(10, "D2")).toBe(SIMHA); // Meṣa 10° (odd, 1st half)
    expect(vargaRashi(20, "D2")).toBe(KARKA); // Meṣa 20° (odd, 2nd half)
    expect(vargaRashi(30 + 10, "D2")).toBe(KARKA); // Vṛṣabha 10° (even, 1st half)
    expect(vargaRashi(30 + 20, "D2")).toBe(SIMHA); // Vṛṣabha 20° (even, 2nd half)
    // The BPHS horā maps ONLY to Karka/Siṁha.
    for (let lon = 0.5; lon < 360; lon += 7.3) {
      expect([KARKA, SIMHA]).toContain(vargaRashi(lon, "D2"));
    }
  });

  it("D3 drekkāṇa: the sign, its 5th, its 9th", () => {
    expect(vargaRashi(5, "D3")).toBe(MESHA); // Meṣa 0–10°
    expect(vargaRashi(15, "D3")).toBe(SIMHA); // Meṣa 10–20° → 5th
    expect(vargaRashi(25, "D3")).toBe(DHANU); // Meṣa 20–30° → 9th
    expect(vargaRashi(90 + 25, "D3")).toBe(MEENA); // Karka 3rd drekkāṇa → 9th from Karka
  });

  it("D4 caturthāṁśa: the sign, 4th, 7th, 10th", () => {
    expect(vargaRashi(3, "D4")).toBe(MESHA);
    expect(vargaRashi(10, "D4")).toBe(KARKA);
    expect(vargaRashi(18, "D4")).toBe(TULA);
    expect(vargaRashi(28, "D4")).toBe(MAKARA);
  });

  it("D7 saptāṁśa: odd from the sign, even from its 7th", () => {
    expect(vargaRashi(2, "D7")).toBe(MESHA); // odd sign, part 0
    expect(vargaRashi(30 + 2, "D7")).toBe(VRISHCHIKA); // Vṛṣabha (even) → 7th = Vṛścika
    expect(vargaRashi(29.9, "D7")).toBe(TULA); // Meṣa part 6 → +6
  });

  it("D9 navāṁśa: uniform collapse; agrees with kundali's navamsaRashi everywhere", () => {
    for (let lon = 0.1; lon < 360; lon += 3.7) {
      expect(vargaRashi(lon, "D9")).toBe(navamsaRashi(lon));
    }
    expect(vargaRashi(30.1, "D9")).toBe(MAKARA); // fixed Vṛṣabha starts at its 9th
    expect(vargaRashi(60.1, "D9")).toBe(TULA); // dual Mithuna starts at its 5th
  });

  it("D10 daśāṁśa: odd from the sign, even from its 9th", () => {
    expect(vargaRashi(1, "D10")).toBe(MESHA);
    expect(vargaRashi(30 + 1, "D10")).toBe(MAKARA); // Vṛṣabha → 9th = Makara
    expect(vargaRashi(29.9, "D10")).toBe(MAKARA); // Meṣa part 9 → +9
  });

  it("D12 dvādaśāṁśa: counted from the sign itself", () => {
    expect(vargaRashi(1, "D12")).toBe(MESHA);
    expect(vargaRashi(120 + 7, "D12")).toBe(TULA); // Siṁha 7° → part 2 → +2
  });

  it("D16/D20/D45 quality starts (movable/fixed/dual)", () => {
    expect(vargaRashi(0.5, "D16")).toBe(MESHA); // movable → Meṣa
    expect(vargaRashi(30.5, "D16")).toBe(SIMHA); // fixed → Siṁha
    expect(vargaRashi(60.5, "D16")).toBe(DHANU); // dual → Dhanu
    expect(vargaRashi(0.5, "D20")).toBe(MESHA); // movable → Meṣa
    expect(vargaRashi(30.5, "D20")).toBe(DHANU); // fixed → Dhanu
    expect(vargaRashi(60.5, "D20")).toBe(SIMHA); // dual → Siṁha
    expect(vargaRashi(0.3, "D45")).toBe(MESHA);
    expect(vargaRashi(30.3, "D45")).toBe(SIMHA);
    expect(vargaRashi(60.3, "D45")).toBe(DHANU);
  });

  it("D24 siddhāṁśa: odd from Siṁha, even from Karka", () => {
    expect(vargaRashi(0.5, "D24")).toBe(SIMHA);
    expect(vargaRashi(30.5, "D24")).toBe(KARKA);
  });

  it("D27 bhāṁśa: uniform collapse hits the element starts (fire→Meṣa, earth→Karka, air→Tulā, water→Makara)", () => {
    expect(vargaRashi(0.2, "D27")).toBe(MESHA); // Meṣa (fiery)
    expect(vargaRashi(30.2, "D27")).toBe(KARKA); // Vṛṣabha (earthy)
    expect(vargaRashi(60.2, "D27")).toBe(TULA); // Mithuna (airy)
    expect(vargaRashi(90.2, "D27")).toBe(MAKARA); // Karka (watery)
    expect(vargaRashi(120.2, "D27")).toBe(MESHA); // Siṁha (fiery) wraps to Meṣa
  });

  it("D30 triṁśāṁśa: the unequal 5/5/8/7/5 (odd) and 5/7/8/5/5 (even) segments", () => {
    // Odd (Meṣa): Mars, Saturn, Jupiter, Mercury, Venus signs.
    expect(vargaRashi(4.9, "D30")).toBe(MESHA);
    expect(vargaRashi(9.9, "D30")).toBe(KUMBHA);
    expect(vargaRashi(17.9, "D30")).toBe(DHANU);
    expect(vargaRashi(24.9, "D30")).toBe(MITHUNA);
    expect(vargaRashi(29.9, "D30")).toBe(TULA);
    // Even (Vṛṣabha): reversed into the lords' even signs.
    expect(vargaRashi(30 + 4.9, "D30")).toBe(VRISHABHA);
    expect(vargaRashi(30 + 11.9, "D30")).toBe(KANYA);
    expect(vargaRashi(30 + 19.9, "D30")).toBe(MEENA);
    expect(vargaRashi(30 + 24.9, "D30")).toBe(MAKARA);
    expect(vargaRashi(30 + 29.9, "D30")).toBe(VRISHCHIKA);
  });

  it("D40 khavedāṁśa: odd from Meṣa, even from Tulā; D60 from the sign itself", () => {
    expect(vargaRashi(0.3, "D40")).toBe(MESHA);
    expect(vargaRashi(30.3, "D40")).toBe(TULA);
    expect(vargaRashi(0.2, "D60")).toBe(MESHA); // Meṣa part 0
    expect(vargaRashi(29.9, "D60")).toBe(MEENA); // Meṣa part 59 → +59 ≡ +11
    expect(vargaRashi(150 + 0.6, "D60")).toBe(KANYA + 1); // Kanyā 0.6° → part 1 → +1 = Tulā
  });

  it("every varga returns a valid rāśi for a dense sweep (boundary-safe)", () => {
    for (const v of SHODASHAVARGA) {
      for (let lon = 0; lon < 360; lon += 0.4999) {
        const r = vargaRashi(lon, v);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(11);
      }
      expect(vargaRashi(359.999999, v)).toBeGreaterThanOrEqual(0); // top edge
    }
  });

  it("vargottama: D1 ≡ D9", () => {
    expect(isVargottama(1)).toBe(true); // Meṣa 1° → navāṁśa Meṣa
    expect(isVargottama(10)).toBe(false); // Meṣa 10° → navāṁśa Karka
    expect(isVargottama(359)).toBe(true); // Mīna last navāṁśa → Mīna
    const all = shodashavarga(1);
    expect(all.D1).toBe(all.D9);
    expect(Object.keys(all)).toHaveLength(16);
  });
});

describe("pratyantardaśā (Vimśottarī level 3)", () => {
  const birth = new Date("2026-01-23T04:00:00Z");
  const janma = janmaFacts(birth, DELHI);

  it("default (levels 2) has no pratyantars; levels 3 adds them", () => {
    const d2 = vimshottariDasha(janma);
    expect(d2[1].antardashas[0].pratyantardashas).toBeUndefined();
    const d3 = vimshottariDasha(janma, { levels: 3 });
    expect(d3[1].antardashas[0].pratyantardashas).toHaveLength(9);
  });

  it("pratyantars tile each antardaśā, start from the antar lord, self-first", () => {
    const d3 = vimshottariDasha(janma, { levels: 3 });
    for (const maha of d3.slice(1)) {
      // full (non-balance) mahādaśās
      for (const antar of maha.antardashas) {
        const ps = antar.pratyantardashas!;
        expect(ps).toHaveLength(9);
        expect(ps[0].lord).toBe(antar.lord); // BPHS: the ladder starts from its own lord
        expect(ps[0].start.getTime()).toBe(antar.start.getTime());
        expect(ps[8].end.getTime()).toBeCloseTo(antar.end.getTime(), -3);
        for (let i = 1; i < 9; i++) {
          expect(ps[i].start.getTime()).toBeCloseTo(ps[i - 1].end.getTime(), -3);
        }
        // Proportions: each pratyantar = antar × lordYears/120.
        const antarMs = antar.end.getTime() - antar.start.getTime();
        const seq = VIMSHOTTARI_SEQUENCE.map(([g]) => g);
        const firstIdx = seq.indexOf(antar.lord);
        const expectMs = (VIMSHOTTARI_SEQUENCE[firstIdx][1] / 120) * antarMs;
        expect(ps[0].end.getTime() - ps[0].start.getTime()).toBeCloseTo(expectMs, -4);
      }
    }
  });

  it("balance-region pratyantars are clipped to birth, never before it", () => {
    const d3 = vimshottariDasha(janma, { levels: 3 });
    const balance = d3[0];
    for (const antar of balance.antardashas) {
      for (const p of antar.pratyantardashas!) {
        expect(p.start.getTime()).toBeGreaterThanOrEqual(janma.birth.getTime());
        expect(p.end.getTime()).toBeGreaterThan(p.start.getTime());
      }
    }
    // First visible pratyantar starts exactly at birth.
    expect(balance.antardashas[0].pratyantardashas![0].start.getTime()).toBe(janma.birth.getTime());
  });
});

describe("kuṇḍalī integration", () => {
  const birth = new Date("2026-01-23T04:00:00Z");

  it("vargas option adds named placements to grahas and lagna; default stays lean", () => {
    const lean = kundali(birth, DELHI);
    expect(lean.grahas[0].vargas).toBeUndefined();
    expect(typeof lean.grahas[0].vargottama).toBe("boolean");
    const full = kundali(birth, DELHI, { vargas: "all", dashaLevels: 3 });
    for (const g of full.grahas) {
      expect(Object.keys(g.vargas!)).toHaveLength(16);
      expect(g.vargas!.D9).toBe(g.navamsaName); // internal consistency
    }
    expect(Object.keys(full.lagna.vargas!)).toHaveLength(16);
    expect(full.dasha[1].antardashas[0].pratyantardashas).toHaveLength(9);
    const partial = kundali(birth, DELHI, { vargas: ["D3", "D10"] });
    expect(Object.keys(partial.grahas[0].vargas!)).toEqual(["D3", "D10"]);
  });
});
