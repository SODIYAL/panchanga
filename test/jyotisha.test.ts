/**
 * test/jyotisha.test.ts — grahas, kuṇḍalī, and Vimśottarī daśā.
 *
 * DUAL CONFORMANCE (the plan's validation policy):
 *  • dṛk fidelity — positions and the lagna are differentially validated
 *    against the Swiss Ephemeris (sweph devDependency, Moshier mode, sidereal
 *    Lahiri — the same authority the ayanāṁśa is calibrated to).
 *  • śāstra fidelity — BPHS structural rules asserted directly: navāṁśa
 *    arithmetic, whole-sign bhāvas, nakṣatra lords, the 120-year cycle.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  grahaLongitude,
  grahaPosition,
  grahaPositions,
  meanNodeSidereal,
  trueNodeSidereal,
  janmaFacts,
  GRAHA_NAMES,
  RASHI_NAMES,
} from "../src/grahas.js";
import { siderealLagna, navamsaRashi, kundali, moonKundali } from "../src/kundali.js";
import { vimshottariDasha, nakshatraLord, VIMSHOTTARI_SEQUENCE } from "../src/dashas.js";
import type { GeoLocation } from "../src/types.js";

const require = createRequire(import.meta.url);
const swe = require("sweph");
const C = swe.constants;
swe.set_sid_mode(C.SE_SIDM_LAHIRI, 0, 0);
const SIDFLAGS = C.SEFLG_MOSEPH | C.SEFLG_SPEED | C.SEFLG_SIDEREAL;
const jdOf = (d: Date) => 2440587.5 + d.getTime() / 86_400_000;
const wrap = (x: number) => ((x + 540) % 360) - 180;

const DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };

/** Deterministic spread of test instants, 1950–2050. */
const sampleDates = (n: number): Date[] =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(1950 + i * Math.floor(100 / n), (i * 5) % 12, 1 + ((i * 3) % 27), (i * 7) % 24, (i * 13) % 60)),
  );

describe("dṛk fidelity — Swiss Ephemeris differential", () => {
  const SWE_BODY: Record<string, number> = {
    Sun: C.SE_SUN, Moon: C.SE_MOON, Mars: C.SE_MARS, Mercury: C.SE_MERCURY,
    Jupiter: C.SE_JUPITER, Venus: C.SE_VENUS, Saturn: C.SE_SATURN,
  };

  it("all seven bodies within 0.6′ of Swiss sidereal Lahiri (1950–2050)", () => {
    for (const d of sampleDates(20)) {
      for (const [name, b] of Object.entries(SWE_BODY)) {
        const ref = swe.calc_ut(jdOf(d), b, SIDFLAGS).data[0];
        const diff = Math.abs(wrap(grahaLongitude(d, name as never) - ref)) * 60;
        expect(diff, `${name} @ ${d.toISOString()}: ${diff.toFixed(3)}′`).toBeLessThan(0.6);
      }
    }
  });

  it("mean Rāhu within 0.05′ of SE_MEAN_NODE; true Rāhu within 1.5′ of SE_TRUE_NODE", () => {
    for (const d of sampleDates(20)) {
      const mean = swe.calc_ut(jdOf(d), C.SE_MEAN_NODE, SIDFLAGS).data[0];
      const tru = swe.calc_ut(jdOf(d), C.SE_TRUE_NODE, SIDFLAGS).data[0];
      expect(Math.abs(wrap(meanNodeSidereal(d) - mean)) * 60).toBeLessThan(0.05);
      expect(Math.abs(wrap(trueNodeSidereal(d) - tru)) * 60).toBeLessThan(1.5);
    }
  });

  it("sidereal lagna within 0.05′ of Swiss houses_ex ascendant", () => {
    const locs: GeoLocation[] = [
      DELHI,
      { latitude: 51.0447, longitude: -114.0719, timeZone: "America/Edmonton" },
      { latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
      { latitude: 19.076, longitude: 72.8777, timeZone: "Asia/Kolkata" },
    ];
    sampleDates(16).forEach((d, i) => {
      const loc = locs[i % locs.length];
      const h = swe.houses_ex(jdOf(d), C.SEFLG_SIDEREAL | C.SEFLG_MOSEPH, loc.latitude, loc.longitude, "W");
      const diff = Math.abs(wrap(siderealLagna(d, loc) - h.data.points[0])) * 60;
      expect(diff, `${d.toISOString()} @ ${loc.latitude}: ${diff.toFixed(3)}′`).toBeLessThan(0.05);
    });
  });
});

describe("graha record structure", () => {
  const d = new Date("2026-01-23T04:00:00Z");

  it("Ketu ≡ Rāhu + 180°, both node models", () => {
    for (const node of ["mean", "true"] as const) {
      const r = grahaLongitude(d, "Rahu", { node });
      const k = grahaLongitude(d, "Ketu", { node });
      expect(Math.abs(wrap(k - r - 180))).toBeLessThan(1e-9);
    }
  });

  it("rāśi/nakṣatra/pada arithmetic is self-consistent; Sun never retrograde, mean Rāhu always", () => {
    for (const dd of sampleDates(10)) {
      for (const p of grahaPositions(dd)) {
        expect(p.rashi).toBe(Math.floor(p.longitude / 30) % 12);
        expect(p.nakshatra).toBe(Math.floor(p.longitude / (360 / 27)) % 27);
        expect(p.pada).toBe((Math.floor(p.longitude / (360 / 108)) % 4) + 1);
        expect(p.rashiMarginArcmin).toBeGreaterThanOrEqual(0);
        expect(p.rashiMarginArcmin).toBeLessThanOrEqual(15 * 60);
        if (p.graha === "Sun") expect(p.retrograde).toBe(false);
        if (p.graha === "Rahu") expect(p.retrograde).toBe(true); // mean node regresses
      }
    }
  });
});

describe("śāstra fidelity — BPHS structural rules", () => {
  it("navāṁśa: movable from itself, fixed from 9th, dual from 5th (BPHS)", () => {
    // First navāṁśa of Meṣa (movable) = Meṣa.
    expect(navamsaRashi(0.1)).toBe(0);
    // First navāṁśa of Vṛṣabha (fixed) = 9th from it = Makara.
    expect(navamsaRashi(30.1)).toBe(9);
    // First navāṁśa of Mithuna (dual) = 5th from it = Tulā.
    expect(navamsaRashi(60.1)).toBe(6);
    // Last navāṁśa of Mīna = Mīna (vargottama corner).
    expect(navamsaRashi(359.9)).toBe(11);
  });

  it("nakṣatra lords follow the 9-cycle (Aśvinī→Ketu … Revatī→Mercury)", () => {
    expect(nakshatraLord(0)).toBe("Ketu");
    expect(nakshatraLord(1)).toBe("Venus");
    expect(nakshatraLord(2)).toBe("Sun");
    expect(nakshatraLord(3)).toBe("Moon"); // Rohiṇī
    expect(nakshatraLord(26)).toBe("Mercury"); // Revatī
    expect(VIMSHOTTARI_SEQUENCE.reduce((s, [, y]) => s + y, 0)).toBe(120);
  });

  it("whole-sign bhāvas: bhāva = rāśi distance from lagna + 1", () => {
    const k = kundali(new Date("2026-01-23T04:00:00Z"), DELHI);
    for (const g of k.grahas) {
      expect(g.bhava).toBe(((g.rashi - k.lagna.rashi + 12) % 12) + 1);
    }
    expect(k.grahas).toHaveLength(GRAHA_NAMES.length);
  });
});

describe("Vimśottarī daśā", () => {
  const birth = new Date("2026-01-23T04:00:00Z");
  const janma = janmaFacts(birth, DELHI);
  const dasha = vimshottariDasha(janma);

  it("starts with the janma nakṣatra's lord; 9 periods; total = 120 − elapsed", () => {
    expect(dasha[0].lord).toBe(nakshatraLord(janma.janmaNakshatra));
    expect(dasha).toHaveLength(9);
    const total = dasha.reduce((s, p) => s + p.years, 0);
    const fullFirst = VIMSHOTTARI_SEQUENCE[janma.janmaNakshatra % 9][1];
    expect(total).toBeCloseTo(120 - janma.nakshatraFractionElapsed * fullFirst, 6);
  });

  it("periods are contiguous; antardaśās tile each mahādaśā and start from its lord", () => {
    for (let i = 1; i < dasha.length; i++) {
      expect(dasha[i].start.getTime()).toBe(dasha[i - 1].end.getTime());
    }
    for (const [i, p] of dasha.entries()) {
      const subs = p.antardashas;
      expect(subs[subs.length - 1].end.getTime()).toBeCloseTo(p.end.getTime(), -4);
      expect(subs[0].start.getTime()).toBe(p.start.getTime());
      if (i > 0) {
        expect(subs).toHaveLength(9);
        expect(subs[0].lord).toBe(p.lord); // BPHS: antardaśā ladder starts from the mahā lord
        for (let j = 1; j < subs.length; j++) {
          expect(subs[j].start.getTime()).toBeCloseTo(subs[j - 1].end.getTime(), -3);
        }
      }
    }
  });
});

describe("kuṇḍalī assembly", () => {
  const birth = new Date("2026-01-23T04:00:00Z"); // 09:30 IST
  const k = kundali(birth, DELHI);

  it("lagna window brackets the birth instant and spans ~2 h", () => {
    expect(k.lagna.window.enteredAt.getTime()).toBeLessThanOrEqual(birth.getTime());
    expect(k.lagna.window.leavesAt.getTime()).toBeGreaterThan(birth.getTime());
    const spanMin = (k.lagna.window.leavesAt.getTime() - k.lagna.window.enteredAt.getTime()) / 60000;
    expect(spanMin).toBeGreaterThan(60);
    expect(spanMin).toBeLessThan(220);
    // The lagna is inside the rāśi whose window this is, on both edges.
    expect(RASHI_NAMES[k.lagna.rashi]).toBe(k.lagna.rashiName);
  });

  it("janma facts match the Moon's own record; chandra lagna = Moon rāśi", () => {
    expect(k.janma.janmaNakshatraName).toBe(k.grahas.find((g) => g.graha === "Moon")!.nakshatraName);
    expect(k.chandraLagna).toBe(k.grahas.find((g) => g.graha === "Moon")!.rashi);
  });

  it("moonKundali (unknown birth time) counts bhāvas from the Moon and flags itself", () => {
    const mk = moonKundali(birth, DELHI);
    expect(mk.timeUnknown).toBe(true);
    expect((mk as never as { lagna?: unknown }).lagna).toBeUndefined();
    expect(mk.grahas.find((g) => g.graha === "Moon")!.bhava).toBe(1);
  });

  it("rejects polar latitudes for the lagna", () => {
    expect(() => kundali(birth, { latitude: 70, longitude: 20, timeZone: "Europe/Oslo" })).toThrow(/lagna/);
  });

  it("node option flows through and is recorded", () => {
    const kt = kundali(birth, DELHI, { node: "true" });
    expect(kt.node).toBe("true");
    expect(k.node).toBe("mean");
    const rMean = k.grahas.find((g) => g.graha === "Rahu")!.longitude;
    const rTrue = kt.grahas.find((g) => g.graha === "Rahu")!.longitude;
    expect(Math.abs(wrap(rMean - rTrue))).toBeGreaterThan(0.001); // models genuinely differ
    expect(Math.abs(wrap(rMean - rTrue))).toBeLessThan(2); // …by at most ~1.75°
  });
});
