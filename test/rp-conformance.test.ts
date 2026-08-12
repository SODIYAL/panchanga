/**
 * test/rp-conformance.test.ts — external conformance against the Government of
 * India *Rashtriya Panchang*, Saka Era 1948 (2026–27 A.D.).
 *
 * WHY THIS IS THE STRONGEST TEST IN THE SUITE
 * ───────────────────────────────────────────
 * Every other conformance suite here checks the engine against Drik Panchang or
 * against itself. The RP is a THIRD, independent, governmental authority,
 * computed from the Indian Astronomical Ephemeris rather than the Swiss
 * Ephemeris — so agreement with it is not self-agreement. It also covers an
 * unbroken 395 civil days, which is a different kind of evidence from a
 * hand-picked festival list: there is nowhere for a systematic error to hide.
 *
 * `scripts/rp-diff.mjs` reports the same comparison as a human-readable table.
 * This file is the part that must never silently regress.
 *
 * WHAT IS COMPARED, AND WHY IT IS FAIR
 * ────────────────────────────────────
 * The RP prints, for each civil day at its adopted Central Station, the aṅgas
 * running at sunrise plus the instants they end — exactly `dailyPanchanga`'s
 * contract. Timings are for the CENTRAL STATION (82°30′E, 23°11′N), never for a
 * named city; comparing at any other location compares against a different book.
 *
 * NOISE FLOOR. The RP prints to the whole minute (±30 s of quantisation before
 * any ephemeris difference), its ayanāṁśa runs ~6″ ahead of `ayanamsha()`
 * (mean-vs-true nutation), and the two sides use different ephemerides. The
 * observed worst case across all 395 days is under a minute on every quantity,
 * so ONE MINUTE is the tolerance — tight enough to catch a real drift, loose
 * enough not to fail on rounding.
 *
 * DO NOT tune the engine to make this pass. Like its Drik siblings, it is a
 * measuring instrument. A new disagreement is a finding, not a number to widen.
 */

import { describe, it, expect } from "vitest";
import { dailyPanchanga, type DailyPanchanga } from "../src/panchanga.js";
import { grahaPositions } from "../src/grahas.js";
import { NAKSHATRA_NAMES, YOGA_NAMES } from "../src/elements.js";
import type { GeoLocation } from "../src/types.js";
import FIXTURE from "./fixtures/rp-1948.json";

// ───────────────────────────────────────────────────────────────────────────
// The source's own frame
// ───────────────────────────────────────────────────────────────────────────

/** RP Central Station of India: 82°30′E, 23°11′N — its LMT is exactly I.S.T. */
const CENTRAL_STATION: GeoLocation = {
  latitude: 23 + 11 / 60,
  longitude: 82.5,
  timeZone: "Asia/Kolkata",
};

/** Minute-rounding (±0.5) plus inter-ephemeris residual. */
const TOLERANCE_MIN = 1.0;

/** RP lunar-month spelling → `LUNAR_MONTH_NAMES`. Mapped by hand: no normaliser
 *  gets Margasirsa/Margashirsha or Bhadra/Bhadrapada right by rule. */
const RP_MONTH: Record<string, string> = {
  Chaitra: "Chaitra", Vaisakha: "Vaishakha", Jyaishtha: "Jyeshtha",
  Ashadha: "Ashadha", Sravana: "Shravana", Bhadra: "Bhadrapada",
  Asvina: "Ashwina", Kartika: "Kartika", Margasirsa: "Margashirsha",
  Pausha: "Pausha", Magha: "Magha", Phalguna: "Phalguna",
};

/**
 * KNOWN EXCEPTIONS — each one investigated, each one NOT an engine error.
 * Anything appearing outside these lists is a genuine new disagreement.
 */

/** 2027-04-16: the engine's Śūla→Gaṇḍa boundary falls 18 s BEFORE its own
 *  sunrise, so it reads Gaṇḍa at udaya; the RP prints Śūla ending h. 5-39,
 *  the same minute as its sunrise. A sub-minute tie, below the source's own
 *  print resolution — not resolvable in either direction. */
const KNOWN_ANGA_TIES = ["2027-04-16 yoga"];

/** 2026-12-08 is set "(Margasirsa Krishna) Amavasya" where 6 and 7 December
 *  both read "(Kartika Krishna)". An amānta month cannot turn over mid-pakṣa,
 *  and the volume's other twelve Amāvāsyās all keep their pakṣa's month, so
 *  this is a typo in the printed book. The engine's Kārtika is the reading
 *  consistent with the RP's own convention. */
const KNOWN_SOURCE_TYPOS = ["2026-12-08"];

// ───────────────────────────────────────────────────────────────────────────
// Shared computation — 395 days is ~3.5 s, so it is done once for the file
// ───────────────────────────────────────────────────────────────────────────

interface RpAnga { rpName: string; number?: number | null; index?: number | null; name?: string | null; endsAt: string | null; ahoratra?: boolean }
interface RpDay {
  date: string; sunrise: string | null; sunset: string | null;
  moonrise: string | null; moonset: string | null;
  paksha: "shukla" | "krishna"; lunarMonth: string | null; monthQualifier: string | null;
  tithi: RpAnga[]; nakshatra: RpAnga[]; yoga: RpAnga[]; karana: RpAnga[];
  moon: { rashi: number | null; entersRashi: number | null; entersAt: string | null } | null;
}
const RP_DAYS = FIXTURE.days as unknown as RpDay[];

/** Noon IST of a civil date — a safe interior instant for naming the local day. */
const noonIst = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12 - 5, -30));
};
const plusDays = (iso: string, n: number): string =>
  new Date(noonIst(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Engine day for every fixture date, plus one past the end so the RP's
 *  sunrise-reckoned window always has its closing sunrise available. */
const ENGINE: Map<string, DailyPanchanga> = new Map();
for (const d of RP_DAYS) ENGINE.set(d.date, dailyPanchanga(noonIst(d.date), CENTRAL_STATION));
{
  const past = plusDays(RP_DAYS[RP_DAYS.length - 1].date, 1);
  ENGINE.set(past, dailyPanchanga(noonIst(past), CENTRAL_STATION));
}

const minutes = (a: string | null, b: string | null): number | null =>
  a && b ? (new Date(a).getTime() - new Date(b).getTime()) / 60_000 : null;

/** Moon's sidereal rāśi at an instant. */
const moonRashiAt = (t: Date): number | null =>
  grahaPositions(t).find((g) => g.graha === "Moon")?.rashi ?? null;

/**
 * The RP anchors moonrise/moonset to its SUNRISE-reckoned day (it renders a
 * 00:07 rise as "h. 24-07" under the previous date); `dailyPanchanga` anchors
 * them to the civil day. Neither is wrong — they name the day differently — so
 * re-bucket the engine's values into the RP's window before comparing, or the
 * measurement is of the convention gap rather than of accuracy.
 */
function inSunriseDay(date: string, which: "moonrise" | "moonset"): string | null {
  const today = ENGINE.get(date), tomorrow = ENGINE.get(plusDays(date, 1));
  if (!today?.sunrise) return null;
  const lo = new Date(today.sunrise).getTime();
  const hi = tomorrow?.sunrise ? new Date(tomorrow.sunrise).getTime() : lo + 86_400_000;
  const hit = [today[which], tomorrow?.[which] ?? null]
    .filter((x): x is string => Boolean(x))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => t >= lo && t < hi)
    .sort((a, b) => a - b);
  return hit.length ? new Date(hit[0]).toISOString() : null;
}

/** The instant the Moon leaves the rāśi it occupies at `from`, or null if it
 *  does not within 40 h. Bisected to ~1 s — the engine has no public "next Moon
 *  ingress", which is exactly what the rāśiphala `validUntil` will need. */
function nextMoonIngress(from: Date): string | null {
  const start = from.getTime();
  const r0 = moonRashiAt(from);
  if (r0 === null) return null;
  let lo = start, hi = start + 40 * 3_600_000;
  if (moonRashiAt(new Date(hi)) === r0) return null;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (moonRashiAt(new Date(mid)) === r0) lo = mid; else hi = mid;
  }
  return new Date(Math.round(hi)).toISOString();
}

/** Worst |Δ| in a delta list, with the date that produced it. */
function worst(deltas: Array<{ date: string; delta: number | null }>): { n: number; max: number; at: string } {
  const v = deltas.filter((d): d is { date: string; delta: number } => d.delta !== null);
  let max = 0, at = "—";
  for (const d of v) if (Math.abs(d.delta) > max) { max = Math.abs(d.delta); at = d.date; }
  return { n: v.length, max, at };
}

// ───────────────────────────────────────────────────────────────────────────

describe("Rashtriya Panchang 1948 S.E. — Central Station conformance", () => {
  it("covers the whole published year", () => {
    expect(RP_DAYS.length).toBe(395);
    expect(RP_DAYS[0].date).toBe("2026-03-22");
    expect(RP_DAYS[RP_DAYS.length - 1].date).toBe("2027-04-20");
  });

  /**
   * The categorical fields answer "what day is it" — a mismatch is a real
   * disagreement, not a rounding artifact. Every one is listed by name rather
   * than counted, so a new disagreement names itself in the failure output
   * instead of moving a tolerance.
   */
  it("agrees on tithi, paksha, nakshatra, yoga, karana and Moon rasi every day", () => {
    const mismatches: string[] = [];
    for (const rp of RP_DAYS) {
      const e = ENGINE.get(rp.date)!;
      const note = (field: string, eng: unknown, src: unknown) =>
        mismatches.push(`${rp.date} ${field}: engine ${eng} vs RP ${src}`);

      if (e.tithi.number !== rp.tithi[0].number)
        note("tithi", `${e.tithi.name}(${e.tithi.number})`, `${rp.tithi[0].rpName}(${rp.tithi[0].number})`);
      if (e.month.paksha !== rp.paksha) note("paksha", e.month.paksha, rp.paksha);
      if (e.nakshatra.index !== rp.nakshatra[0].index)
        note("nakshatra", NAKSHATRA_NAMES[e.nakshatra.index], rp.nakshatra[0].rpName);
      if (e.yoga.index !== rp.yoga[0].index)
        note("yoga", YOGA_NAMES[e.yoga.index], rp.yoga[0].rpName);
      if (e.karana.name !== rp.karana[0].name)
        note("karana", e.karana.name, rp.karana[0].rpName);
      if (e.sunrise && rp.moon?.rashi !== null && rp.moon !== null) {
        const mr = moonRashiAt(new Date(e.sunrise));
        if (mr !== rp.moon.rashi) note("moonRashi", mr, rp.moon.rashi);
      }
    }
    // Reduce to "<date> <field>" so the comparison is against the exception list.
    expect(mismatches.map((m) => m.split(":")[0])).toEqual(KNOWN_ANGA_TIES);
  });

  it("places every anga boundary within a minute of the printed instant", () => {
    const fields = [
      ["tithi", (e: DailyPanchanga) => e.tithi.endsAt, (r: RpDay) => r.tithi[0], (e: DailyPanchanga, r: RpDay) => e.tithi.number === r.tithi[0].number],
      ["nakshatra", (e: DailyPanchanga) => e.nakshatra.endsAt, (r: RpDay) => r.nakshatra[0], (e: DailyPanchanga, r: RpDay) => e.nakshatra.index === r.nakshatra[0].index],
      ["yoga", (e: DailyPanchanga) => e.yoga.endsAt, (r: RpDay) => r.yoga[0], (e: DailyPanchanga, r: RpDay) => e.yoga.index === r.yoga[0].index],
      ["karana", (e: DailyPanchanga) => e.karana.endsAt, (r: RpDay) => r.karana[0], (e: DailyPanchanga, r: RpDay) => e.karana.name === r.karana[0].name],
    ] as const;

    for (const [label, engEnd, rpEntry, sameAnga] of fields) {
      // Only meaningful when both name the same aṅga, and when the RP printed an
      // ending at all — an "ahoratra" aṅga outruns the next sunrise and carries none.
      const deltas = RP_DAYS.map((rp) => {
        const e = ENGINE.get(rp.date)!;
        const entry = rpEntry(rp);
        if (!sameAnga(e, rp) || entry.ahoratra || !entry.endsAt) return { date: rp.date, delta: null };
        return { date: rp.date, delta: minutes(engEnd(e), entry.endsAt) };
      });
      const w = worst(deltas);
      expect(w.n, `${label}: too few comparable days`).toBeGreaterThan(370);
      expect(w.max, `${label} end: worst |Δ| ${w.max.toFixed(2)} min on ${w.at}`).toBeLessThanOrEqual(TOLERANCE_MIN);
    }
  });

  it("places sunrise and sunset within a minute", () => {
    for (const [label, key] of [["sunrise", "sunrise"], ["sunset", "sunset"]] as const) {
      const w = worst(RP_DAYS.map((rp) => ({ date: rp.date, delta: minutes(ENGINE.get(rp.date)![key], rp[key]) })));
      expect(w.n, `${label}: missing days`).toBe(395);
      expect(w.max, `${label}: worst |Δ| ${w.max.toFixed(2)} min on ${w.at}`).toBeLessThanOrEqual(TOLERANCE_MIN);
    }
  });

  /**
   * Moonrise AND moonset, re-bucketed into the RP's sunrise-reckoned day. The
   * RP omits one of the two on ~13 days a year (the event falls past the next
   * sunrise), which is why the comparable count is short of 395.
   */
  it("places moonrise and moonset within a minute of the printed instants", () => {
    for (const which of ["moonrise", "moonset"] as const) {
      const w = worst(RP_DAYS.map((rp) => ({ date: rp.date, delta: minutes(inSunriseDay(rp.date, which), rp[which]) })));
      expect(w.n, `${which}: only ${w.n} comparable days`).toBeGreaterThan(375);
      expect(w.max, `${which}: worst |Δ| ${w.max.toFixed(2)} min on ${w.at}`).toBeLessThanOrEqual(TOLERANCE_MIN);
    }
  });

  /** The rāśiphala design's `validUntil` is the next Moon rāśi ingress, so the
   *  RP's printed ingress instants are its conformance target. */
  it("places every Moon rasi ingress within a minute", () => {
    const deltas = RP_DAYS.map((rp) => {
      const e = ENGINE.get(rp.date)!;
      if (!rp.moon?.entersAt || !e.sunrise) return { date: rp.date, delta: null };
      return { date: rp.date, delta: minutes(nextMoonIngress(new Date(e.sunrise)), rp.moon.entersAt) };
    });
    const w = worst(deltas);
    expect(w.n, "too few ingress days").toBeGreaterThan(150);
    expect(w.max, `ingress: worst |Δ| ${w.max.toFixed(2)} min on ${w.at}`).toBeLessThanOrEqual(TOLERANCE_MIN);
  });

  /**
   * The RP names the lunar month amānta (its Chaitra kṛṣṇa is the engine's
   * pūrṇimānta Vaiśākha), and marks an intercalary month "Mala" — which is the
   * adhika Jyaiṣṭha of 2026, the whole 17 May – 15 June run. This is the check
   * that would have caught the 8 December source typo.
   */
  it("agrees on the amanta month label and the adhika month, apart from one source typo", () => {
    const differing: string[] = [];
    for (const rp of RP_DAYS) {
      if (!rp.lunarMonth) continue;
      const expected = (rp.monthQualifier === "Mala" ? "Adhika " : "") + RP_MONTH[rp.lunarMonth];
      if (ENGINE.get(rp.date)!.month.amanta !== expected) differing.push(rp.date);
    }
    expect(differing).toEqual(KNOWN_SOURCE_TYPOS);

    // The adhika month is not merely labelled — it must span the RP's own run.
    const adhika = RP_DAYS.filter((d) => d.monthQualifier === "Mala").map((d) => d.date);
    expect(adhika[0]).toBe("2026-05-17");
    expect(adhika[adhika.length - 1]).toBe("2026-06-15");
    for (const date of adhika) expect(ENGINE.get(date)!.month.amanta).toBe("Adhika Jyeshtha");
  });
});
