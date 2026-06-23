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
  newMoons,
  solarIngress,
  lunarMonth,
  NAKSHATRA_NAMES,
} from "./elements.js";

import {
  type TimeWindow,
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
}

export type Precedence = "max-window-fraction" | "udaya" | "first" | "second";

export interface SelectOptions {
  precedence: Precedence;
  /** Nakshatra mode, if the rule has a nakshatra clause. */
  nakshatra?: "required" | "preferred";
  avoidKarana?: "vishti";
  fallback?: "previous-day" | "next-day";
}

export interface SelectResult {
  /** The winning candidate, or null when none qualifies. */
  chosen: PervasionCandidate | null;
  /** Window-coverage fraction of the chosen day (0 when none). */
  coverageFraction: number;
  /** The fallback that was triggered because no day pervaded, if any. */
  fallbackApplied: "previous-day" | "next-day" | null;
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

/** Is the tithi live at the window's start instant (udaya)? */
function presentAtStart(c: PervasionCandidate): boolean {
  const s = c.window.start.getTime();
  return c.tithiInterval.start.getTime() <= s && c.tithiInterval.end.getTime() > s;
}

/**
 * Select the observance day among `candidates` per the precedence policy.
 *
 * Pipeline:
 *   1. `nakshatra:"required"` → drop candidates with `nakshatraOk === false`.
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
 *   6. If no survivor, set `fallbackApplied` and explain.
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

  // 2. Keep candidates that actually pervade the window (coverage > 0).
  const withCoverage = pool.map((c) => ({ c, frac: windowFraction(c.tithiInterval, c.window) }));
  const pervading = withCoverage.filter((x) => x.frac > 0);

  if (pervading.length === 0) {
    // No day pervades — fallback (or simply unresolved).
    if (pool.length === 0 && opts.nakshatra === "required") {
      diagnostics.push("no candidate satisfied the required nakshatra; no day chosen");
    } else {
      diagnostics.push("tithi did not pervade the window on any candidate day");
    }
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
          `Mukha/Pucchā split deferred to Phase 4`,
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
    default:
      // moonrise / sunset / arunodaya / sankrantiPunyaKala are not kāla windows
      // resolvable here; tithi-pervades windows are only the eight above.
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
function tithiIntervalInLunation(
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

  const matches: { start: Date; end: Date }[] = [];
  const seen = new Set<number>();

  for (const nmStart of starts) {
    const interval = tithiIntervalInLunation(nmStart, n);
    if (!interval) continue;
    const key = Math.round(interval.start.getTime() / 1000);
    if (seen.has(key)) continue;
    seen.add(key);

    // Label check at the tithi's midpoint (Adhika/Nija prefixes part of label).
    const mid = new Date((interval.start.getTime() + interval.end.getTime()) / 2);
    const lm = lunarMonth(mid, { system: "purnimanta" });
    if (normalizeLabel(lm.purnimantaLabel) === normalizeLabel(monthPurnimanta)) {
      matches.push(interval);
    }
  }

  if (matches.length === 0) {
    diagnostics.push(
      `no tithi ${n} found in pūrṇimānta month "${monthPurnimanta}" during ${year}`,
    );
    return null;
  }
  if (matches.length > 1) {
    diagnostics.push(
      `${matches.length} occurrences of tithi ${n} in "${monthPurnimanta}" ${year} ` +
        `(adhika month?); using the earliest`,
    );
  }
  matches.sort((a, b) => a.start.getTime() - b.start.getTime());
  return matches[0];
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
  const interval = findTithiIntervalInMonth(n, monthPurnimanta, year, diagnostics);
  const instants: Record<string, string> = {};
  if (!interval) return { day: null, instants };

  instants.tithiStart = iso(interval.start);
  instants.tithiEnd = iso(interval.end);

  // Build a candidate per civil day the tithi touches.
  const days = civilDaysTouched(interval, loc);
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
    // Bhadra overlap with the window, if requested.
    let bhadra: { start: Date; end: Date } | null | undefined;
    if (obs.avoidKarana === "vishti") {
      bhadra = null;
      const intervals = bhadraIntervals(win.start);
      for (const bi of intervals) {
        if (overlapMs(bi, { start: win.start, end: win.end }) > 0) {
          bhadra = { start: bi.start, end: bi.end };
          break;
        }
      }
    }
    candidates.push({
      day: dayMidnight,
      tithiInterval: interval,
      window: { start: win.start, end: win.end },
      nakshatraOk,
      bhadraOverlap: bhadra,
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
    fallback: obs.fallback,
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

  // The civil day is the puṇya-kāla day (which already encodes the
  // after-sunset → next-day shift), else the ingress day.
  const anchor = punya ? punya.start : moment;
  const day = startOfLocalDayUTC(anchor, loc.timeZone);
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
  const diagnostics: string[] = [];
  const obs = rule.observance;

  let day: Date | null = null;
  let instants: Record<string, string> = {};

  switch (obs.kind) {
    case "tithi-pervades": {
      const r = resolveTithiPervades(obs, year, loc, rule.month.purnimanta, diagnostics);
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
      const r = resolveMoonrise(obs, year, loc, rule.month.purnimanta, diagnostics);
      day = r.day;
      instants = r.instants;
      break;
    }
    case "solar-arghya": {
      const r = resolveSolarArghya(obs, year, loc, rule.month.purnimanta, diagnostics);
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
  }

  const date = day ? localDayString(day, loc.timeZone) : "";
  if (!date) {
    diagnostics.push(`rule "${rule.id}" resolved to no date`);
  }

  return {
    id: rule.id,
    date,
    instants,
    monthLabel: date ? monthLabelFor(date, loc) : { purnimanta: rule.month.purnimanta, amanta: "" },
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
  const rules = opts.rules ?? [];
  const topDiagnostics: string[] = [];
  const resolved = new Map<string, FestivalResult>();

  // Two passes: non-derived first so derived `from` refs are available.
  const nonDerived = rules.filter((r) => r.observance.kind !== "derived");
  const derived = rules.filter((r) => r.observance.kind === "derived");

  for (const rule of [...nonDerived, ...derived]) {
    const res = computeFestival(rule, year, loc, resolved);
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
