/**
 * Lahiri (Chitrapakṣa) ayanāṁśa and sidereal longitudes.
 *
 * MODEL
 * -----
 * Lahiri ayanāṁśa = a constant anchor at J2000.0 plus the accumulated
 * **general precession in longitude** from J2000.0 to the date, computed with
 * the **IAU 2006 (P03; Capitaine et al. 2003 / Hilton et al. 2006)** series:
 *
 *   ayanāṁśa(T) = 23.8570923° + pA(T)
 *
 * where T is the time in Julian centuries of Terrestrial Time (TT) from J2000.0
 * and pA(T) is the accumulated general precession in longitude in degrees.
 *
 * ANCHOR & CALIBRATION (authority: Swiss Ephemeris SE_SIDM_LAHIRI ≡ Drik Panchang)
 * -------------------------------------------------------------------------------
 * The anchor **23.8570923°** is the Swiss Ephemeris v2.10 `SE_SIDM_LAHIRI` mean
 * ayanāṁśa evaluated at J2000.0 (`swe_get_ayanamsa_ut(2451545.0)` =
 * 23.857092354). With the IAU 2006 series this realization matches the Swiss
 * Ephemeris' Lahiri to < 0.05″ across 1900–2200 (verified by the differential
 * audit, `scripts/ephemeris-audit.mjs`).
 *
 * HISTORY (the O4 recalibration): the engine previously used anchor 23.853222°
 * + the IAU 1976 series. That realization sat a near-constant **−13.93″** at
 * J2000 (drifting +0.306″/century — exactly the IAU 1976→2006 precession-rate
 * difference, which pinned the identification) from the Swiss Ephemeris'
 * Lahiri. The offset shifted every sidereal solar-ingress (saṅkrānti) instant
 * ~5.6 minutes EARLY and flipped ingress-near-midnight dates. The decisive
 * datum: Drik Panchang lists **2031 London Makar Saṅkrānti on Jan 15**
 * (verified 2026-07-02), agreeing with the Swiss realization where the old
 * model produced Jan 14. Lunar aṅgas are barely affected: nakṣatra boundaries
 * move ~25 s; tithi/karaṇa are elongation-based and ayanāṁśa-free.
 *
 * PRECESSION SERIES (IAU 2006 / P03), referred to J2000.0 (arcseconds):
 *
 *   pA(T) = 5028.796195″·T + 1.1054348″·T² + 0.00007964″·T³
 *           − 0.000023857″·T⁴ − 0.0000000383″·T⁵
 *
 * The leading coefficient is the IAU 2006 rate of general precession in
 * longitude at J2000.0.
 *
 * MEAN vs TRUE
 * ------------
 * The **mean** ayanāṁśa (precession only) is the core. It matches published Lahiri
 * tables and is what the frozen reference values are checked against.
 *
 * Drik Panchang and most published "display" panchāngas use the **true** ("with
 * nutation") ayanāṁśa: mean + nutation in longitude Δψ. Pass `{ nutation: true }`
 * to get it. The nutation amplitude is ≤ ~17″ (< 0.3 arcmin), so either value
 * satisfies the < 1 arcmin reference tolerance, but the two are distinct and the
 * caller chooses. Festival-date code will pass `{ nutation: true }`.
 */

import {
  MakeTime,
  SunPosition,
  GeoVector,
  Ecliptic,
  e_tilt,
  Body,
  type FlexibleDateTime,
} from "astronomy-engine";

/**
 * Lahiri anchor: mean ayanāṁśa at J2000.0, in degrees — the Swiss Ephemeris
 * v2.10 `SE_SIDM_LAHIRI` value at J2000.0. (See the file header for the
 * calibration provenance; was 23.853222 + IAU 1976 before the O4
 * recalibration.)
 */
export const LAHIRI_ANCHOR_J2000_DEG = 23.8570923;

/** Julian days per Julian century. */
const DAYS_PER_CENTURY = 36525;

export interface AyanamshaOptions {
  /**
   * When true, add nutation in longitude Δψ to obtain the **true** ("with
   * nutation") ayanāṁśa used for display (e.g. Drik Panchang). Default false
   * (mean ayanāṁśa, precession only).
   */
  nutation?: boolean;
}

/**
 * Accumulated general precession in longitude pA(T), IAU 2006 (P03),
 * referred to J2000.0.
 *
 * @param T time in Julian centuries (TT) from J2000.0
 * @returns pA in arcseconds
 */
function accumulatedPrecessionArcsec(T: number): number {
  return (
    5028.796195 * T +
    1.1054348 * T * T +
    0.00007964 * T * T * T -
    0.000023857 * T * T * T * T -
    0.0000000383 * T * T * T * T * T
  );
}

/**
 * Lahiri (Chitrapakṣa) ayanāṁśa in degrees for the given instant.
 *
 * Mean by default (precession only). Pass `{ nutation: true }` for the true
 * ("with nutation") value.
 */
export function ayanamsha(
  date: FlexibleDateTime,
  options: AyanamshaOptions = {},
): number {
  const time = MakeTime(date);
  const T = time.tt / DAYS_PER_CENTURY; // Julian centuries TT from J2000.0
  let result = LAHIRI_ANCHOR_J2000_DEG + accumulatedPrecessionArcsec(T) / 3600;

  if (options.nutation) {
    // e_tilt(...).dpsi is nutation in longitude Δψ in arcseconds (IAU 2000B).
    result += e_tilt(time).dpsi / 3600;
  }

  return result;
}

/** Normalize an angle in degrees into the range [0, 360). */
export function normalize360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * Tropical ecliptic longitude **of date** (true equinox of date, apparent) of a
 * body, in degrees.
 *
 * - Sun: `SunPosition(date).elon` — apparent geocentric true-ecliptic-of-date
 *   longitude (precession + nutation applied).
 * - Other bodies: `Ecliptic(GeoVector(body, date, true)).elon` — geocentric
 *   apparent (aberration-corrected) vector rotated to the true ecliptic of date.
 *
 * Both are referred to the **true** (nutating) equinox of date, so they pair
 * consistently with the **true** ayanāṁśa.
 */
function tropicalLongitudeOfDate(date: FlexibleDateTime, body: Body): number {
  if (body === Body.Sun) {
    return SunPosition(date).elon;
  }
  return Ecliptic(GeoVector(body, date, /* aberration */ true)).elon;
}

/**
 * Sidereal (Lahiri) ecliptic longitude of a body, in degrees, normalized to
 * [0, 360).
 *
 *   sidereal = tropical-of-date − ayanāṁśa(date)
 *
 * Both the tropical longitude (from astronomy-engine) and the ayanāṁśa here use
 * the **true** equinox of date: the tropical longitudes are apparent
 * (true-ecliptic-of-date), so we subtract the **true** ayanāṁśa (with nutation)
 * to keep the equinox definition consistent on both sides.
 */
export function siderealLongitude(
  date: FlexibleDateTime,
  body: Body,
): number {
  const tropical = tropicalLongitudeOfDate(date, body);
  const ayan = ayanamsha(date, { nutation: true });
  return normalize360(tropical - ayan);
}

/**
 * Sidereal solar rāśi (zodiac sign) index, 0..11.
 * 0 = Meṣa (Aries), 1 = Vṛṣabha, …, 11 = Mīna (Pisces).
 */
export function siderealSunRashi(date: FlexibleDateTime): number {
  return Math.floor(siderealLongitude(date, Body.Sun) / 30);
}
