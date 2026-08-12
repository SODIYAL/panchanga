/**
 * test/rp-fixture.test.ts — integrity of the Rashtriya Panchang fixture itself.
 *
 * `test/fixtures/rp-1948.json` is a PARSE of a printed book, so it can be wrong
 * in two different ways, and only one of them is the engine's problem:
 *
 *   • the parser mis-read the page  → a fixture bug, caught here;
 *   • the engine disagrees with the page → caught in `rp-conformance.test.ts`.
 *
 * These checks are all internal to the fixture — they never consult the engine —
 * so a failure here means `scripts/rp-parse.mjs` needs fixing and the fixture
 * needs regenerating, not that the ephemeris moved.
 */

import { describe, it, expect } from "vitest";
import FIXTURE from "./fixtures/rp-1948.json";

interface AngaEntry {
  rpName: string;
  number?: number | null;
  index?: number | null;
  name?: string | null;
  endsAt: string | null;
  ahoratra?: boolean;
  unparsed?: boolean;
}
interface RpDay {
  date: string;
  julianDay: number;
  kaliAhargana: number | null;
  paksha: "shukla" | "krishna" | null;
  lunarMonth: string | null;
  monthQualifier: string | null;
  tithi: AngaEntry[];
  nakshatra: AngaEntry[];
  yoga: AngaEntry[];
  karana: AngaEntry[];
}
const DAYS = FIXTURE.days as unknown as RpDay[];

describe("Rashtriya Panchang fixture integrity", () => {
  it("covers the whole Saka year as an unbroken run of civil days", () => {
    expect(DAYS.length).toBe(395);
    for (let i = 1; i < DAYS.length; i++) {
      expect(DAYS[i].julianDay - DAYS[i - 1].julianDay).toBe(1);
    }
  });

  it("resolves every printed anga name to an index", () => {
    for (const d of DAYS) {
      for (const e of d.tithi) expect(e.number, `${d.date} tithi ${e.rpName}`).not.toBeNull();
      for (const e of d.nakshatra) expect(e.index, `${d.date} nakshatra ${e.rpName}`).not.toBeNull();
      for (const e of d.yoga) expect(e.index, `${d.date} yoga ${e.rpName}`).not.toBeNull();
      for (const e of d.karana) expect(e.name, `${d.date} karana ${e.rpName}`).not.toBeNull();
    }
  });

  /**
   * THE PAKSHA-CROSSING CASE.
   *
   * A day can print two tithis (anga ksaya). When the first is Amavasya or
   * Purnima the second one BEGINS THE NEXT PAKSHA, so it must not inherit the
   * day's printed paksha:
   *
   *   2026-06-15  (Jyaishtha Krishna) Amavasya then Pratipad  → 30 then 1
   *   2026-12-24  (Margasirsa Sukla)  Purnima  then Pratipad  → 15 then 16
   *
   * Numbering the second entry from the day's own paksha puts both of these 15
   * out. Every pair of consecutive entries must advance by exactly one tithi.
   */
  it("numbers a second tithi from its own paksha, not the day's", () => {
    for (const d of DAYS) {
      for (let i = 1; i < d.tithi.length; i++) {
        const prev = d.tithi[i - 1].number!;
        const next = d.tithi[i].number!;
        expect(next, `${d.date}: ${d.tithi[i - 1].rpName}(${prev}) then ${d.tithi[i].rpName}(${next})`)
          .toBe((prev % 30) + 1);
      }
    }
  });

  it("advances nakshatra, yoga and karana by one within a day", () => {
    for (const d of DAYS) {
      for (let i = 1; i < d.nakshatra.length; i++)
        expect(d.nakshatra[i].index, `${d.date} nakshatra`).toBe((d.nakshatra[i - 1].index! + 1) % 27);
      for (let i = 1; i < d.yoga.length; i++)
        expect(d.yoga[i].index, `${d.date} yoga`).toBe((d.yoga[i - 1].index! + 1) % 27);
    }
  });

  it("keeps the Kali Ahargana in step with the Julian Day", () => {
    for (let i = 1; i < DAYS.length; i++) {
      expect(DAYS[i].kaliAhargana! - DAYS[i - 1].kaliAhargana!).toBe(1);
    }
  });

  /**
   * The amanta month cannot change in the middle of a paksha — it turns over at
   * the Amavasya's end. This catches the one place the printed book slips:
   * 8 Dec 2026 is set as "(Margasirsa Krishna) Amavasya" where 6 and 7 Dec both
   * read "(Kartika Krishna)". The other twelve Amavasyas in the volume all keep
   * their paksha's month, so this is a source typo, recorded as an expected
   * exception rather than silently normalised away.
   */
  it("holds the lunar month constant within a paksha, apart from one known source typo", () => {
    const SOURCE_TYPOS = new Set(["2026-12-08"]);
    const breaks: string[] = [];
    for (let i = 1; i < DAYS.length; i++) {
      const prev = DAYS[i - 1], cur = DAYS[i];
      if (prev.paksha !== cur.paksha) continue; // a new paksha may rename
      if (prev.lunarMonth !== cur.lunarMonth || prev.monthQualifier !== cur.monthQualifier) {
        breaks.push(`${cur.date}: ${prev.monthQualifier ?? ""} ${prev.lunarMonth} → ${cur.monthQualifier ?? ""} ${cur.lunarMonth}`);
      }
    }
    expect(breaks.map((b) => b.slice(0, 10))).toEqual([...SOURCE_TYPOS]);
  });
});
