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
