/**
 * src/festivals.ts — the observance-rule EVALUATOR.
 *
 * Two responsibilities:
 *
 *  1. `selectDayByPervasion` — a PURE, independently-testable selection
 *     function. Given a set of candidate civil days (each with its tithi
 *     interval ∩ the day's kāla window, plus optional nakshatra / Bhadra
 *     facts), it applies the precedence policy, the nakshatra filter/tie-break,
 *     and records Bhadra overlap. No ephemeris, no I/O — the keystone logic the
 *     constructed-case tests target.
 *
 *  2. `computeFestival` / `computeFestivals` — resolve each `Observance.kind`
 *     to a civil date using the real astronomy modules (`time.ts`,
 *     `elements.ts`). These build the candidate set for `tithi-pervades` and
 *     feed it to `selectDayByPervasion`; the other kinds resolve directly.
 *
 * NEVER SILENTLY DROP: a rule that yields no date still returns a
 * `FestivalResult` (empty `date`) carrying a diagnostic, plus a top-level
 * diagnostic from `computeFestivals`.
 *
 * SCOPE: this is the MECHANISM (Task 5a). The per-festival rule DATA
 * (`src/rules.ts`) and the Drik-Panchang conformance gate are Task 5b/Phase 4.
 */

import type {
  FestivalRule,
  FestivalResult,
  GeoLocation,
  Kala,
  Observance,
  Paksha,
  TithiRef,
} from "./types.js";

import {
  tithiBoundaries,
  nakshatraAt,
  bhadraIntervals,
  bhadraSplit,
  newMoons,
  solarIngress,
  lunarMonth,
  NAKSHATRA_NAMES,
} from "./elements.js";

import { siderealSunRashi } from "./ayanamsha.js";

import {
  type TimeWindow,
  validateLocation,
  startOfLocalDayUTC,
  nextLocalDayStartUTC,
  localDayString,
  moonrise,
  sunset,
  riseSet,
  sankrantiPunyaKala,
  sunriseWindow,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  arunodaya,
} from "./time.js";

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — the pure selection function
// ═══════════════════════════════════════════════════════════════════════════

/** One candidate civil day for the pervasion contest. */
export interface PervasionCandidate {
  /** The civil day (a UTC instant inside that local day; identity carrier). */
  day: Date;
  /** The festival tithi's interval (UTC). */
  tithiInterval: { start: Date; end: Date };
  /** The day's relevant kāla window (UTC). */
  window: { start: Date; end: Date };
  /**
   * Whether the required/preferred nakshatra is satisfied on this day.
   * `undefined` when the rule has no nakshatra clause.
   */
  nakshatraOk?: boolean;
  /**
   * Bhadra (Viṣṭi) overlap with this day's window, when `avoidKarana:"vishti"`.
   * `null` = checked, none overlaps; `undefined` = not checked.
   */
  bhadraOverlap?: { start: Date; end: Date } | null;
  /**
   * Whether this day's kāla window has ANY Bhadra-free portion, when
   * `avoidKarana:"vishti"`. `false` = Bhadra covers the WHOLE window (the
   * observance cannot be performed Bhadra-free on this day → disqualified);
   * `true` = at least part of the window is Bhadra-free; `undefined` = not
   * checked (rule has no Bhadra clause).
   */
  bhadraFreeWindow?: boolean;
  /**
   * Whether the festival tithi is live at this civil day's SUNRISE (udaya
   * tithi). Used by the Bhadra branch to pick the Bhadra-free observance day
   * when the tithi has already left that day's (evening) window — Drik observes
   * such Bhadra-excluded Pūrṇimā festivals on the udaya-Pūrṇimā day whose
   * kāla window is Bhadra-free. `undefined` when not supplied.
   */
  tithiAtSunrise?: boolean;
}

export type Precedence = "max-window-fraction" | "udaya" | "first" | "second";

export interface SelectOptions {
  precedence: Precedence;
  /** Nakshatra mode, if the rule has a nakshatra clause. */
  nakshatra?: "required" | "preferred";
  avoidKarana?: "vishti";
  fallback?: "previous-day" | "next-day" | "nearest-window";
}

export interface SelectResult {
  /** The winning candidate, or null when none qualifies. */
  chosen: PervasionCandidate | null;
  /** Window-coverage fraction of the chosen day (0 when none). */
  coverageFraction: number;
  /** The fallback that was triggered because no day pervaded, if any. */
  fallbackApplied: "previous-day" | "next-day" | "nearest-window" | null;
  /** Bhadra overlap recorded on the chosen day (avoidKarana:"vishti"). */
  bhadraOverlap: { start: Date; end: Date } | null;
  diagnostics: string[];
}

/** Overlap length (ms, ≥0) between two intervals. */
function overlapMs(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): number {
  const s = Math.max(a.start.getTime(), b.start.getTime());
  const e = Math.min(a.end.getTime(), b.end.getTime());
  return Math.max(0, e - s);
}

/** Fraction of `window` that `tithi` covers (0..1). */
function windowFraction(
  tithi: { start: Date; end: Date },
  window: { start: Date; end: Date },
): number {
  const wLen = window.end.getTime() - window.start.getTime();
  if (wLen <= 0) return 0;
  return overlapMs(tithi, window) / wLen;
}

/** Is the festival tithi live at instant `t` (half-open: start ≤ t < end)? */
function tithiLiveAt(interval: { start: Date; end: Date }, t: Date): boolean {
  return interval.start.getTime() <= t.getTime() && interval.end.getTime() > t.getTime();
}

/** Is the tithi live at the window's start instant (udaya)? */
function presentAtStart(c: PervasionCandidate): boolean {
  return tithiLiveAt(c.tithiInterval, c.window.start);
}

/**
 * Select the observance day among `candidates` per the precedence policy.
 *
 * Pipeline:
 *   1. `nakshatra:"required"` → drop candidates with `nakshatraOk === false`.
 *   1b.`avoidKarana:"vishti"` → DISQUALIFY any candidate whose kāla window is
 *      wholly covered by Bhadra (Viṣṭi) — i.e. `bhadraFreeWindow === false`.
 *      The observance must be performed in a Bhadra-FREE window, so a fully
 *      Bhadra-contaminated day cannot host it. (Holikā Dahan, Rakṣā Bandhan.)
 *   2. Keep only candidates whose tithi covers a positive fraction of the
 *      window (i.e. the tithi actually pervades the window at all). A day with
 *      zero coverage cannot win — that is what triggers `fallback`.
 *   3. Apply the precedence policy to the survivors:
 *        • max-window-fraction → largest coverage fraction wins.
 *        • udaya               → a day present at the window start beats one
 *                                that is not; among equals, larger fraction.
 *        • first / second      → earliest / latest survivor by day.
 *   4. `nakshatra:"preferred"` → on an (near-)exact fraction tie, prefer the
 *      nakshatra-matching day; never overrides a clear winner.
 *   5. Record the chosen day's Bhadra overlap (avoidKarana:"vishti").
 *   6. If no survivor pervades but `avoidKarana:"vishti"` left exactly the
 *      Bhadra-free candidate(s) standing, choose the Bhadra-free day on which
 *      the festival tithi is the UDAYA tithi (live at sunrise). This is the
 *      Drik resolution for Bhadra-excluded Pūrṇimā festivals: when the natural
 *      pradoṣa/aparāhna-vyāpinī day is Bhadra-contaminated, the observance
 *      shifts to the (next) udaya-Pūrṇimā day whose window is Bhadra-free, even
 *      though the tithi has by then left that evening window.
 *   7. Otherwise, if no survivor, set `fallbackApplied` and explain.
 *
 * PURE: depends only on its arguments.
 */
export function selectDayByPervasion(
  candidates: PervasionCandidate[],
  opts: SelectOptions,
): SelectResult {
  const diagnostics: string[] = [];

  // Sort by day so "first"/"second" and tie-breaks are deterministic.
  const ordered = [...candidates].sort((a, b) => a.day.getTime() - b.day.getTime());

  // 1. Required-nakshatra filter.
  let pool = ordered;
  if (opts.nakshatra === "required") {
    const filtered = pool.filter((c) => c.nakshatraOk !== false);
    if (filtered.length < pool.length) {
      diagnostics.push(
        `nakshatra(required): dropped ${pool.length - filtered.length} candidate day(s) lacking the required nakshatra`,
      );
    }
    pool = filtered;
  }

  // 1b. Bhadra (Viṣṭi) exclusion. A candidate whose ENTIRE kāla window is
  //     covered by Bhadra cannot host a Bhadra-free observance → disqualify it.
  //     Candidates with at least a Bhadra-free slice (or no Bhadra at all)
  //     survive. We keep the Bhadra-free survivors in `pool` so the normal
  //     precedence runs only over admissible days.
  let bhadraDisqualified: PervasionCandidate[] = [];
  if (opts.avoidKarana === "vishti") {
    const free = pool.filter((c) => c.bhadraFreeWindow !== false);
    bhadraDisqualified = pool.filter((c) => c.bhadraFreeWindow === false);
    if (bhadraDisqualified.length > 0) {
      diagnostics.push(
        `avoidKarana(vishti): disqualified ${bhadraDisqualified.length} candidate day(s) whose ` +
          `kāla window is wholly covered by Bhadra (Viṣṭi); the observance must be Bhadra-free`,
      );
    }
    pool = free;
  }

  // 2. Keep candidates that actually pervade the window (coverage > 0).
  const withCoverage = pool.map((c) => ({ c, frac: windowFraction(c.tithiInterval, c.window) }));
  const pervading = withCoverage.filter((x) => x.frac > 0);

  if (pervading.length === 0) {
    // Distinguish two causes of an empty survivor set:
    //  a) Required-nakshatra wipeout: candidates pervaded but all lacked the
    //     required nakshatra.  This is NOT a non-pervasion event — do NOT apply
    //     the day-fallback; return no date with a nakshatra-specific diagnostic.
    //  b) Genuine non-pervasion: the tithi simply did not overlap the kāla window
    //     on any candidate day.  Apply the fallback (if configured).
    if (pool.length === 0 && opts.nakshatra === "required") {
      // pool was emptied by the required-nakshatra filter (candidates existed but
      // none had the required nakshatra).
      diagnostics.push(
        "required nakshatra not satisfied: candidates pervaded but none had the required nakshatra; no day chosen",
      );
      return {
        chosen: null,
        coverageFraction: 0,
        fallbackApplied: null, // NOT a pervasion failure — fallback does not apply
        bhadraOverlap: null,
        diagnostics,
      };
    }
    // Bhadra-exclusion shift: if the only reason nothing pervades is that a day
    // that DID pervade the window was Bhadra-disqualified, observe on the
    // Bhadra-free udaya-tithi day. This is the Drik resolution for Holikā /
    // Rakṣā when the natural pradoṣa/aparāhna-vyāpinī day is Bhadra-contaminated:
    // the festival shifts to the (next) day on which the tithi is live at
    // sunrise and whose kāla window is Bhadra-free — even though the tithi has
    // by then left that evening window (frac = 0 there).
    //
    // GUARD: require that a disqualified day actually pervaded the window. A
    // bare `bhadraDisqualified.length > 0` would also fire on a GENUINE
    // non-pervasion (tithi absent on every day) that merely coincided with a
    // Bhadra-covered day, wrongly suppressing the configured `fallback`.
    const disqualifiedPervaded = bhadraDisqualified.some(
      (c) => windowFraction(c.tithiInterval, c.window) > 0,
    );
    if (opts.avoidKarana === "vishti" && disqualifiedPervaded && pool.length > 0) {
      // Prefer a Bhadra-free candidate that is the udaya-tithi day; else the
      // earliest Bhadra-free candidate (day-sorted).
      const udaya = pool.find((c) => c.tithiAtSunrise === true);
      const shifted = udaya ?? pool[0];
      diagnostics.push(
        `avoidKarana(vishti): natural window-pervading day was Bhadra-disqualified; ` +
          `shifted to the Bhadra-free ${udaya ? "udaya-tithi" : "earliest surviving"} day`,
      );
      return {
        chosen: shifted,
        coverageFraction: windowFraction(shifted.tithiInterval, shifted.window),
        fallbackApplied: null,
        // The surviving pool only guarantees the window is NOT WHOLLY Bhadra;
        // a partial overlap can remain on the chosen day, so surface it rather
        // than asserting null.
        bhadraOverlap: shifted.bhadraOverlap ?? null,
        diagnostics,
      };
    }

    // nearest-window fallback: no day pervades the window, but the festival
    // still occurs (e.g. a niśīta-vyāpinī Caturdaśī that straddles two midnights
    // without covering either, at a far-western longitude). Keep the candidate
    // whose window sits closest to the tithi — the day on which the tithi is
    // current going into that night. Resolved here (we hold the candidates),
    // so the caller receives a chosen day rather than a previous/next-day shift.
    if (opts.fallback === "nearest-window" && pool.length > 0) {
      // No window pervades: observe on the day the tithi is most CURRENT — the
      // candidate civil day that holds the largest portion of the tithi. A tithi
      // that straddles two sunrises/midnights without covering the ritual window
      // (a niśīta Caturdaśī at a far-western longitude, a Pūrṇimā that misses
      // both sunrises) belongs to the day it *spans*, not merely the day whose
      // window sits closest in clock-time. Ranking by the smaller window-gap
      // picked the wrong side when the tithi ended just before the next day's
      // window (e.g. Kārtik Pūrṇimā at Calgary: tithi ends 14 min before the Nov
      // 24 sunrise, yet the observance is Nov 23, the day Pūrṇimā is current all
      // afternoon). Civil-day bounds come from the consecutive candidate
      // midnights; the last day is bounded by +24h (a tithi is < 27h, so the
      // relative ranking is unaffected). Ties fall to the earlier day (the
      // day-sorted reduce keeps the first max).
      const dayMs = ordered.map((c) => c.day.getTime());
      const civilDayOverlap = (c: PervasionCandidate): number => {
        const i = dayMs.indexOf(c.day.getTime());
        const end = i >= 0 && i + 1 < dayMs.length ? dayMs[i + 1] : c.day.getTime() + DAY_MS;
        return overlapMs(c.tithiInterval, { start: c.day, end: new Date(end) });
      };
      const chosen = pool.reduce((best, c) =>
        (civilDayOverlap(c) > civilDayOverlap(best) ? c : best),
      );
      diagnostics.push(
        "fallback(nearest-window): tithi pervaded no candidate window; chose the day that holds the largest portion of the tithi",
      );
      return {
        chosen,
        coverageFraction: 0,
        fallbackApplied: "nearest-window",
        bhadraOverlap: null,
        diagnostics,
      };
    }

    // Genuine non-pervasion: tithi did not overlap the window on any surviving day.
    diagnostics.push("tithi did not pervade the window on any candidate day");
    return {
      chosen: null,
      coverageFraction: 0,
      fallbackApplied: opts.fallback ?? null,
      bhadraOverlap: null,
      diagnostics,
    };
  }

  // 3. Precedence policy.
  let winner: { c: PervasionCandidate; frac: number };
  switch (opts.precedence) {
    case "max-window-fraction": {
      winner = pervading.reduce((best, x) => (x.frac > best.frac ? x : best));
      break;
    }
    case "udaya": {
      // Prefer a day present at the window start; among those (or among none),
      // fall back to the larger coverage.
      const atStart = pervading.filter((x) => presentAtStart(x.c));
      const search = atStart.length > 0 ? atStart : pervading;
      winner = search.reduce((best, x) => (x.frac > best.frac ? x : best));
      break;
    }
    case "first": {
      winner = pervading[0]; // already day-sorted ascending
      break;
    }
    case "second": {
      winner = pervading[pervading.length - 1];
      break;
    }
  }

  // 4. Preferred-nakshatra tie-break (only on a near-exact fraction tie).
  if (opts.nakshatra === "preferred") {
    const EPS = 1e-6;
    const tied = pervading.filter((x) => Math.abs(x.frac - winner.frac) <= EPS);
    if (tied.length > 1) {
      const preferred = tied.find((x) => x.c.nakshatraOk === true);
      if (preferred) {
        if (preferred.c !== winner.c) {
          diagnostics.push("nakshatra(preferred): broke a fraction tie toward the matching day");
        }
        winner = preferred;
      }
    }
  }

  // 5. Record Bhadra overlap on the chosen day.
  let bhadraOverlap: { start: Date; end: Date } | null = null;
  if (opts.avoidKarana === "vishti") {
    bhadraOverlap = winner.c.bhadraOverlap ?? null;
    if (bhadraOverlap) {
      diagnostics.push(
        `avoidKarana(vishti): Bhadra overlaps the window on the chosen day ` +
          `(${bhadraOverlap.start.toISOString()}–${bhadraOverlap.end.toISOString()}); ` +
          `Mukha/Pucchā split and Vāsa recorded in instants (bhadra*)`,
      );
    } else {
      diagnostics.push("avoidKarana(vishti): no Bhadra overlaps the chosen day's window");
    }
  }

  return {
    chosen: winner.c,
    coverageFraction: winner.frac,
    fallbackApplied: null,
    bhadraOverlap,
    diagnostics,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — resolving an Observance against real ephemeris
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000;

/** Map a `Kala` window name to its `time.ts` window function. */
function kalaWindow(kala: Kala, dayInstant: Date, loc: GeoLocation): TimeWindow | null {
  switch (kala) {
    case "sunrise":
    case "pratahkala":
      return sunriseWindow(dayInstant, loc);
    case "purvahna":
      return purvahna(dayInstant, loc);
    case "madhyahna":
      return madhyahna(dayInstant, loc);
    case "aparahna":
      return aparahna(dayInstant, loc);
    case "pradosha":
      return pradosha(dayInstant, loc);
    case "nishita":
      return nishita(dayInstant, loc);
    case "brahmaMuhurta":
      return brahmaMuhurta(dayInstant, loc);
    case "arunodaya":
      return arunodaya(dayInstant, loc);
    default:
      // moonrise / sunset / sankrantiPunyaKala are instants, not kāla windows
      // resolvable here; the tithi-pervades windows are the nine above.
      return null;
  }
}

/**
 * The absolute tithi number 1..30 for a {paksha, tithiRef}.
 *  • śukla pakṣa → 1..15 (15 = Pūrṇimā)
 *  • kṛṣṇa pakṣa → 16..30 (30 = Amāvāsyā)
 */
function absoluteTithi(paksha: Paksha, tithi: TithiRef): number {
  let n: number;
  if (tithi === "purnima") n = 15;
  else if (tithi === "amavasya") n = 15; // within kṛṣṇa, the 15th → absolute 30
  else n = tithi;
  if (n < 1 || n > 15) {
    throw new Error(`absoluteTithi: tithi ${String(tithi)} out of 1..15`);
  }
  return paksha === "shukla" ? n : 15 + n;
}

/** ISO-UTC helper. */
const iso = (d: Date): string => d.toISOString();

const SYNODIC_MS = 29.530588853 * DAY_MS;

/**
 * Locate the exact `{start,end}` interval of absolute tithi `n` (1..30) within
 * the lunation that begins at `nmStart` (a new moon). Returns null if tithi `n`
 * does not occur in this lunation (should not happen for a normal lunation).
 *
 * Tithis are NOT uniformly 1/30 of a lunation (the Moon's elongation rate
 * varies), so a fixed `n/30` probe can land a tithi off. We make a first guess
 * at (n − 0.5)/30 of the lunation, read the tithi there, then STEP toward `n`
 * by half a tithi at a time (re-reading boundaries) until we land on `n`.
 */
// Memoized by (lunation start, n): every tithi rule re-walks the same ~16
// lunations, and rules sharing a tithi number (all Ekādaśīs, all Pradoṣa, …)
// ask for the same (nmStart, n). Pure function → behaviour-preserving cache.
const _tithiIntervalCache = new Map<string, { start: Date; end: Date } | null>();

function tithiIntervalInLunation(
  nmStart: Date,
  n: number,
): { start: Date; end: Date } | null {
  const key = `${nmStart.getTime()}:${n}`;
  const cached = _tithiIntervalCache.get(key);
  if (cached !== undefined) return cached;
  const result = tithiIntervalInLunationUncached(nmStart, n);
  if (_tithiIntervalCache.size < 50_000) _tithiIntervalCache.set(key, result); // bound memory
  return result;
}

function tithiIntervalInLunationUncached(
  nmStart: Date,
  n: number,
): { start: Date; end: Date } | null {
  let probeMs = nmStart.getTime() + ((n - 0.5) / 30) * SYNODIC_MS;
  for (let iter = 0; iter < 8; iter++) {
    let tb;
    try {
      tb = tithiBoundaries(new Date(probeMs));
    } catch {
      return null;
    }
    if (tb.number === n) return { start: tb.start, end: tb.end };
    // Step toward n. Each tithi is ~ SYNODIC/30 wide; move (n − found) tithis.
    const delta = (n - tb.number) * (SYNODIC_MS / 30);
    // Re-centre on the found tithi's midpoint, then add delta.
    const mid = (tb.start.getTime() + tb.end.getTime()) / 2;
    probeMs = mid + delta;
  }
  // Final confirm.
  try {
    const tb = tithiBoundaries(new Date(probeMs));
    if (tb.number === n) return { start: tb.start, end: tb.end };
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Find the UTC `{start,end}` interval of absolute tithi `n` (1..30) in the lunar
 * month carrying pūrṇimānta label `monthPurnimanta` within `year`, or null.
 *
 * A given absolute tithi recurs once per lunation. We walk the year's lunations
 * (anchored on `newMoons(year)` plus the bracketing neighbours so Dec/Jan-edge
 * tithis resolve), find tithi `n` in each, and keep the occurrence whose
 * pūrṇimānta month label matches the rule's. More than one match can occur only
 * across an adhika month — we return the earliest and record the rest.
 */
function findTithiIntervalInMonth(
  n: number,
  monthPurnimanta: string,
  year: number,
  diagnostics: string[],
): { start: Date; end: Date } | null {
  const nms = newMoons(year);
  const starts: Date[] = [];
  if (nms.length > 0) starts.push(new Date(nms[0].getTime() - SYNODIC_MS));
  for (const nm of nms) starts.push(nm);
  if (nms.length > 0) starts.push(new Date(nms[nms.length - 1].getTime() + SYNODIC_MS));

  // Determine whether the rule explicitly requests the adhika lunation.
  // This must be decided BEFORE scanning so we can adjust label matching.
  const requestsAdhika = /adhika/i.test(monthPurnimanta);

  const matches: { interval: { start: Date; end: Date }; adhika: boolean }[] = [];
  const seen = new Set<number>();

  for (const nmStart of starts) {
    const interval = tithiIntervalInLunation(nmStart, n);
    if (!interval) continue;
    const key = Math.round(interval.start.getTime() / 1000);
    if (seen.has(key)) continue;
    seen.add(key);

    // Label check at the tithi's midpoint.
    // In pūrṇimānta the kṛṣṇa pakṣa of an amānta month carries the NEXT amānta
    // month's name (e.g. kṛṣṇa pakṣa of Adhika Jyeṣṭha → purnimantaLabel =
    // "Adhika Āṣāḍha").  When the rule requests an adhika month we therefore
    // also check the AMĀNTA label — but ONLY for genuinely adhika lunations — so
    // that both the śukla and the kṛṣṇa fortnights of the adhika lunation are
    // captured without also matching the nija lunation's kṛṣṇa pakṣa.
    const mid = new Date((interval.start.getTime() + interval.end.getTime()) / 2);
    const lm = lunarMonth(mid, { system: "purnimanta" });
    const purnimantaMatch = normalizeLabel(lm.purnimantaLabel) === normalizeLabel(monthPurnimanta);
    // Amānta fallback: only used when requesting an adhika month AND the tithi
    // itself belongs to an adhika lunation (prevents nija kṛṣṇa-pakṣa false hits).
    const amantaMatch = requestsAdhika && lm.adhika &&
      normalizeLabel(lm.amantaLabel) === normalizeLabel(monthPurnimanta);
    if (purnimantaMatch || amantaMatch) {
      matches.push({ interval, adhika: lm.adhika });
    }
  }

  if (matches.length === 0) {
    if (requestsAdhika) {
      diagnostics.push(
        `no Adhika ${normalizeLabel(monthPurnimanta)} lunation found in ${year}; ` +
          `rule "${monthPurnimanta}" requires an adhika month that does not exist this year`,
      );
    } else {
      diagnostics.push(
        `no tithi ${n} found in pūrṇimānta month "${monthPurnimanta}" during ${year}`,
      );
    }
    return null;
  }
  if (matches.length > 1) {
    // In a leap year the same normalized month name appears in both the Adhika and
    // the Nija (regular) lunation.
    if (requestsAdhika) {
      // Rule explicitly targets the Adhika lunation (e.g. "Adhika Jyeshtha").
      const adhika = matches.find((m) => m.adhika);
      if (adhika) {
        diagnostics.push(
          `${matches.length} occurrences of tithi ${n} in "${monthPurnimanta}" ${year} ` +
            `(adhika month present); rule requests Adhika — selecting the adhika lunation`,
        );
        return adhika.interval;
      }
      // No adhika lunation found among matches despite requestsAdhika — should not
      // happen if normalizeLabel correctly stripped the prefix, but guard anyway.
      diagnostics.push(
        `rule "${monthPurnimanta}" requests an adhika lunation but none was found ` +
          `among ${matches.length} matches in ${year}; returning null`,
      );
      return null;
    } else {
      // Festivals canonically fall in the Nija month; prefer the non-adhika occurrence.
      const nija = matches.find((m) => !m.adhika);
      if (nija) {
        diagnostics.push(
          `${matches.length} occurrences of tithi ${n} in "${monthPurnimanta}" ${year} ` +
            `(adhika month present); preferring the Nija (non-adhika) lunation`,
        );
        return nija.interval;
      }
      // All matches are adhika (unusual) — fall back to earliest.
      diagnostics.push(
        `${matches.length} occurrences of tithi ${n} in "${monthPurnimanta}" ${year} ` +
          `(all adhika?); using the earliest`,
      );
    }
  }

  if (requestsAdhika && matches.length === 1) {
    // Single match for an adhika-requested rule — verify it is actually the adhika lunation.
    if (!matches[0].adhika) {
      diagnostics.push(
        `rule "${monthPurnimanta}" requests an adhika lunation but only a non-adhika ` +
          `match was found in ${year}; no Adhika ${normalizeLabel(monthPurnimanta)} ` +
          `lunation exists this year`,
      );
      return null;
    }
    // Single adhika match — return it directly.
    return matches[0].interval;
  }

  matches.sort((a, b) => a.interval.start.getTime() - b.interval.start.getTime());
  return matches[0].interval;
}

/** Normalise a month label for comparison (lower, strip Adhika/Nija/Shuddha). */
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/\b(adhika|nija|shuddha|sudha)\b/g, "").trim();
}

/**
 * The set of civil days a tithi interval touches in `loc`'s tz — usually one or
 * two (a tithi spans ~24h and can straddle two civil days). Returned as the
 * UTC instant of each local-day midnight, ascending.
 */
function civilDaysTouched(
  interval: { start: Date; end: Date },
  loc: GeoLocation,
): Date[] {
  const firstDay = startOfLocalDayUTC(interval.start, loc.timeZone);
  const days: Date[] = [firstDay];
  // Walk forward by local day until we pass the interval end.
  let cursor = firstDay;
  for (let i = 0; i < 3; i++) {
    const next = nextLocalDayStartUTC(cursor, loc.timeZone);
    if (next.getTime() > interval.end.getTime()) break;
    days.push(next);
    cursor = next;
  }
  return days;
}

/** Resolve a `tithi-pervades` observance to a FestivalResult-ready payload. */
function resolveTithiPervades(
  obs: Extract<Observance, { kind: "tithi-pervades" }>,
  year: number,
  loc: GeoLocation,
  monthPurnimanta: string,
  diagnostics: string[],
): { day: Date | null; instants: Record<string, string> } {
  const n = absoluteTithi(obs.paksha, obs.tithi);
  // Adhika-māsa policy: a "prefer-adhika" rule observes in the leap lunation of
  // the named month when one exists this year (e.g. Ganga Dussehra → Adhika
  // Jyeṣṭha). Probe the "Adhika <month>" label first with a throwaway diagnostic
  // sink; if absent (an ordinary year), fall through to the nija lunation.
  let interval: { start: Date; end: Date } | null = null;
  if (obs.adhika === "prefer-adhika" && !/adhika/i.test(monthPurnimanta)) {
    interval = findTithiIntervalInMonth(n, `Adhika ${monthPurnimanta}`, year, []);
    if (interval) diagnostics.push(`adhika(prefer-adhika): observing in the Adhika ${monthPurnimanta} lunation`);
  }
  if (!interval) interval = findTithiIntervalInMonth(n, monthPurnimanta, year, diagnostics);
  const instants: Record<string, string> = {};
  if (!interval) return { day: null, instants };

  instants.tithiStart = iso(interval.start);
  instants.tithiEnd = iso(interval.end);

  // Build a candidate per civil day the tithi touches.
  const days = civilDaysTouched(interval, loc);
  // Precompute Bhadra (Viṣṭi) spans once per festival: the candidate days all
  // belong to one lunation, so a single ±synodic scan around the tithi covers
  // every day's window — no need to rescan (16 SearchMoonPhase calls) per day.
  const bhadraSet =
    obs.avoidKarana === "vishti" ? bhadraIntervals(interval.start) : null;
  const candidates: PervasionCandidate[] = [];
  for (const dayMidnight of days) {
    const win = kalaWindow(obs.window, dayMidnight, loc);
    if (!win) {
      diagnostics.push(
        `kāla window "${obs.window}" unavailable on ${localDayString(dayMidnight, loc.timeZone)} (polar?)`,
      );
      continue;
    }
    // Nakshatra fact at the window's anchor instant (its start).
    let nakshatraOk: boolean | undefined;
    if (obs.nakshatra) {
      const idx = nakshatraAt(win.start);
      nakshatraOk = NAKSHATRA_NAMES[idx] === obs.nakshatra.name;
    }
    // Bhadra overlap with the window, if requested. We record BOTH the first
    // overlapping interval (for diagnostics) and whether ANY part of the window
    // is Bhadra-free (so the selector can disqualify a wholly-contaminated day).
    let bhadra: { start: Date; end: Date } | null | undefined;
    let bhadraFreeWindow: boolean | undefined;
    let tithiAtSunrise: boolean | undefined;
    if (obs.avoidKarana === "vishti") {
      bhadra = null;
      const winLen = win.end.getTime() - win.start.getTime();
      let coveredMs = 0;
      for (const bi of bhadraSet ?? []) {
        const ov = overlapMs(bi, { start: win.start, end: win.end });
        if (ov > 0) {
          if (!bhadra) bhadra = { start: bi.start, end: bi.end };
          coveredMs += ov;
        }
      }
      // Bhadra-free iff a meaningful slice of the window is uncovered. Allow a
      // 1-second slack for boundary/rounding noise, but never let the slack
      // exceed half the window — otherwise a sub-second window would push the
      // threshold negative and misclassify a Bhadra-FREE day as wholly covered.
      const slack = Math.min(1000, winLen / 2);
      bhadraFreeWindow = coveredMs < winLen - slack;
      // Udaya fact: is the festival tithi live at this day's sunrise? Used to
      // pick the Bhadra-free observance day when the tithi has left the window.
      const sr = riseSet("rise", dayMidnight, loc);
      if (sr) tithiAtSunrise = tithiLiveAt(interval, sr);
    }
    candidates.push({
      day: dayMidnight,
      tithiInterval: interval,
      window: { start: win.start, end: win.end },
      nakshatraOk,
      bhadraOverlap: bhadra,
      bhadraFreeWindow,
      tithiAtSunrise,
    });
  }

  if (candidates.length === 0) {
    diagnostics.push("tithi-pervades: no usable candidate day (windows unavailable)");
    return { day: null, instants };
  }

  const sel = selectDayByPervasion(candidates, {
    precedence: obs.precedence,
    nakshatra: obs.nakshatra?.mode,
    avoidKarana: obs.avoidKarana,
    // Never silently drop: when a rule specifies no fallback and the tithi
    // pervades the ritual window on NO candidate day (e.g. a niśīta Caturdaśī or
    // a pradoṣa/sunrise tithi that straddles the window at a far-western/eastern
    // longitude), resolve to the day that holds the largest portion of the tithi
    // instead of returning no date. `nearest-window` only fires on total
    // non-pervasion, so it cannot change a day the tithi actually pervades.
    // A required-nakshatra wipeout is handled separately and still yields no date.
    fallback: obs.fallback ?? "nearest-window",
  });
  for (const d of sel.diagnostics) diagnostics.push(d);

  let chosenDay: Date | null = sel.chosen ? sel.chosen.day : null;

  // Apply fallback when nothing pervaded.
  if (!chosenDay && sel.fallbackApplied) {
    const base = days[0];
    chosenDay =
      sel.fallbackApplied === "previous-day"
        ? startOfLocalDayUTC(new Date(base.getTime() - DAY_MS), loc.timeZone)
        : nextLocalDayStartUTC(days[days.length - 1], loc.timeZone);
    diagnostics.push(`fallback applied: ${sel.fallbackApplied}`);
  }

  if (chosenDay) {
    const win = kalaWindow(obs.window, chosenDay, loc);
    if (win) {
      instants.windowStart = iso(win.start);
      instants.windowEnd = iso(win.end);
    }
    if (sel.bhadraOverlap) {
      instants.bhadraStart = iso(sel.bhadraOverlap.start);
      instants.bhadraEnd = iso(sel.bhadraOverlap.end);
      // Mukha (avoid) / Pucchā (auspicious) split + Vāsa of this Bhadra span.
      const split = bhadraSplit(sel.bhadraOverlap);
      instants.bhadraVasa = split.vasa;
      instants.bhadraMukhaStart = iso(split.mukha.start);
      instants.bhadraMukhaEnd = iso(split.mukha.end);
      instants.bhadraPucchaStart = iso(split.puccha.start);
      instants.bhadraPucchaEnd = iso(split.puccha.end);
    }
  }

  return { day: chosenDay, instants };
}

/** Resolve a `solar-ingress` observance. */
function resolveSolarIngress(
  obs: Extract<Observance, { kind: "solar-ingress" }>,
  year: number,
  loc: GeoLocation,
  diagnostics: string[],
): { day: Date | null; instants: Record<string, string> } {
  const instants: Record<string, string> = {};
  let moment: Date;
  try {
    moment = solarIngress(year, obs.rashi);
  } catch (e) {
    diagnostics.push(`solar-ingress: ${(e as Error).message}`);
    return { day: null, instants };
  }
  instants.ingress = iso(moment);

  const punya = sankrantiPunyaKala(moment, loc);
  if (punya) {
    instants.punyaKalaStart = iso(punya.start);
    instants.punyaKalaEnd = iso(punya.end);
  } else {
    diagnostics.push("solar-ingress: puṇya-kāla unavailable (polar?)");
  }

  // The Sankrānti's civil DATE is the ingress day — the day the Sun enters the
  // rāśi (this is what panchāṅgas mark). The puṇya-kāla window recorded above
  // still encodes the after-sunset → next-morning shift used for the snāna
  // timing, so that information is preserved in the instants.
  const day = startOfLocalDayUTC(moment, loc.timeZone);
  return { day, instants };
}

/** Resolve a `moonrise` observance: tithi live at moonrise. */
function resolveMoonrise(
  obs: Extract<Observance, { kind: "moonrise" }>,
  year: number,
  loc: GeoLocation,
  monthPurnimanta: string,
  diagnostics: string[],
): { day: Date | null; instants: Record<string, string> } {
  const instants: Record<string, string> = {};
  const n = absoluteTithi(obs.paksha, obs.tithi);
  const interval = findTithiIntervalInMonth(n, monthPurnimanta, year, diagnostics);
  if (!interval) return { day: null, instants };
  instants.tithiStart = iso(interval.start);
  instants.tithiEnd = iso(interval.end);

  // Examine each civil day the tithi touches; pick the one whose moonrise falls
  // inside the tithi interval.
  const days = civilDaysTouched(interval, loc);
  for (const dayMidnight of days) {
    const mr = moonrise(dayMidnight, loc);
    if (!mr) continue;
    if (mr.getTime() >= interval.start.getTime() && mr.getTime() < interval.end.getTime()) {
      instants.moonrise = iso(mr);
      return { day: dayMidnight, instants };
    }
  }
  // No moonrise fell inside the tithi: fall back to the day whose moonrise is
  // nearest after the tithi start (best-effort) and record a diagnostic.
  let best: { day: Date; mr: Date } | null = null;
  for (const dayMidnight of days) {
    const mr = moonrise(dayMidnight, loc);
    if (!mr) continue;
    if (!best || mr.getTime() < best.mr.getTime()) best = { day: dayMidnight, mr };
  }
  if (best) {
    instants.moonrise = iso(best.mr);
    diagnostics.push("moonrise: tithi not live at any moonrise; used nearest moonrise day");
    return { day: best.day, instants };
  }
  diagnostics.push("moonrise: no moonrise on any candidate day (polar?)");
  return { day: null, instants };
}

/** Resolve a `solar-arghya` observance: tithi at sunset + next sunrise. */
function resolveSolarArghya(
  obs: Extract<Observance, { kind: "solar-arghya" }>,
  year: number,
  loc: GeoLocation,
  monthPurnimanta: string,
  diagnostics: string[],
): { day: Date | null; instants: Record<string, string> } {
  const instants: Record<string, string> = {};
  const n = absoluteTithi(obs.paksha, obs.tithi);
  const interval = findTithiIntervalInMonth(n, monthPurnimanta, year, diagnostics);
  if (!interval) return { day: null, instants };
  instants.tithiStart = iso(interval.start);
  instants.tithiEnd = iso(interval.end);

  const days = civilDaysTouched(interval, loc);
  // The arghya day = the day whose sunset falls inside the tithi interval.
  let chosen: Date | null = null;
  for (const dayMidnight of days) {
    const ss = sunset(dayMidnight, loc);
    if (!ss) continue;
    if (ss.getTime() >= interval.start.getTime() && ss.getTime() < interval.end.getTime()) {
      chosen = dayMidnight;
      instants.sandhyaArghya = iso(ss); // evening offering
      break;
    }
  }
  if (!chosen) {
    // Fall back to the first day with a sunset.
    for (const dayMidnight of days) {
      const ss = sunset(dayMidnight, loc);
      if (ss) {
        chosen = dayMidnight;
        instants.sandhyaArghya = iso(ss);
        diagnostics.push("solar-arghya: tithi not live at any sunset; used first sunset day");
        break;
      }
    }
  }
  if (!chosen) {
    diagnostics.push("solar-arghya: no sunset on any candidate day (polar?)");
    return { day: null, instants };
  }
  // Uṣā arghya = the NEXT morning's sunrise.
  const nextDay = nextLocalDayStartUTC(chosen, loc.timeZone);
  const sr = riseSet("rise", nextDay, loc);
  if (sr) instants.ushaArghya = iso(sr);
  else diagnostics.push("solar-arghya: next-morning sunrise unavailable (polar?)");

  return { day: chosen, instants };
}

/**
 * Resolve a `nakshatra-pervades` observance: the civil day on which the Moon
 * occupies the named nakṣatra at sunrise while the Sun is in `solarRashi`. We
 * scan the solar month (from its ingress to the next rāśi's) and return the
 * first day whose sunrise carries the target nakṣatra. (Onam = Śravaṇa in Siṃha.)
 */
function resolveNakshatraPervades(
  obs: Extract<Observance, { kind: "nakshatra-pervades" }>,
  year: number,
  loc: GeoLocation,
  diagnostics: string[],
): { day: Date | null; instants: Record<string, string> } {
  const instants: Record<string, string> = {};
  const nakIdx = (NAKSHATRA_NAMES as readonly string[]).indexOf(obs.nakshatra);
  if (nakIdx < 0) {
    diagnostics.push(`nakshatra-pervades: unknown nakshatra "${obs.nakshatra}"`);
    return { day: null, instants };
  }
  let start: Date;
  let end: Date;
  try {
    start = solarIngress(year, obs.solarRashi);
    end = solarIngress(year, (obs.solarRashi + 1) % 12);
  } catch (e) {
    diagnostics.push(`nakshatra-pervades: ${(e as Error).message}`);
    return { day: null, instants };
  }
  // If the next ingress wrapped before `start` (Mīna→Mesha across the year
  // boundary), the month runs into the next year — extend the scan window.
  const endMs = end.getTime() > start.getTime() ? end.getTime() : start.getTime() + 32 * DAY_MS;
  instants.solarMonthStart = iso(start);
  let cursor = startOfLocalDayUTC(start, loc.timeZone);
  for (let i = 0; i < 40 && cursor.getTime() < endMs; i++) {
    const sr = riseSet("rise", cursor, loc);
    if (sr && nakshatraAt(sr) === nakIdx && siderealSunRashi(sr) === obs.solarRashi) {
      instants.sunrise = iso(sr);
      instants.sunriseNakshatra = obs.nakshatra;
      return { day: cursor, instants };
    }
    cursor = nextLocalDayStartUTC(cursor, loc.timeZone);
  }
  diagnostics.push(
    `nakshatra-pervades: ${obs.nakshatra} not found at sunrise during the Sun's transit of rāśi ${obs.solarRashi} in ${year}`,
  );
  return { day: null, instants };
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — public compute API
// ═══════════════════════════════════════════════════════════════════════════

export interface ComputeOptions {
  /** The rule set to evaluate. (Task 5b supplies the real `rules.ts`.) */
  rules?: FestivalRule[];
}

/**
 * Compute one festival's result. `resolved` supplies already-computed results
 * for `derived` rules to reference (their `from` id → FestivalResult).
 */
export function computeFestival(
  rule: FestivalRule,
  year: number,
  loc: GeoLocation,
  resolved?: Map<string, FestivalResult>,
): FestivalResult {
  validateLocation(loc);
  const diagnostics: string[] = [];
  const obs = rule.observance;

  let day: Date | null = null;
  let instants: Record<string, string> = {};

  switch (obs.kind) {
    case "tithi-pervades": {
      const r = resolveTithiPervades(obs, year, loc, rule.month?.purnimanta ?? "", diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "solar-ingress": {
      const r = resolveSolarIngress(obs, year, loc, diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "moonrise": {
      const r = resolveMoonrise(obs, year, loc, rule.month?.purnimanta ?? "", diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "solar-arghya": {
      const r = resolveSolarArghya(obs, year, loc, rule.month?.purnimanta ?? "", diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "derived": {
      const baseRes = resolved?.get(obs.from);
      if (!baseRes) {
        diagnostics.push(`derived: referenced rule "${obs.from}" not found / not yet computed`);
      } else if (!baseRes.date) {
        diagnostics.push(`derived: referenced rule "${obs.from}" has no date`);
      } else {
        const base = new Date(`${baseRes.date}T00:00:00Z`);
        base.setUTCDate(base.getUTCDate() + obs.offsetDays);
        // The offset is in civil days; the base date already is a civil date in
        // loc's tz, so a UTC-date add keeps the same local calendar offset.
        instants.derivedFrom = obs.from;
        instants.offsetDays = String(obs.offsetDays);
        const dateStr = base.toISOString().slice(0, 10);
        return {
          id: rule.id,
          date: dateStr,
          instants,
          monthLabel: monthLabelFor(dateStr, loc),
          diagnostics,
        };
      }
      break;
    }
    case "nakshatra-pervades": {
      const r = resolveNakshatraPervades(obs, year, loc, diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "weekday-relative": {
      const baseRes = resolved?.get(obs.from);
      if (!baseRes || !baseRes.date) {
        diagnostics.push(
          `weekday-relative: referenced rule "${obs.from}" ${baseRes ? "has no date" : "not found / not yet computed"}`,
        );
      } else {
        // Latest `weekday` strictly before the anchor festival's date.
        const d = new Date(`${baseRes.date}T12:00:00Z`);
        do {
          d.setUTCDate(d.getUTCDate() - 1);
        } while (d.getUTCDay() !== obs.weekday);
        const dateStr = d.toISOString().slice(0, 10);
        instants.relativeTo = obs.from;
        instants.anchorDate = baseRes.date;
        return { id: rule.id, date: dateStr, instants, monthLabel: monthLabelFor(dateStr, loc), diagnostics };
      }
      break;
    }
  }

  const date = day ? localDayString(day, loc.timeZone) : "";
  if (!date) {
    diagnostics.push(`rule "${rule.id}" resolved to no date`);
  }

  return {
    id: rule.id,
    date,
    instants,
    monthLabel: date ? monthLabelFor(date, loc) : { purnimanta: rule.month?.purnimanta ?? "", amanta: "" },
    diagnostics,
  };
}

/** Both month labels for a civil date (anchored at local noon to avoid edges). */
function monthLabelFor(dateStr: string, loc: GeoLocation): { purnimanta: string; amanta: string } {
  // Anchor at local-day midnight + 12h so we're firmly inside the day.
  const midnight = startOfLocalDayUTC(new Date(`${dateStr}T00:00:00Z`), loc.timeZone);
  const noonish = new Date(midnight.getTime() + DAY_MS / 2);
  const lm = lunarMonth(noonish, { system: "purnimanta" });
  return { purnimanta: lm.purnimantaLabel, amanta: lm.amantaLabel };
}

/**
 * Compute all festivals for `(year, loc)`.
 *
 * Resolves non-derived rules first, then derived rules (so their references
 * exist). Orders results ascending by date; undated results sort last.
 * NEVER silently drops: any undated result carries a diagnostic, and a matching
 * top-level diagnostic is emitted.
 */
export function computeFestivals(
  year: number,
  loc: GeoLocation,
  opts: ComputeOptions = {},
): { results: FestivalResult[]; diagnostics: string[] } {
  validateLocation(loc); // fail fast on bad input (not per-rule)
  const rules = opts.rules ?? [];
  const topDiagnostics: string[] = [];
  const resolved = new Map<string, FestivalResult>();

  // Two passes: non-derived first so cross-referencing rules (derived offsets
  // and weekday-relative anchors) can read their `from` festival's result.
  const refsAnother = (r: FestivalRule): boolean =>
    r.observance.kind === "derived" || r.observance.kind === "weekday-relative";
  const nonDerived = rules.filter((r) => !refsAnother(r));
  const derived = rules.filter(refsAnother);

  for (const rule of [...nonDerived, ...derived]) {
    // Per-rule isolation: an unexpected throw in one resolver must NOT abort the
    // whole batch — convert it to a dated-empty result (the never-silently-drop
    // contract), so one bad rule can't take down the rest of the calendar.
    let res: FestivalResult;
    try {
      res = computeFestival(rule, year, loc, resolved);
    } catch (e) {
      res = {
        id: rule.id,
        date: "",
        instants: {},
        monthLabel: { purnimanta: rule.month?.purnimanta ?? "", amanta: "" },
        diagnostics: [`rule "${rule.id}" threw during resolution: ${(e as Error).message}`],
      };
    }
    resolved.set(rule.id, res);
  }

  const results = rules.map((r) => resolved.get(r.id)!);

  // Surface every miss at the top level too (never silent).
  for (const r of results) {
    if (!r.date) {
      topDiagnostics.push(`"${r.id}" produced no date: ${r.diagnostics.join("; ") || "unknown"}`);
    }
  }

  // Order by date; undated (empty string) last.
  results.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return { results, diagnostics: topDiagnostics };
}
