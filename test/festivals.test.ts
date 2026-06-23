/**
 * Tests for src/festivals.ts — the observance-rule evaluator.
 *
 * Two layers:
 *
 *  1. CONSTRUCTED-CASE tests of the PURE selection function
 *     `selectDayByPervasion`. These hand-build candidate days with synthetic
 *     intervals so the precedence / nakshatra / karana logic is exercised in
 *     isolation, deterministically, with no ephemeris. Assertions are written
 *     so they would FAIL if the precedence logic were inverted.
 *
 *  2. A small number of WIRING SMOKE tests that run hand-written FestivalRules
 *     through `computeFestival` against REAL ephemeris, to prove each
 *     Observance.kind is plumbed end-to-end. These are NOT festival fixtures
 *     (no rules.ts, no Drik Panchang conformance) — that is Task 5b.
 */

import { describe, it, expect } from "vitest";
import {
  selectDayByPervasion,
  computeFestival,
  computeFestivals,
  type PervasionCandidate,
} from "../src/festivals.js";
import type { FestivalRule, GeoLocation } from "../src/types.js";
import { lunarMonth } from "../src/elements.js";

// ───────────────────────────────────────────────────────────────────────────
// Helpers for constructed candidates
// ───────────────────────────────────────────────────────────────────────────

/** Build a candidate where the tithi covers `fraction` of the day's window. */
function candidate(
  dayISO: string,
  fraction: number,
  opts: {
    nakshatraOk?: boolean;
    bhadraOverlap?: { start: string; end: string } | null;
    /** offset of tithi-start before the window start, in ms (default: at start) */
    tithiStartsBeforeWindowMs?: number;
  } = {},
): PervasionCandidate {
  const day = new Date(`${dayISO}T00:00:00Z`);
  // Window is a fixed 12-hour block 06:00–18:00 UTC on the day.
  const wStart = new Date(`${dayISO}T06:00:00Z`);
  const wEnd = new Date(`${dayISO}T18:00:00Z`);
  const windowMs = wEnd.getTime() - wStart.getTime();
  const coverMs = fraction * windowMs;

  // Tithi interval: by default it starts at (or before) the window start and
  // ends `coverMs` into the window, so its coverage of the window == fraction.
  const before = opts.tithiStartsBeforeWindowMs ?? 0;
  const tithiStart = new Date(wStart.getTime() - before);
  const tithiEnd = new Date(wStart.getTime() + coverMs);

  // Preserve the three-state distinction: undefined (not provided), null
  // (explicitly Bhadra-free), or a concrete overlap interval.
  let bhadraOverlap: PervasionCandidate["bhadraOverlap"];
  if (opts.bhadraOverlap === undefined) {
    bhadraOverlap = undefined;
  } else if (opts.bhadraOverlap === null) {
    bhadraOverlap = null;
  } else {
    bhadraOverlap = {
      start: new Date(opts.bhadraOverlap.start),
      end: new Date(opts.bhadraOverlap.end),
    };
  }

  return {
    day,
    tithiInterval: { start: tithiStart, end: tithiEnd },
    window: { start: wStart, end: wEnd },
    nakshatraOk: opts.nakshatraOk,
    bhadraOverlap,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. selectDayByPervasion — PURE, constructed cases
// ───────────────────────────────────────────────────────────────────────────

describe("selectDayByPervasion — max-window-fraction precedence", () => {
  it("picks the day with the larger window-coverage fraction", () => {
    const day1 = candidate("2026-01-01", 0.3);
    const day2 = candidate("2026-01-02", 0.7);
    const r = selectDayByPervasion([day1, day2], { precedence: "max-window-fraction" });
    expect(r.chosen?.day.toISOString()).toBe(day2.day.toISOString());
    // The assertion is direction-sensitive: if the policy picked the SMALLER
    // fraction it would return day1 and this would fail.
    expect(r.chosen).not.toBe(day1);
  });

  it("flips the choice when the fractions are flipped", () => {
    const day1 = candidate("2026-01-01", 0.8);
    const day2 = candidate("2026-01-02", 0.2);
    const r = selectDayByPervasion([day1, day2], { precedence: "max-window-fraction" });
    expect(r.chosen?.day.toISOString()).toBe(day1.day.toISOString());
  });
});

describe("selectDayByPervasion — udaya precedence", () => {
  it("picks the day whose tithi is present at the window start (sunrise)", () => {
    // day1: tithi starts AFTER window start (not present at udaya).
    const day1 = candidate("2026-01-01", 0.9, { tithiStartsBeforeWindowMs: -3_600_000 });
    // day2: tithi starts before window start → present at udaya, even though it
    // covers a smaller fraction. udaya must beat the bigger-fraction day1.
    const day2 = candidate("2026-01-02", 0.3, { tithiStartsBeforeWindowMs: 3_600_000 });
    const r = selectDayByPervasion([day1, day2], { precedence: "udaya" });
    expect(r.chosen?.day.toISOString()).toBe(day2.day.toISOString());
  });
});

describe("selectDayByPervasion — first / second precedence", () => {
  it("'first' picks the earlier candidate, 'second' the later", () => {
    const day1 = candidate("2026-01-01", 0.4);
    const day2 = candidate("2026-01-02", 0.6);
    expect(
      selectDayByPervasion([day1, day2], { precedence: "first" }).chosen?.day.toISOString(),
    ).toBe(day1.day.toISOString());
    expect(
      selectDayByPervasion([day1, day2], { precedence: "second" }).chosen?.day.toISOString(),
    ).toBe(day2.day.toISOString());
  });
});

describe("selectDayByPervasion — nakshatra filter / tie-break", () => {
  it("'required' filters out the day where the nakshatra is absent", () => {
    // day1 has the bigger fraction but the nakshatra is ABSENT → filtered.
    const day1 = candidate("2026-01-01", 0.9, { nakshatraOk: false });
    const day2 = candidate("2026-01-02", 0.2, { nakshatraOk: true });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      nakshatra: "required",
    });
    expect(r.chosen?.day.toISOString()).toBe(day2.day.toISOString());
  });

  it("'preferred' only breaks ties — does not override a clear fraction winner", () => {
    // day1 wins clearly on fraction even though its nakshatra is absent;
    // "preferred" must not override that.
    const day1 = candidate("2026-01-01", 0.9, { nakshatraOk: false });
    const day2 = candidate("2026-01-02", 0.2, { nakshatraOk: true });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      nakshatra: "preferred",
    });
    expect(r.chosen?.day.toISOString()).toBe(day1.day.toISOString());
  });

  it("'preferred' breaks an exact fraction tie toward the nakshatra-matching day", () => {
    const day1 = candidate("2026-01-01", 0.5, { nakshatraOk: false });
    const day2 = candidate("2026-01-02", 0.5, { nakshatraOk: true });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      nakshatra: "preferred",
    });
    expect(r.chosen?.day.toISOString()).toBe(day2.day.toISOString());
  });
});

describe("selectDayByPervasion — fallback when pervaded on no day", () => {
  it("applies 'previous-day' fallback when no candidate has positive coverage", () => {
    const day1 = candidate("2026-01-01", 0); // zero coverage
    const day2 = candidate("2026-01-02", 0); // zero coverage
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      fallback: "previous-day",
    });
    expect(r.chosen).toBeNull();
    expect(r.fallbackApplied).toBe("previous-day");
    expect(r.diagnostics.join(" ")).toMatch(/pervade/i);
  });

  it("applies 'next-day' fallback similarly", () => {
    const day1 = candidate("2026-01-01", 0);
    const r = selectDayByPervasion([day1], {
      precedence: "max-window-fraction",
      fallback: "next-day",
    });
    expect(r.chosen).toBeNull();
    expect(r.fallbackApplied).toBe("next-day");
  });

  it("when 'required' nakshatra eliminates every candidate, no day is chosen", () => {
    const day1 = candidate("2026-01-01", 0.6, { nakshatraOk: false });
    const day2 = candidate("2026-01-02", 0.4, { nakshatraOk: false });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      nakshatra: "required",
    });
    expect(r.chosen).toBeNull();
    expect(r.diagnostics.join(" ")).toMatch(/nakshatra/i);
  });

  it("required-nakshatra wipeout does NOT trigger the day-fallback (distinct from non-pervasion)", () => {
    // Both days pervade (positive coverage) but neither has the required nakshatra.
    // The fallback clause is configured, but it must NOT fire — this is a nakshatra
    // elimination, not a non-pervasion event.  Old code set fallbackApplied to the
    // configured fallback regardless; the fix gates it to genuine non-pervasion only.
    const day1 = candidate("2026-01-03", 0.6, { nakshatraOk: false });
    const day2 = candidate("2026-01-04", 0.4, { nakshatraOk: false });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      nakshatra: "required",
      fallback: "previous-day", // configured but must NOT fire on nakshatra wipeout
    });
    expect(r.chosen).toBeNull();
    // fallback must be null — this is a nakshatra failure, not a non-pervasion failure.
    expect(r.fallbackApplied).toBeNull();
    // Diagnostic must name the nakshatra cause, NOT the pervasion cause.
    expect(r.diagnostics.join(" ")).toMatch(/nakshatra/i);
    expect(r.diagnostics.join(" ")).not.toMatch(/did not pervade/i);
  });
});

describe("selectDayByPervasion — avoidKarana: vishti records Bhadra overlap", () => {
  it("records the chosen day's Bhadra overlap without discarding the day", () => {
    const overlap = { start: "2026-01-02T06:00:00Z", end: "2026-01-02T08:00:00Z" };
    const day1 = candidate("2026-01-01", 0.3);
    const day2 = candidate("2026-01-02", 0.7, { bhadraOverlap: overlap });
    const r = selectDayByPervasion([day1, day2], {
      precedence: "max-window-fraction",
      avoidKarana: "vishti",
    });
    // Day still chosen (record, don't fail — full split deferred to Phase 4).
    expect(r.chosen?.day.toISOString()).toBe(day2.day.toISOString());
    expect(r.bhadraOverlap).not.toBeNull();
    expect(r.bhadraOverlap?.start.toISOString()).toBe(new Date(overlap.start).toISOString());
    expect(r.diagnostics.join(" ")).toMatch(/bhadra/i);
  });

  it("notes no Bhadra overlap when the chosen day is Bhadra-free", () => {
    const day1 = candidate("2026-01-01", 0.7, { bhadraOverlap: null });
    const r = selectDayByPervasion([day1], {
      precedence: "max-window-fraction",
      avoidKarana: "vishti",
    });
    expect(r.chosen?.day.toISOString()).toBe(day1.day.toISOString());
    expect(r.bhadraOverlap).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. computeFestival — WIRING SMOKE tests against REAL ephemeris
//    (NOT festival fixtures; these only prove each kind is plumbed end-to-end.)
// ───────────────────────────────────────────────────────────────────────────

const NEW_DELHI: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata",
};

function ymd(s: string): number {
  return new Date(`${s}T12:00:00Z`).getTime();
}

describe("computeFestival — wiring smoke tests (real ephemeris, NOT fixtures)", () => {
  it("solar-ingress rashi=9 (Makara) resolves to ~14 Jan 2026", () => {
    const rule: FestivalRule = {
      id: "smoke-makara",
      displayName: "Smoke Makar Sankranti",
      month: { purnimanta: "Pausha" },
      category: "solar",
      observance: { kind: "solar-ingress", rashi: 9, punyaKala: "after-moment-to-sunset" },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");
    // Drik Makar Sankranti 2026 = 14 Jan (IST). Our ayanāṁśa differs slightly,
    // so allow 14 or 15 Jan.
    expect(["2026-01-14", "2026-01-15"]).toContain(result.date);
    expect(result.instants.ingress).toBeDefined();
    expect(result.diagnostics).toEqual([]);
  });

  it("tithi-pervades Krishna Chaturdashi + nishita resolves to a plausible date", () => {
    // A synthetic Maha-Shivaratri-shaped rule: Krishna Chaturdashi pervading the
    // niśīta (midnight) window, max-window-fraction. We only assert it resolves
    // to a date in the expected lunar month range — NOT the real festival date.
    const rule: FestivalRule = {
      id: "smoke-k14-nishita",
      displayName: "Smoke Krishna-Chaturdashi nishita",
      month: { purnimanta: "Phalguna" },
      category: "lunar-tithi",
      observance: {
        kind: "tithi-pervades",
        paksha: "krishna",
        tithi: 14,
        window: "nishita",
        precedence: "max-window-fraction",
      },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");
    // Phalguna Krishna Chaturdashi 2026 (Maha Shivaratri) is mid-Feb per Drik.
    // We assert only a plausible window (Feb 2026), not the exact fixture.
    const t = ymd(result.date);
    expect(t).toBeGreaterThanOrEqual(ymd("2026-02-10"));
    expect(t).toBeLessThanOrEqual(ymd("2026-02-20"));
    expect(result.instants.tithiStart).toBeDefined();
    expect(result.instants.windowStart).toBeDefined();
  });

  it("tithi-pervades with avoidKarana:vishti records bhadra in instants when present", () => {
    // Phalguna Purnima (Holika) — Krishna? No: Holika Dahan is Shukla Purnima.
    // Use Phalguna Shukla Purnima with avoidKarana to exercise the bhadra path.
    const rule: FestivalRule = {
      id: "smoke-holika-bhadra",
      displayName: "Smoke Holika Bhadra",
      month: { purnimanta: "Phalguna" },
      category: "lunar-tithi",
      observance: {
        kind: "tithi-pervades",
        paksha: "shukla",
        tithi: "purnima",
        window: "pradosha",
        precedence: "max-window-fraction",
        avoidKarana: "vishti",
      },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");
    // Just prove the bhadra machinery ran: either an overlap instant is present
    // or a diagnostic states none overlapped.
    const mentionsBhadra =
      "bhadraStart" in result.instants ||
      result.diagnostics.some((d) => /bhadra/i.test(d));
    expect(mentionsBhadra).toBe(true);
  });

  it("moonrise kind resolves to a day where the tithi is live at moonrise", () => {
    const rule: FestivalRule = {
      id: "smoke-moonrise",
      displayName: "Smoke Sankashti",
      month: { purnimanta: "Magha" },
      category: "moonrise",
      observance: { kind: "moonrise", paksha: "krishna", tithi: 4 },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");
    expect(result.instants.moonrise).toBeDefined();
  });

  it("solar-arghya kind includes sunset (Sandhya) and next sunrise (Usha)", () => {
    const rule: FestivalRule = {
      id: "smoke-chhath",
      displayName: "Smoke Chhath",
      month: { purnimanta: "Kartika" },
      category: "lunar-tithi",
      observance: { kind: "solar-arghya", paksha: "shukla", tithi: 6 },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");
    expect(result.instants.sandhyaArghya).toBeDefined(); // sunset
    expect(result.instants.ushaArghya).toBeDefined(); // next sunrise
  });

  it("derived kind = base date + offsetDays", () => {
    const base: FestivalRule = {
      id: "smoke-base",
      displayName: "Smoke Base",
      month: { purnimanta: "Phalguna" },
      category: "lunar-tithi",
      observance: {
        kind: "tithi-pervades",
        paksha: "shukla",
        tithi: "purnima",
        window: "pradosha",
        precedence: "max-window-fraction",
      },
    };
    const derived: FestivalRule = {
      id: "smoke-derived",
      displayName: "Smoke Derived",
      month: { purnimanta: "Phalguna" },
      category: "derived",
      observance: { kind: "derived", from: "smoke-base", offsetDays: 1 },
    };
    const { results, diagnostics } = computeFestivals(2026, NEW_DELHI, {
      rules: [base, derived],
    });
    expect(diagnostics).toEqual([]);
    const baseR = results.find((r) => r.id === "smoke-base")!;
    const derivedR = results.find((r) => r.id === "smoke-derived")!;
    expect(baseR.date).not.toBe("");
    // derived date = base date + 1 calendar day.
    const expected = new Date(`${baseR.date}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + 1);
    expect(derivedR.date).toBe(expected.toISOString().slice(0, 10));
  });
});

describe("computeFestival — adhika/nija lunation resolution (2026 Adhika Jyeshtha)", () => {
  // In 2026 there is an Adhika Jyeshtha (leap month) roughly 17 May–15 Jun,
  // followed immediately by the regular Nija Jyeshtha (~16 Jun–14 Jul).
  // A rule with month:"Jyeshtha" must resolve to the NIJA lunation, not the
  // adhika one.  The old code returned matches[0] = earliest = the Adhika
  // lunation, which is wrong for all standard festivals.
  it("tithi-pervades with month:Jyeshtha resolves to the Nija (non-adhika) lunation in 2026", () => {
    const rule: FestivalRule = {
      id: "smoke-jyeshtha-nija",
      displayName: "Smoke Jyeshtha Nija",
      month: { purnimanta: "Jyeshtha" },
      category: "lunar-tithi",
      observance: {
        kind: "tithi-pervades",
        paksha: "shukla",
        tithi: 11, // Ekadashi — a common festival tithi; unambiguously in Jyeshtha
        window: "purvahna",
        precedence: "max-window-fraction",
      },
    };
    const result = computeFestival(rule, 2026, NEW_DELHI);
    expect(result.date).not.toBe("");

    // The Adhika Jyeshtha 2026 ends by ~15 Jun 2026; Nija Jyeshtha follows.
    // Assert the resolved date falls AFTER the Adhika lunation boundary.
    const resolvedMs = new Date(`${result.date}T12:00:00Z`).getTime();
    const adhikaBoundary = new Date("2026-06-15T00:00:00Z").getTime();
    expect(resolvedMs).toBeGreaterThan(adhikaBoundary);

    // Also assert the resolved date is in a non-adhika lunation.
    const lm = lunarMonth(new Date(`${result.date}T12:00:00Z`), { system: "purnimanta" });
    expect(lm.adhika).toBe(false);
  });
});

describe("computeFestivals — never silently drops; orders by date", () => {
  it("returns a diagnostic-bearing empty result for an unresolvable derived ref", () => {
    const orphan: FestivalRule = {
      id: "orphan",
      displayName: "Orphan",
      month: { purnimanta: "Chaitra" },
      category: "derived",
      observance: { kind: "derived", from: "does-not-exist", offsetDays: 1 },
    };
    const { results, diagnostics } = computeFestivals(2026, NEW_DELHI, { rules: [orphan] });
    const r = results.find((x) => x.id === "orphan")!;
    expect(r).toBeDefined();
    expect(r.date).toBe("");
    expect(r.diagnostics.length).toBeGreaterThan(0);
    // A top-level diagnostic also flags it (never silent).
    expect(diagnostics.join(" ")).toMatch(/orphan/);
  });

  it("orders results ascending by date (undated rules sort last)", () => {
    const later: FestivalRule = {
      id: "smoke-makara",
      displayName: "Makara",
      month: { purnimanta: "Pausha" },
      category: "solar",
      observance: { kind: "solar-ingress", rashi: 9 },
    };
    const undated: FestivalRule = {
      id: "orphan",
      displayName: "Orphan",
      month: { purnimanta: "Chaitra" },
      category: "derived",
      observance: { kind: "derived", from: "nope", offsetDays: 1 },
    };
    const { results } = computeFestivals(2026, NEW_DELHI, { rules: [undated, later] });
    // dated rule comes before the undated one regardless of input order.
    expect(results[0].id).toBe("smoke-makara");
    expect(results[results.length - 1].id).toBe("orphan");
  });
});
