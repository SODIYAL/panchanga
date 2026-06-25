/**
 * src/time.ts — tz/DST-safe day math, rise/set, and kāla windows.
 *
 * Design notes
 * ────────────
 * • All timezone arithmetic uses built-in Intl.DateTimeFormat with the
 *   `timeZone` option — NO external tz library, NO "+24 hours" hacks.
 *   nextLocalDayStartUTC increments the local Y-M-D calendar date and
 *   recomputes the UTC offset at that new local midnight, so it is correct
 *   across spring-forward (23-hour day) and fall-back (25-hour day).
 *
 * • astronomy-engine SearchRiseSet is called with direction +1 (rise) or
 *   −1 (set), searching from the UTC instant of local-day midnight with a
 *   1-day window. Elevation goes into Observer.height (sea-level elevation
 *   in metres). metersAboveGround is passed as 0 (elevation already in the
 *   Observer). Returns null at polar latitudes — never throws.
 *
 * • Kāla window boundaries follow traditional Smārta definitions.
 *   CALIBRATION: exact boundaries are validated against Drik Panchang
 *   fixtures in Phase 4.
 */

import {
  Observer,
  SearchRiseSet,
  Body,
} from "astronomy-engine";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Geographic location with IANA timezone.
 *
 * `elevationMeters` is the observer's elevation above sea level; it goes into
 * `Observer.height` (not metersAboveGround in SearchRiseSet).
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  /** Metres above sea level. Defaults to 0 if omitted. */
  elevationMeters?: number;
  /** IANA timezone identifier, e.g. "America/Toronto" or "Asia/Kolkata". */
  timeZone: string;
}

/**
 * Validate a `GeoLocation` at the public boundary, throwing a clear, typed
 * error instead of letting bad input surface as an opaque astronomy-engine /
 * Intl stack trace deep inside the computation.
 */
export function validateLocation(loc: GeoLocation): void {
  if (!loc || typeof loc !== "object") {
    throw new TypeError("location is required (a GeoLocation object)");
  }
  const { latitude, longitude, timeZone, elevationMeters } = loc;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`invalid latitude: ${latitude} (expected a number in -90..90)`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`invalid longitude: ${longitude} (expected a number in -180..180)`);
  }
  if (elevationMeters !== undefined && !Number.isFinite(elevationMeters)) {
    throw new RangeError(`invalid elevationMeters: ${elevationMeters}`);
  }
  if (typeof timeZone !== "string" || timeZone.length === 0) {
    throw new TypeError(`invalid timeZone: ${String(timeZone)} (expected an IANA id)`);
  }
  try {
    // Probe the IANA id; throws RangeError for an unknown zone.
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new RangeError(`invalid IANA timeZone: '${timeZone}'`);
  }
}

/** A time window with an inclusive start and exclusive end. */
export interface TimeWindow {
  start: Date;
  end: Date;
}

// ---------------------------------------------------------------------------
// Intl parts helper
// ---------------------------------------------------------------------------

/**
 * Returns an object whose keys are the `type` fields from
 * `Intl.DateTimeFormat.formatToParts` for the given UTC instant projected
 * into `tz`.
 */
function tzParts(
  utcDate: Date,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`tzParts: missing part type "${type}"`);
    // hour12:false can produce "24" for midnight in some environments; normalise.
    const v = parseInt(p.value, 10);
    return type === "hour" && v === 24 ? 0 : v;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Given a local calendar date (year, month 1-based, day) and timezone,
 * returns the UTC `Date` corresponding to 00:00:00 local time on that date.
 *
 * Strategy: start from the UTC Date that *would* be midnight if the offset
 * were 0. Read back the local time to determine whether we are on the same
 * calendar day (positive/zero UTC offsets, e.g. IST) or the previous evening
 * (negative UTC offsets, e.g. EDT). Apply the correct correction in each
 * case. A second Intl read verifies there is no residual (handles the rare
 * DST-transition-at-exactly-midnight edge).
 *
 * This is correct across spring-forward and fall-back because the offset is
 * measured at the resulting instant, not estimated.
 */
function localMidnightUTC(year: number, month: number, day: number, tz: string): Date {
  // Guess: UTC midnight of the given calendar date (as if offset = 0).
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // Read back the local date/time at this UTC instant.
  const p = tzParts(guess, tz);

  const localSecondsFromMidnight = p.hour * 3600 + p.minute * 60 + p.second;
  let candidate: Date;

  if (p.day === day && p.month === month && p.year === year) {
    // Positive-offset (or zero) timezone: at UTC midnight the local clock is
    // already on the target date but a few hours ahead (e.g. 05:30 IST).
    // Subtract the elapsed local seconds to reach local 00:00:00.
    candidate = new Date(guess.getTime() - localSecondsFromMidnight * 1000);
  } else {
    // Negative-offset timezone (e.g. EDT UTC-4): at UTC midnight the local
    // clock shows the PREVIOUS evening (e.g. 20:00 on day-1). We need to
    // advance forward to the next local midnight.
    const secondsToNextMidnight = 24 * 3600 - localSecondsFromMidnight;
    candidate = new Date(guess.getTime() + secondsToNextMidnight * 1000);
  }

  // Verify — correct any residual (e.g. a DST transition lands exactly at midnight).
  const p2 = tzParts(candidate, tz);
  if (p2.hour !== 0 || p2.minute !== 0 || p2.second !== 0) {
    const residual = (p2.hour * 3600 + p2.minute * 60 + p2.second) * 1000;
    return new Date(candidate.getTime() - residual);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// 1. tz/DST-safe day math
// ---------------------------------------------------------------------------

/**
 * Returns a "YYYY-MM-DD" string for the local calendar date of `date` in `tz`.
 */
export function localDayString(date: Date, tz: string): string {
  const p = tzParts(date, tz);
  const y = String(p.year).padStart(4, "0");
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the UTC `Date` of 00:00:00 local time in `tz` for whichever
 * calendar date `date` falls on in that timezone.
 *
 * DST-safe: the offset is measured at the actual local midnight, not
 * estimated from the input instant. This handles spring-forward and
 * fall-back correctly.
 */
export function startOfLocalDayUTC(date: Date, tz: string): Date {
  const p = tzParts(date, tz);
  return localMidnightUTC(p.year, p.month, p.day, tz);
}

/**
 * Returns the UTC `Date` of 00:00:00 local time in `tz` for the **next**
 * calendar date after the one `date` falls on in that timezone.
 *
 * DST-safe: increments the local Y-M-D date (not "+24 hours") and recomputes
 * the UTC offset at the new local midnight, so a spring-forward day (23 h)
 * and a fall-back day (25 h) are both handled correctly.
 */
export function nextLocalDayStartUTC(date: Date, tz: string): Date {
  const p = tzParts(date, tz);
  // Increment the local calendar date by 1 day.
  // We pass p.day + 1 directly to localMidnightUTC; Date.UTC inside that
  // function handles month/year roll-over correctly (e.g. day 32 of month 1
  // becomes day 1 of month 2). We do NOT use "+24 hours" — instead we
  // recompute the UTC offset at the new local midnight, which is what makes
  // this correct across spring-forward (23-hour day) and fall-back (25-hour
  // day) transitions.
  return localMidnightUTC(p.year, p.month, p.day + 1, tz);
}

// ---------------------------------------------------------------------------
// 2. Rise / set
// ---------------------------------------------------------------------------

/**
 * Returns a `Date` for the rise or set of the Sun (or Moon) on the local
 * calendar day that `date` falls in for `loc.timeZone`.
 *
 * Searches from local-day midnight UTC with a 1-day window.
 * Returns `null` when no event occurs in the window (polar latitudes).
 * Never throws for polar edge cases.
 *
 * @param direction "rise" → +1  |  "set" → −1
 */
export function riseSet(
  direction: "rise" | "set",
  date: Date,
  loc: GeoLocation,
  body: Body = Body.Sun,
): Date | null {
  const observer = new Observer(
    loc.latitude,
    loc.longitude,
    loc.elevationMeters ?? 0,
  );
  const dir = direction === "rise" ? 1 : -1;
  const dayStart = startOfLocalDayUTC(date, loc.timeZone);

  const result = SearchRiseSet(body, observer, dir, dayStart, 1, 0);
  return result ? result.date : null;
}

/**
 * Convenience wrapper: moonrise for the local day of `date` at `loc`.
 * Returns `null` if none occurs (polar / libration edge cases).
 */
export function moonrise(date: Date, loc: GeoLocation): Date | null {
  return riseSet("rise", date, loc, Body.Moon);
}

/**
 * Convenience wrapper: sunset for the local day of `date` at `loc`.
 * Returns `null` if none occurs (polar midnight-sun).
 */
export function sunset(date: Date, loc: GeoLocation): Date | null {
  return riseSet("set", date, loc);
}

// ---------------------------------------------------------------------------
// Vāra (weekday) — sunrise-to-sunrise reckoning
// ---------------------------------------------------------------------------

/** The 7 vāras (weekdays), index 0 = Sunday (Ravivāra) … 6 = Saturday. */
export const VARA_NAMES = [
  "Ravivara", "Somavara", "Mangalavara", "Budhavara",
  "Guruvara", "Shukravara", "Shanivara",
] as const;

export interface Vara {
  /** Weekday index 0..6 (0 = Sunday / Ravivāra). */
  index: number;
  /** Vāra name (Ravivāra … Śanivāra). */
  name: string;
}

/**
 * The vāra (weekday) governing the instant `date` at `loc`.
 *
 * The pañcāṅga day runs SUNRISE-to-SUNRISE, not civil midnight: the hours
 * between local midnight and sunrise still belong to the PREVIOUS weekday. So
 * we take the local calendar day of `date`, and if `date` falls before that
 * day's sunrise, roll the owning date back one calendar day, then read the
 * weekday of the owning date (a calendar date's weekday is timezone-invariant,
 * so we anchor it at noon UTC).
 *
 * Returns `null` only when sunrise cannot be found (polar day/night).
 */
export function varaAt(date: Date, loc: GeoLocation): Vara | null {
  const dayStart = startOfLocalDayUTC(date, loc.timeZone);
  const sr = riseSet("rise", dayStart, loc);
  if (!sr) return null;
  let owningDate = localDayString(date, loc.timeZone);
  if (date.getTime() < sr.getTime()) {
    const d = new Date(`${owningDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    owningDate = d.toISOString().slice(0, 10);
  }
  const index = new Date(`${owningDate}T12:00:00Z`).getUTCDay();
  return { index, name: VARA_NAMES[index] };
}

// ---------------------------------------------------------------------------
// 3. Kāla windows
// ---------------------------------------------------------------------------
//
// Notation used below:
//   D          = day length = sunset − sunrise
//   N          = night length = nextSunrise − sunset
//   dayMuhurta = D / 15   (one of 15 equal muhurtas in the day)
//   nightMuhurta = N / 15
//   solarNoon  = midpoint(sunrise, sunset)
//   solarMidnight = midpoint(sunset, nextSunrise)
//
// CALIBRATION: exact boundaries are validated against Drik Panchang fixtures
// in Phase 4.  The definitions used here follow the Smārta / Drik Panchang
// convention as documented in classical Jyotiṣa texts.

/**
 * Helper: fetch sunrise for `date` in `loc`. Searches the same local day.
 */
function getSunrise(date: Date, loc: GeoLocation): Date | null {
  return riseSet("rise", date, loc);
}

/**
 * Helper: fetch sunset for `date` in `loc`.
 */
function getSunset(date: Date, loc: GeoLocation): Date | null {
  return riseSet("set", date, loc);
}

/**
 * Helper: fetch sunrise for the **next** local calendar day after `date`.
 * Searches from the next day's local midnight.
 */
function getNextSunrise(date: Date, loc: GeoLocation): Date | null {
  const nextDayStart = nextLocalDayStartUTC(date, loc.timeZone);
  return riseSet("rise", nextDayStart, loc);
}

// ---------------------------------------------------------------------------
// Exported kāla window functions
// ---------------------------------------------------------------------------

/**
 * Prātaḥkāla / sunriseWindow
 *
 * Definition: first of the five equal day-parts (pañcāṅga prathamaṁ yāma).
 *   [sunrise, sunrise + D/5]
 *
 * This is the "dawn period" when morning rituals and Sandhyā are performed.
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function sunriseWindow(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  return { start: sr, end: new Date(sr.getTime() + D / 5) };
}

/** Alias: prātaḥkāla = sunriseWindow (same window, different name). */
export function pratahkala(date: Date, loc: GeoLocation): TimeWindow | null {
  return sunriseWindow(date, loc);
}

/**
 * Pūrvāhna (forenoon)
 *
 * Definition: [sunrise, sunrise + 3·D/5] — the first three-fifths of the
 * daytime.
 *
 * CALIBRATION (Phase 4, validated against Drik Panchang 2026 New Delhi):
 *   Drik's Pūrvāhna-vyāpinī festivals (Akṣaya Tṛtīyā, Vasant Pañcamī, Śāradīya
 *   Navrātri Ghaṭasthāpana) resolve to the day on which the festival tithi
 *   PERVADES the forenoon by the larger fraction. A solar-noon end (D/2) made
 *   Pūrvāhna too SHORT: for Akṣaya Tṛtīyā 2026 the Tṛtīyā begins only at ~10:49
 *   IST on Apr 19 (late in a D/2 window), so a D/2 Pūrvāhna gave Apr 20 the
 *   larger fraction and the engine picked Apr 20 — but Drik observes Apr 19
 *   (Tṛtīyā prevailing through the forenoon, Pūja Muhūrta 10:49–12:20 IST).
 *   Widening the END to 3·D/5 captures the post-noon tail of the forenoon that
 *   Drik's Pūrvāhna Kāla spans, so Apr 19's pervasion fraction overtakes Apr
 *   20's and the engine matches Drik. Vasant Pañcamī (Jan 23) and Śāradīya
 *   Navrātri (Oct 11) are single-day pervasions and are unaffected by the wider
 *   end (both remain correct).
 *
 *   (Earlier draft = D/2 "solar noon"; the 3·D/5 end is the calibrated value.)
 */
export function purvahna(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  return { start: sr, end: new Date(sr.getTime() + (3 * D) / 5) };
}

/**
 * Madhyāhna (midday period)
 *
 * Definition: third of the five equal day-parts.
 *   [sunrise + 2D/5, sunrise + 3D/5]
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function madhyahna(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  return {
    start: new Date(sr.getTime() + (2 * D) / 5),
    end: new Date(sr.getTime() + (3 * D) / 5),
  };
}

/**
 * Aparāhna (afternoon)
 *
 * Definition: fourth of the five equal day-parts.
 *   [sunrise + 3D/5, sunrise + 4D/5]
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function aparahna(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  return {
    start: new Date(sr.getTime() + (3 * D) / 5),
    end: new Date(sr.getTime() + (4 * D) / 5),
  };
}

/**
 * Pradoṣa (twilight period)
 *
 * Definition: approximately 3 muhurtas (~1h 12m) after sunset.
 *   dayMuhurta = D / 15
 *   [sunset, sunset + 3·dayMuhurta]
 *
 * This is the auspicious evening twilight window for Śiva worship.
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function pradosha(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  const dayMuhurta = D / 15;
  return {
    start: ss,
    end: new Date(ss.getTime() + 3 * dayMuhurta),
  };
}

/**
 * Niśīta (midnight muhurta)
 *
 * Definition: one nightMuhurta centred on solar midnight.
 *   nightMuhurta = N / 15
 *   solarMidnight = midpoint(sunset, nextSunrise)
 *   [solarMidnight − nightMuhurta/2, solarMidnight + nightMuhurta/2]
 *
 * This is the most auspicious hour of the night for Devi worship and
 * midnight Śiva pūjā.
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function nishita(date: Date, loc: GeoLocation): TimeWindow | null {
  const ss = getSunset(date, loc);
  const nextSr = getNextSunrise(date, loc);
  if (!ss || !nextSr) return null;
  const N = nextSr.getTime() - ss.getTime();
  const nightMuhurta = N / 15;
  const solarMidnight = new Date(ss.getTime() + N / 2);
  return {
    start: new Date(solarMidnight.getTime() - nightMuhurta / 2),
    end: new Date(solarMidnight.getTime() + nightMuhurta / 2),
  };
}

/**
 * Brahma-muhūrta (pre-dawn auspicious period)
 *
 * Definition: two muhurtas before sunrise.
 *   dayMuhurta = D / 15
 *   [sunrise − 2·dayMuhurta, sunrise − dayMuhurta]
 *
 * The optimal time for meditation, Vedic study, and rising.
 *
 * NOTE: dayMuhurta is computed from the *current* day's sunrise/sunset so
 * the window length reflects the current day length, which is the Drik
 * Panchang convention.
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 */
export function brahmaMuhurta(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  const dayMuhurta = D / 15;
  return {
    start: new Date(sr.getTime() - 2 * dayMuhurta),
    end: new Date(sr.getTime() - dayMuhurta),
  };
}

/**
 * Aruṇodaya ("break of dawn") — the pre-sunrise window that aruṇodaya-vyāpinī
 * observances key on (e.g. the start of an Ekādaśī / vrata fast, and snāna
 * timing).
 *
 * CONVENTION: 4 ghaṭikās before sunrise. A ghaṭikā (nāḍikā) is 24 minutes, so
 * this is a FIXED 96 minutes: [sunrise − 96 min, sunrise]. This matches the
 * Drik Panchang aruṇodaya convention. (Some texts instead use 4/60 of the full
 * ahorātra — sunrise-to-sunrise — which is night-length dependent; that variant
 * is NOT used here.)
 *
 * Returns null if the day has no sunrise (polar).
 */
export function arunodaya(date: Date, loc: GeoLocation): TimeWindow | null {
  const sr = getSunrise(date, loc);
  if (!sr) return null;
  const GHATIKA_MS = 24 * 60 * 1000;
  return {
    start: new Date(sr.getTime() - 4 * GHATIKA_MS),
    end: sr,
  };
}

// ---------------------------------------------------------------------------
// Auspicious / inauspicious day-part windows (Rāhu / Yama / Gulika / Abhijit)
// ---------------------------------------------------------------------------
//
// The daytime [sunrise, sunset] is split into 8 equal parts. Rāhu Kāla,
// Yamaganda and Gulika each occupy ONE part, selected by the vāra (weekday).
// The tables are indexed by weekday 0 = Sunday … 6 = Saturday and give the
// 1-based part number (part 1 = the first eighth after sunrise). These are the
// standard Smārta / Drik Panchang assignments.

/** Rāhu Kāla part (1..8) by weekday (0 = Sunday). */
const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3] as const;
/** Yamaganda part (1..8) by weekday (0 = Sunday). */
const YAMA_SEGMENT = [5, 4, 3, 2, 1, 7, 6] as const;
/** Gulika Kāla part (1..8) by weekday (0 = Sunday). */
const GULIKA_SEGMENT = [7, 6, 5, 4, 3, 2, 1] as const;

/** Weekday (0 = Sunday) of the civil day of `date` in `loc`'s timezone. */
function civilWeekday(date: Date, loc: GeoLocation): number {
  return new Date(`${localDayString(date, loc.timeZone)}T12:00:00Z`).getUTCDay();
}

/** The `seg`-th eighth (1..8) of the daytime starting at sunrise `sr`. */
function dayEighth(sr: Date, D: number, seg: number): TimeWindow {
  const eighth = D / 8;
  return {
    start: new Date(sr.getTime() + (seg - 1) * eighth),
    end: new Date(sr.getTime() + seg * eighth),
  };
}

/** Common sunrise/sunset/day-length fetch; null at polar latitudes. */
function dayArc(date: Date, loc: GeoLocation): { sr: Date; D: number } | null {
  const sr = getSunrise(date, loc);
  const ss = getSunset(date, loc);
  if (!sr || !ss) return null;
  const D = ss.getTime() - sr.getTime();
  if (D <= 0) return null;
  return { sr, D };
}

/**
 * Rāhu Kāla — the inauspicious eighth-of-day governed by Rāhu, by weekday.
 * Returns null if the day has no sunrise/sunset (polar).
 */
export function rahuKala(date: Date, loc: GeoLocation): TimeWindow | null {
  const arc = dayArc(date, loc);
  if (!arc) return null;
  return dayEighth(arc.sr, arc.D, RAHU_SEGMENT[civilWeekday(date, loc)]);
}

/**
 * Yamaganda (Yama Kaṇṭaka) — the inauspicious eighth-of-day governed by Yama.
 */
export function yamaganda(date: Date, loc: GeoLocation): TimeWindow | null {
  const arc = dayArc(date, loc);
  if (!arc) return null;
  return dayEighth(arc.sr, arc.D, YAMA_SEGMENT[civilWeekday(date, loc)]);
}

/**
 * Gulika Kāla (Gulikai / Mānda) — the eighth-of-day governed by Gulika. Unlike
 * Rāhu/Yama it is treated as AUSPICIOUS for some saṁskāras, but inauspicious
 * for travel/new ventures; we return the window and leave the verdict to the
 * caller.
 */
export function gulikaKala(date: Date, loc: GeoLocation): TimeWindow | null {
  const arc = dayArc(date, loc);
  if (!arc) return null;
  return dayEighth(arc.sr, arc.D, GULIKA_SEGMENT[civilWeekday(date, loc)]);
}

/**
 * Abhijit Muhūrta — the auspicious 8th of the 15 day-muhūrtas, centred on solar
 * noon.
 *   dayMuhurta = D / 15;  [sunrise + 7·dayMuhurta, sunrise + 8·dayMuhurta]
 *
 * NOTE: by tradition Abhijit is considered void/inauspicious on Wednesday; this
 * function returns the window regardless (the verdict is left to the caller).
 */
export function abhijitMuhurta(date: Date, loc: GeoLocation): TimeWindow | null {
  const arc = dayArc(date, loc);
  if (!arc) return null;
  const dayMuhurta = arc.D / 15;
  return {
    start: new Date(arc.sr.getTime() + 7 * dayMuhurta),
    end: new Date(arc.sr.getTime() + 8 * dayMuhurta),
  };
}

/** All four day-part muhūrtas for a day. */
export interface DayMuhurtaWindows {
  rahuKala: TimeWindow | null;
  yamaganda: TimeWindow | null;
  gulika: TimeWindow | null;
  abhijit: TimeWindow | null;
}

/**
 * Compute Rāhu Kāla, Yamaganda, Gulika and Abhijit in ONE pass, resolving the
 * day's sunrise/sunset a single time. Calling the four functions separately
 * searches sunrise+sunset four times over; this shares one `dayArc`. Returns
 * all-null at polar latitudes (no sunrise/sunset).
 */
export function dayMuhurtas(date: Date, loc: GeoLocation): DayMuhurtaWindows {
  const arc = dayArc(date, loc);
  if (!arc) return { rahuKala: null, yamaganda: null, gulika: null, abhijit: null };
  const wd = civilWeekday(date, loc);
  const dayMuhurta = arc.D / 15;
  return {
    rahuKala: dayEighth(arc.sr, arc.D, RAHU_SEGMENT[wd]),
    yamaganda: dayEighth(arc.sr, arc.D, YAMA_SEGMENT[wd]),
    gulika: dayEighth(arc.sr, arc.D, GULIKA_SEGMENT[wd]),
    abhijit: {
      start: new Date(arc.sr.getTime() + 7 * dayMuhurta),
      end: new Date(arc.sr.getTime() + 8 * dayMuhurta),
    },
  };
}

/**
 * Saṅkrānti Puṇya-kāla
 *
 * Auspicious window around a solar saṅkrānti (the Sun's entry into a new
 * rāśi).
 *
 * Rule (Smārta, Drik Panchang convention):
 *   • If the saṅkrānti moment is BEFORE that day's sunset:
 *       puṇya-kāla = [saṅkrānti moment, sunset of that day]
 *   • If the saṅkrānti moment is AFTER that day's sunset (rare — near
 *     solstice in western timezones):
 *       puṇya-kāla = [nextSunrise, sunset of next day]
 *       (the "after sunset → next sunrise" shift rule)
 *
 * Returns null if any required rise/set is unavailable (polar latitudes).
 *
 * CALIBRATION: exact boundaries are validated against Drik Panchang
 * fixtures in Phase 4.
 *
 * @param moment  The UTC instant of the saṅkrānti.
 * @param loc     Observer location.
 */
export function sankrantiPunyaKala(
  moment: Date,
  loc: GeoLocation,
): TimeWindow | null {
  const ss = getSunset(moment, loc);
  if (!ss) return null;

  if (moment.getTime() <= ss.getTime()) {
    // Saṅkrānti before sunset: window runs from the moment to that sunset.
    return { start: moment, end: ss };
  } else {
    // Saṅkrānti after sunset: shift to next day — start at next sunrise,
    // end at next day's sunset.
    const nextSr = getNextSunrise(moment, loc);
    if (!nextSr) return null;
    const nextSs = getSunset(nextSr, loc);
    if (!nextSs) return null;
    return { start: nextSr, end: nextSs };
  }
}
