/**
 * src/elements.ts — calendar-elements core: tithi, nakshatra, karaṇa/Bhadra,
 * new moons, solar ingress (saṅkrānti), and amānta/pūrṇimānta lunar months.
 *
 * SOURCING (the two fiddly conventions are pinned to authorities, not guessed):
 *
 * • KARAṆA SEQUENCE — Wikipedia "Karaṇa (pañcāṅga)"
 *   https://en.wikipedia.org/wiki/Karana_(pancanga)
 *   A karaṇa is half a tithi: the span over which Moon−Sun elongation grows 6°.
 *   A lunar month (0°…360° elongation) has 60 half-tithis, indexed h = 0..59:
 *     h = 0                          → Kiṁstughna   (fixed)
 *     h = 1..56                      → the 7 movable karaṇas cycling with
 *                                      ((h−1) mod 7) over
 *                                      [Bava, Bālava, Kaulava, Taitila, Gara,
 *                                       Vaṇij, Viṣṭi]   (8 full cycles = 56)
 *     h = 57 → Śakuni, 58 → Catuṣpāda, 59 → Nāga   (fixed)
 *   Viṣṭi ≡ Bhadra. (The Bhadra Mukha/Pucchā subdivision is a Phase-4
 *   refinement and is NOT implemented here — see bhadraIntervals docs.)
 *
 * • LUNAR-MONTH NAMING / ADHIKA / KṢAYA — Wikipedia "Hindu calendar" &
 *   "Adhika-masa" (https://en.wikipedia.org/wiki/Adhika-masa,
 *   https://en.wikipedia.org/wiki/Hindu_calendar), consistent with
 *   drikpanchang's adhika-masa definition.
 *   An amānta lunation (new moon → next new moon) is named after the rāśi the
 *   Sun ENTERS (the saṅkrānti) DURING that lunation:
 *     Mesha saṅkrānti → Chaitra, Vṛṣabha → Vaiśākha, Mithuna → Jyeṣṭha, …
 *     i.e. month-name-index (0=Chaitra) = entered-rāśi-index (0=Mesha).
 *   • A lunation with NO saṅkrānti is **adhika** (leap): it takes the name of
 *     the FOLLOWING lunation's saṅkrānti, prefixed "Adhika"; the following
 *     lunation is then "Nija/Śuddha".  (Algorithmically: an adhika lunation
 *     inherits the next lunation's month name.)
 *   • A lunation with TWO saṅkrāntis is **kṣaya** (lost month, ~1/140 yr).
 *
 * • PŪRṆIMĀNTA label — derived from the amānta result. A pūrṇimānta month runs
 *   full-moon → full-moon, so its kṛṣṇa-pakṣa (waning) half belongs to the
 *   amānta month one NAME EARLIER. Concretely: in the kṛṣṇa pakṣa the
 *   pūrṇimānta name = next amānta name; in the śukla pakṣa they coincide.
 *   Dates do not change — only the label.
 *
 * ASTRONOMY PRIMITIVES
 *   • Elongation = geocentric Moon−Sun ecliptic-longitude difference in [0,360):
 *     Astronomy.PairLongitude(Body.Moon, Body.Sun, date) (== MoonPhase(date)).
 *   • Tithi / karaṇa / new-moon boundaries via Astronomy.SearchMoonPhase(target,
 *     start, limitDays) — robust against intra-day non-monotonicity.
 *   • Nakshatra & saṅkrānti use the SIDEREAL longitudes from ayanamsha.ts
 *     (siderealLongitude / siderealSunRashi), kept consistent with Drik Panchang.
 */

import {
  Body,
  PairLongitude,
  SearchMoonPhase,
  MakeTime,
  type FlexibleDateTime,
} from "astronomy-engine";

import { siderealLongitude, siderealSunRashi, normalize360 } from "./ayanamsha.js";

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

/** Degrees of elongation per tithi (one of 30 in a lunation). */
const DEG_PER_TITHI = 12;
/** Degrees of elongation per karaṇa (half-tithi; 60 in a lunation). */
const DEG_PER_KARANA = 6;
/** Number of nakshatras; arc each spans = 360/27 = 13°20′. */
const NAKSHATRA_COUNT = 27;
const DEG_PER_NAKSHATRA = 360 / NAKSHATRA_COUNT;
/** Mean synodic month, days — used only to size search windows. */
const SYNODIC_MONTH_DAYS = 29.530588853;

/** The 30 tithi names (1-based: index 0 = tithi 1 = Pratipadā). */
export const TITHI_NAMES = [
  "Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi",
  "Trayodashi", "Chaturdashi", "Purnima",
  "Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi",
  "Trayodashi", "Chaturdashi", "Amavasya",
] as const;

/** The 27 nakshatra names (index 0 = Ashwini; Rohini = 3). */
export const NAKSHATRA_NAMES = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
  "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

/** The 7 movable (cara) karaṇas, in cyclic order. Viṣṭi (index 6) ≡ Bhadra. */
export const MOVABLE_KARANAS = [
  "Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanij", "Vishti",
] as const;

/** Karaṇa name for a half-tithi index h ∈ 0..59 (see file header for sourcing). */
export function karanaName(h: number): string {
  if (h === 0) return "Kimstughna";
  if (h === 57) return "Shakuni";
  if (h === 58) return "Chatushpada";
  if (h === 59) return "Naga";
  // h = 1..56 → movable cycle
  return MOVABLE_KARANAS[(h - 1) % 7];
}

/**
 * The 12 amānta lunar-month names, indexed by the rāśi the Sun enters:
 * index 0 = Mesha → Chaitra, … index 11 = Mīna → Phalguna.
 */
export const LUNAR_MONTH_NAMES = [
  "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
  "Ashwina", "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna",
] as const;

// ───────────────────────────────────────────────────────────────────────────
// Generic root-finding helper (monotone longitude crossing, bisection)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Root-find the instant in (lo, hi] at which `f` (an angle in degrees, assumed
 * to increase monotonically mod 360 across the bracket) crosses `target`.
 *
 * `lo` and `hi` are millisecond epochs bracketing exactly one crossing.
 * `f(ms)` returns the angle in [0,360). We measure the signed forward gap from
 * `target` (how far the angle has advanced past `target`, in [0,360)) and
 * bisect on the sign change. Converges to ~sub-second.
 */
function bisectLongitudeCrossing(
  f: (ms: number) => number,
  target: number,
  lo: number,
  hi: number,
): Date {
  // forward distance the angle has travelled past `target`, in [0,360)
  const past = (ms: number): number => normalize360(f(ms) - target);
  // At lo the angle is just BEFORE target → past(lo) is near 360 (large).
  // At hi the angle is just AFTER target → past(hi) is near 0 (small).
  // We look for the step where past jumps from ~360 down to ~0; the crossing
  // is where forward distance from the lo-side equals the bracket.
  // Reframe as: g(ms) = angularDelta(f(ms), target) signed so it is negative
  // before the crossing and non-negative after.
  const signed = (ms: number): number => {
    const d = normalize360(f(ms) - target); // [0,360)
    return d > 180 ? d - 360 : d; // (−180,180]
  };
  let a = lo;
  let b = hi;
  let fa = signed(a);
  // Guard: ensure a sign change exists; if not, return the closest endpoint.
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = signed(m);
    if (Math.abs(b - a) < 50) break; // < 50 ms
    if ((fa < 0 && fm < 0) || (fa >= 0 && fm >= 0)) {
      a = m;
      fa = fm;
    } else {
      b = m;
    }
  }
  return new Date((a + b) / 2);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Elongation & tithi
// ───────────────────────────────────────────────────────────────────────────

/**
 * Geocentric Moon−Sun ecliptic-longitude elongation in [0,360).
 * 0 = new moon (conjunction), 180 = full moon.
 */
export function elongation(date: FlexibleDateTime): number {
  return PairLongitude(Body.Moon, Body.Sun, date);
}

/**
 * Tithi number 1..30 containing `date`.
 * Tithi n spans elongation [(n−1)·12°, n·12°). 1 = Śukla Pratipadā … 30 = Amāvāsyā.
 */
export function tithiAt(date: FlexibleDateTime): number {
  return Math.floor(elongation(date) / DEG_PER_TITHI) + 1;
}

export interface TithiBoundaries {
  /** Tithi number 1..30. */
  number: number;
  /** UTC instant the tithi begins (elongation = (n−1)·12°). */
  start: Date;
  /** UTC instant the tithi ends (elongation = n·12°). */
  end: Date;
}

/**
 * Boundaries of the tithi containing `around`.
 *
 * Tithi n occupies elongation [(n−1)·12°, n·12°). We locate the start by
 * searching backward for the (n−1)·12° phase and the end by searching forward
 * for the n·12° phase (mod 360). The new-moon wrap is handled because phase
 * 0° ≡ 360°: tithi 30 ends at phase 0 (the next new moon) and tithi 1 starts
 * at phase 0 (the same new moon), so the SearchMoonPhase target is taken mod
 * 360 and the wrap is seamless.
 */
export function tithiBoundaries(around: FlexibleDateTime): TithiBoundaries {
  const t = MakeTime(around);
  const n = tithiAt(around);
  const startTarget = ((n - 1) * DEG_PER_TITHI) % 360; // 0..348
  const endTarget = (n * DEG_PER_TITHI) % 360; // 12..360→0

  // Start: most recent time phase reached startTarget at or before `around`.
  // Search backward up to ~2 tithis (a tithi is ~0.9–1.1 days; 3 d is safe).
  const start = SearchMoonPhase(startTarget, t, -3);
  // End: next time phase reaches endTarget after `around`.
  const end = SearchMoonPhase(endTarget, t, +3);
  if (!start || !end) {
    throw new Error(
      `tithiBoundaries: SearchMoonPhase failed for tithi ${n} near ${new Date(
        t.date.getTime(),
      ).toISOString()}`,
    );
  }
  return { number: n, start: start.date, end: end.date };
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Nakshatra (sidereal Moon longitude)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Nakshatra index 0..26 of the Moon at `date` (0 = Ashwini; Rohini = 3).
 * Each nakshatra spans 360/27 = 13°20′ of the Moon's sidereal longitude.
 */
export function nakshatraAt(date: FlexibleDateTime): number {
  return Math.floor(siderealLongitude(date, Body.Moon) / DEG_PER_NAKSHATRA);
}

export interface NakshatraBoundaries {
  /** Nakshatra index 0..26 (0 = Ashwini). */
  index: number;
  /** UTC instant the Moon enters this nakshatra. */
  start: Date;
  /** UTC instant the Moon leaves this nakshatra. */
  end: Date;
}

/**
 * Boundaries of the nakshatra the Moon occupies at `around`.
 *
 * The Moon's sidereal longitude advances ~13.2°/day and is monotonic within a
 * nakshatra, so each 13°20′ boundary is a clean single crossing. We bracket
 * the start-edge by stepping back ~1.5 days and the end-edge forward ~1.5 days
 * (a nakshatra lasts ~24 h) and bisect each crossing.
 */
export function nakshatraBoundaries(around: FlexibleDateTime): NakshatraBoundaries {
  const t = MakeTime(around);
  const centerMs = t.date.getTime();
  const idx = nakshatraAt(around);
  const startEdge = idx * DEG_PER_NAKSHATRA; // lower boundary, deg
  const endEdge = ((idx + 1) % NAKSHATRA_COUNT) * DEG_PER_NAKSHATRA; // upper

  const moonSid = (ms: number): number =>
    siderealLongitude(new Date(ms), Body.Moon);

  const DAY = 86_400_000;
  // A nakshatra is ~24 h; ±2 days brackets the adjacent boundaries safely.
  const start = bisectLongitudeCrossing(moonSid, startEdge, centerMs - 2 * DAY, centerMs);
  const end = bisectLongitudeCrossing(moonSid, endEdge, centerMs, centerMs + 2 * DAY);
  return { index: idx, start, end };
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Karaṇa & Bhadra (Viṣṭi)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Half-tithi index h ∈ 0..59 at `date` (h = floor(elongation/6°)), i.e. the
 * karaṇa slot within the current lunation.
 */
export function karanaIndexAt(date: FlexibleDateTime): number {
  return Math.floor(elongation(date) / DEG_PER_KARANA);
}

/** Karaṇa name at `date` (see karanaName / file header for the sequence). */
export function karanaAt(date: FlexibleDateTime): string {
  return karanaName(karanaIndexAt(date));
}

export interface KaranaInterval {
  start: Date;
  end: Date;
}

/**
 * Viṣṭi (Bhadra) karaṇa interval(s) near `around`.
 *
 * Viṣṭi is the 7th movable karaṇa, so it falls at half-tithi indices h where
 * ((h−1) mod 7) === 6 and h ∈ 1..56, i.e. h ∈ {7, 14, 21, 28, 35, 42, 49, 56}.
 * Each such karaṇa is the elongation span [h·6°, (h+1)·6°). Within a lunar
 * month Bhadra therefore occurs once per pakṣa-ish (8 times across a lunation).
 *
 * This scans a window of ±SYNODIC_MONTH_DAYS around `around`, locates every
 * Viṣṭi slot via SearchMoonPhase on the 6° multiples, and returns each
 * {start,end} (UTC) that overlaps the window. Adjacent to a date this yields
 * the Bhadra window(s) on/near that date.
 *
 * NOTE: the Bhadra Mukha / Pucchā subdivision (vyāpti over the day/night and
 * the "face/tail" split used for Holikā Dahan muhūrta) is a Phase-4
 * refinement and is intentionally NOT computed here — this returns the whole
 * Viṣṭi karaṇa span.
 */
export function bhadraIntervals(around: FlexibleDateTime): KaranaInterval[] {
  const t = MakeTime(around);
  const centerMs = t.date.getTime();
  const DAY = 86_400_000;
  const windowMs = SYNODIC_MONTH_DAYS * DAY;
  const loMs = centerMs - windowMs;
  const hiMs = centerMs + windowMs;

  const result: KaranaInterval[] = [];
  // Viṣṭi half-tithi indices within a lunation.
  const vishtiSlots = [7, 14, 21, 28, 35, 42, 49, 56];

  // We don't know which lunation we're in for absolute h, but SearchMoonPhase
  // targets are absolute phase degrees in [0,360). Each Viṣṭi slot h maps to a
  // phase target startDeg = h·6°; the karaṇa ends at (h+1)·6°. Search across a
  // few lunations covering the window.
  for (const h of vishtiSlots) {
    const startDeg = h * DEG_PER_KARANA; // 42,84,…,336
    const endDeg = (h + 1) * DEG_PER_KARANA;

    // Walk lunation by lunation across the window. Anchor the search at loMs
    // and step forward by ~1 synodic month until past hiMs.
    let cursor = loMs;
    while (cursor <= hiMs) {
      const s = SearchMoonPhase(startDeg % 360, new Date(cursor), SYNODIC_MONTH_DAYS + 1);
      if (!s) break;
      if (s.date.getTime() > hiMs) break;
      const e = SearchMoonPhase(endDeg % 360, s.date, 2);
      if (!e) break;
      // Keep intervals overlapping the window.
      if (e.date.getTime() >= loMs && s.date.getTime() <= hiMs) {
        result.push({ start: s.date, end: e.date });
      }
      // Advance just past this start to the next lunation's same slot.
      cursor = s.date.getTime() + SYNODIC_MONTH_DAYS * DAY * 0.5;
    }
  }
  // De-duplicate (different cursors can re-find the same interval) and sort.
  const uniq = new Map<number, KaranaInterval>();
  for (const iv of result) {
    const key = Math.round(iv.start.getTime() / 1000); // 1-second bucket
    if (!uniq.has(key)) uniq.set(key, iv);
  }
  return [...uniq.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ───────────────────────────────────────────────────────────────────────────
// 4. New moons & solar ingress (saṅkrānti)
// ───────────────────────────────────────────────────────────────────────────

/**
 * All new-moon instants (elongation = 0°) whose UTC time falls within calendar
 * year `year` (UTC), in increasing order. Uses SearchMoonPhase(0).
 */
export function newMoons(year: number): Date[] {
  const out: Date[] = [];
  const yearEnd = Date.UTC(year + 1, 0, 1);
  // Start a little before Jan 1 so we catch a new moon early in January.
  let cursor = new Date(Date.UTC(year - 1, 11, 25));
  for (let i = 0; i < 20; i++) {
    const nm = SearchMoonPhase(0, cursor, 40);
    if (!nm) break;
    const ms = nm.date.getTime();
    if (ms >= yearEnd) break;
    if (ms >= Date.UTC(year, 0, 1)) out.push(nm.date);
    // Advance past this new moon to find the next.
    cursor = new Date(ms + SYNODIC_MONTH_DAYS * 86_400_000 * 0.5);
  }
  return out;
}

/**
 * The instant in calendar year `year` (UTC) at which the Sun's **sidereal**
 * (Lahiri) longitude crosses `rashi`·30° — the saṅkrānti into that rāśi.
 * rashi 0 = Mesha … 9 = Makara (Makara Saṅkrānti) … 11 = Mīna.
 *
 * Root-found on siderealLongitude(Sun): the Sun advances ~1°/day and is
 * monotonic, so each 30° boundary is crossed once per year. We scan month by
 * month for the rāśi change, then bisect.
 */
export function solarIngress(year: number, rashi: number): Date {
  const targetDeg = normalize360(rashi * 30);
  const sunSid = (ms: number): number => siderealLongitude(new Date(ms), Body.Sun);

  // Find the day-bracket where siderealSunRashi steps into `rashi`.
  // Scan the whole year at 1-day resolution.
  const startMs = Date.UTC(year, 0, 1);
  const DAY = 86_400_000;
  let prevMs = startMs;
  let prevRashi = siderealSunRashi(new Date(prevMs));
  for (let d = 1; d <= 366; d++) {
    const ms = startMs + d * DAY;
    const r = siderealSunRashi(new Date(ms));
    if (r !== prevRashi && r === rashi) {
      // Crossing into `rashi` lies in (prevMs, ms]. Bisect the 30° boundary.
      return bisectLongitudeCrossing(sunSid, targetDeg, prevMs, ms);
    }
    prevMs = ms;
    prevRashi = r;
  }
  throw new Error(`solarIngress: rashi ${rashi} not entered during ${year}`);
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Lunar month (amānta & pūrṇimānta), adhika / kṣaya
// ───────────────────────────────────────────────────────────────────────────

export type MonthSystem = "amanta" | "purnimanta";

export interface LunarMonth {
  /** Month name index 0..11 (0 = Chaitra). The label for the chosen system. */
  month: number;
  /** Month name (label for `system`). */
  monthName: string;
  /** "shukla" (waxing) or "krishna" (waning). */
  paksha: "shukla" | "krishna";
  /** True if this lunation is an adhika (leap) month. */
  adhika: boolean;
  /** True if this lunation is a kṣaya (lost) month (two saṅkrāntis). */
  kshaya: boolean;
  /** Amānta month name index 0..11 (independent of the chosen system). */
  amantaMonth: number;
  /** Amānta label (with "Adhika"/"Nija" prefix where applicable). */
  amantaLabel: string;
  /** Pūrṇimānta label (with prefix where applicable). */
  purnimantaLabel: string;
}

/** Find the new moon at or immediately before `ms` (UTC ms). */
function newMoonAtOrBefore(ms: number): Date {
  const nm = SearchMoonPhase(0, new Date(ms), -(SYNODIC_MONTH_DAYS + 2));
  if (!nm) throw new Error("newMoonAtOrBefore: SearchMoonPhase failed");
  return nm.date;
}

/** Find the first new moon strictly after `ms` (UTC ms). */
function newMoonAfter(ms: number): Date {
  // Step a hair forward to avoid re-finding the same instant.
  const nm = SearchMoonPhase(0, new Date(ms + 1000), SYNODIC_MONTH_DAYS + 2);
  if (!nm) throw new Error("newMoonAfter: SearchMoonPhase failed");
  return nm.date;
}

/**
 * Count saṅkrāntis (solar rāśi entries) strictly inside the open lunation
 * (nmStart, nmEnd) and return the rāśi index entered for each, in order.
 *
 * A saṅkrānti is a step in siderealSunRashi. We sample at the two new-moon
 * endpoints and detect rāśi changes by scanning at 12-hour resolution (the Sun
 * never crosses two boundaries within 12 h), then refine is unnecessary — we
 * only need the COUNT and the entered rāśi index(es).
 */
function sankrantisInLunation(nmStartMs: number, nmEndMs: number): number[] {
  const entered: number[] = [];
  const STEP = 12 * 3_600_000; // 12 h
  let prevRashi = siderealSunRashi(new Date(nmStartMs));
  for (let ms = nmStartMs + STEP; ms < nmEndMs; ms += STEP) {
    const r = siderealSunRashi(new Date(ms));
    if (r !== prevRashi) {
      entered.push(r);
      prevRashi = r;
    }
  }
  // Also check the final endpoint approach (last step may overshoot nmEnd).
  const rEnd = siderealSunRashi(new Date(nmEndMs - 1));
  if (rEnd !== prevRashi) {
    entered.push(rEnd);
  }
  return entered;
}

/**
 * Classify the amānta lunation containing `at` and return amānta + pūrṇimānta
 * labels, paksha, and adhika/kṣaya flags.
 *
 * Algorithm (see file header for sourcing):
 *  1. Bracket the current amānta lunation: nmStart = new moon at/before `at`,
 *     nmEnd = next new moon. Paksha = śukla if elongation(at) < 180 else kṛṣṇa.
 *  2. Count saṅkrāntis inside (nmStart, nmEnd):
 *       • exactly 1  → ordinary month, name = entered-rāśi index (0=Chaitra).
 *       • 0          → ADHIKA: name = the FOLLOWING lunation's saṅkrānti rāśi
 *                      (look ahead to the next new moon and its saṅkrānti).
 *       • 2          → KṢAYA: month is lost; name = the FIRST entered rāśi
 *                      (the kṣaya month carries the earlier name; the later
 *                      one is dropped). Flagged kshaya:true.
 *  3. Pūrṇimānta label: in the kṛṣṇa pakṣa it rolls forward to the next month
 *     name; in the śukla pakṣa it equals the amānta name. (Adhika/Nija prefix
 *     carries through unchanged.)
 */
export function lunarMonth(
  at: FlexibleDateTime,
  options: { system?: MonthSystem } = {},
): LunarMonth {
  const system = options.system ?? "amanta";
  const t = MakeTime(at);
  const atMs = t.date.getTime();

  const nmStart = newMoonAtOrBefore(atMs);
  const nmEnd = newMoonAfter(nmStart.getTime());
  const nmStartMs = nmStart.getTime();
  const nmEndMs = nmEnd.getTime();

  const elong = elongation(at);
  const paksha: "shukla" | "krishna" = elong < 180 ? "shukla" : "krishna";

  const sankrantis = sankrantisInLunation(nmStartMs, nmEndMs);

  let amantaMonth: number;
  let adhika = false;
  let kshaya = false;

  if (sankrantis.length === 1) {
    amantaMonth = sankrantis[0];
  } else if (sankrantis.length === 0) {
    // Adhika: inherit the following lunation's saṅkrānti name.
    adhika = true;
    const nmNextEnd = newMoonAfter(nmEndMs);
    const nextSankrantis = sankrantisInLunation(nmEndMs, nmNextEnd.getTime());
    // The following lunation should contain exactly one saṅkrānti; use its rāśi.
    amantaMonth = nextSankrantis.length > 0 ? nextSankrantis[0]
      // Degenerate fallback: name after the Sun's rāśi at nmEnd.
      : siderealSunRashi(new Date(nmEndMs));
  } else {
    // Two (or more) saṅkrāntis: kṣaya. Carry the first entered rāśi name.
    kshaya = true;
    amantaMonth = sankrantis[0];
  }

  const amantaName = LUNAR_MONTH_NAMES[amantaMonth];
  const prefix = adhika ? "Adhika " : "";
  const amantaLabel = `${prefix}${amantaName}`;

  // Pūrṇimānta: kṛṣṇa pakṣa belongs to the NEXT month's name.
  const purnimantaMonth =
    paksha === "krishna" ? (amantaMonth + 1) % 12 : amantaMonth;
  const purnimantaName = LUNAR_MONTH_NAMES[purnimantaMonth];
  const purnimantaLabel = `${prefix}${purnimantaName}`;

  const month = system === "purnimanta" ? purnimantaMonth : amantaMonth;
  const monthName = system === "purnimanta" ? purnimantaLabel : amantaLabel;

  return {
    month,
    monthName,
    paksha,
    adhika,
    kshaya,
    amantaMonth,
    amantaLabel,
    purnimantaLabel,
  };
}
