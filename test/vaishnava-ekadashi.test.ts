/**
 * Vaiṣṇava Ekādaśī (sampradāya profile + the vedha grammar clause).
 *
 * The Vaiṣṇava nirṇaya: the fast day must be daśamī-free at aruṇodaya (the
 * 4 ghaṭikās before sunrise). A daśamī-viddhā udaya day shifts the fast to the
 * next civil day (Gauṇa Ekādaśī); on a vṛddhi (Ekādaśī at two consecutive
 * sunrises) the LATER day is taken. Encoded as `precedence: "second"` + the
 * `vedha: { by: "previous-tithi", at: "arunodaya", shift: "next-day" }` clause.
 *
 * Validation:
 *  • Two 2026 New Delhi divergences are pinned against independently published
 *    Smārta/Vaiṣṇava listings (sources in the test comments).
 *  • A multi-year property suite asserts the structural invariants of the rule
 *    (never earlier than Smārta; at most +1 day; a shift implies the vedha or
 *    vṛddhi condition actually held).
 */

import { describe, it, expect } from "vitest";
import { computeFestivals } from "../src/festivals.js";
import { ekadashiRules, allRules } from "../src/rules.js";
import { arunodaya, riseSet } from "../src/time.js";
import type { GeoLocation, FestivalResult } from "../src/types.js";

const DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };
const CALGARY: GeoLocation = { latitude: 51.0447, longitude: -114.0719, timeZone: "America/Edmonton" };

function ekadashisFor(year: number, loc: GeoLocation, sampradaya: "smarta" | "vaishnava") {
  const { results } = computeFestivals(year, loc, { rules: ekadashiRules(year, sampradaya) });
  return new Map(results.map((r) => [r.id, r]));
}

const dayDiff = (a: string, b: string): number =>
  (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;

describe("pinned 2026 New Delhi Smārta/Vaiṣṇava divergences (externally published)", () => {
  const smarta = ekadashisFor(2026, DELHI, "smarta");
  const vaishnava = ekadashisFor(2026, DELHI, "vaishnava");

  // Prabodhini (Dev Uthani) Ekādaśī, Kārtika śukla: tithi Nov 20 07:16 →
  // Nov 21 06:32 IST touches no sunrise; Smārta observes Nov 20, Vaiṣṇavas
  // Nov 21 (published: guptvrindavandham.org, prokerala Prabodhini 2026).
  it("Prabodhini: Smārta Nov 20, Vaiṣṇava Nov 21", () => {
    expect(smarta.get("ekadashi-kartika-shukla")!.date).toBe("2026-11-20");
    expect(vaishnava.get("ekadashi-kartika-shukla")!.date).toBe("2026-11-21");
  });

  // Yogini Ekādaśī, Āṣāḍha kṛṣṇa: tithi ends Jul 11 05:22 IST just before
  // sunrise; Smārta Jul 10, Vaiṣṇava (Gauṇa) Jul 11 (published: amitray.com
  // "Ekadashi July 2026", 99pandit, prokerala Yogini 2026).
  it("Yogini: Smārta Jul 10, Vaiṣṇava Jul 11", () => {
    expect(smarta.get("ekadashi-ashadha-krishna")!.date).toBe("2026-07-10");
    expect(vaishnava.get("ekadashi-ashadha-krishna")!.date).toBe("2026-07-11");
  });

  it("divergences carry the vedha diagnostics/instants", () => {
    const r = vaishnava.get("ekadashi-ashadha-krishna")!;
    expect(r.instants.vedhaShift).toBe("next-day");
    expect(r.instants.vedhaWindowStart).toBeTruthy();
    expect(r.diagnostics.some((d) => d.includes("vedha"))).toBe(true);
  });
});

describe("rule-set shape under the sampradāya profile", () => {
  it("same ids, Vaishnava-prefixed names, sampradaya recorded", () => {
    const s = ekadashiRules(2026, "smarta");
    const v = ekadashiRules(2026, "vaishnava");
    expect(v.map((r) => r.id)).toEqual(s.map((r) => r.id));
    for (const r of v) {
      expect(r.displayName.startsWith("Vaishnava ")).toBe(true);
      expect(r.sampradaya).toBe("vaishnava");
    }
    for (const r of s) expect(r.sampradaya).toBe("smarta");
  });

  it("allRules(year, {sampradaya}) swaps only the Ekādaśī convention", () => {
    const s = allRules(2026);
    const v = allRules(2026, { sampradaya: "vaishnava" });
    expect(v.map((r) => r.id)).toEqual(s.map((r) => r.id));
    const changed = v.filter(
      (r, i) => JSON.stringify(r.observance) !== JSON.stringify(s[i].observance),
    );
    expect(changed.length).toBe(ekadashiRules(2026).length);
    expect(changed.every((r) => r.id.startsWith("ekadashi-"))).toBe(true);
  });
});

describe("structural invariants, 2024–2030 × New Delhi & Calgary", () => {
  for (const [locName, loc] of [
    ["new-delhi", DELHI],
    ["calgary", CALGARY],
  ] as const) {
    for (let year = 2024; year <= 2030; year++) {
      it(`${year} ${locName}: Vaiṣṇava = Smārta or Smārta+1, shifts justified`, () => {
        const smarta = ekadashisFor(year, loc, "smarta");
        const vaishnava = ekadashisFor(year, loc, "vaishnava");
        expect(vaishnava.size).toBe(smarta.size);

        for (const [id, v] of vaishnava) {
          const s = smarta.get(id)!;
          expect(s.date, `${id}: smarta date missing`).toBeTruthy();
          expect(v.date, `${id}: vaishnava date missing`).toBeTruthy();
          const d = dayDiff(s.date, v.date);
          expect([0, 1], `${id}: vaishnava ${v.date} vs smarta ${s.date}`).toContain(d);

          if (v.instants.vedhaShift) {
            // A vedha shift must be justified: the Ekādaśī began only after
            // aruṇodaya opened on the pre-shift day (⇔ daśamī touched
            // aruṇodaya), and the result is exactly one day after that day.
            const tithiStart = new Date(v.instants.tithiStart);
            const vWinStart = new Date(v.instants.vedhaWindowStart);
            expect(tithiStart.getTime()).toBeGreaterThan(vWinStart.getTime());
          } else if (d === 1) {
            // A +1 without vedha must be the vṛddhi case: Ekādaśī live at the
            // Vaiṣṇava day's own sunrise (precedence "second" took the later
            // udaya day). Noon-UTC of the civil date lies inside that local
            // day at both test longitudes.
            const sr = riseSet("rise", new Date(`${v.date}T12:00:00Z`), loc);
            expect(sr, `${id}: sunrise unavailable`).toBeTruthy();
            expect(new Date(v.instants.tithiStart).getTime()).toBeLessThanOrEqual(sr!.getTime());
            expect(new Date(v.instants.tithiEnd).getTime()).toBeGreaterThan(sr!.getTime());
          }

          if (d === 0 && v.instants.vedhaWindowStart) {
            // No shift ⇒ the day was śuddhā: the tithi was already running
            // when aruṇodaya opened.
            expect(new Date(v.instants.tithiStart).getTime()).toBeLessThanOrEqual(
              new Date(v.instants.vedhaWindowStart).getTime(),
            );
          }
        }
      });
    }
  }

  it("aruṇodaya is the 4 ghaṭikās (96 min) before sunrise", () => {
    const w = arunodaya(new Date("2026-07-10T00:00:00Z"), DELHI);
    expect(w).toBeTruthy();
    expect(w!.end.getTime() - w!.start.getTime()).toBe(96 * 60 * 1000);
  });
});
