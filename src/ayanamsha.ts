/**
 * Lahiri (Chitrapakṣa) ayanāṁśa and sidereal longitudes.
 *
 * MODEL
 * -----
 * Lahiri ayanāṁśa = a canonical constant anchor at J2000.0 plus the accumulated
 * **general precession in longitude** from J2000.0 to the date, computed with the
 * **IAU 1976 (Lieske et al. 1977)** precession series. This is the same polynomial
 * given by Meeus, *Astronomical Algorithms* (2nd ed.), ch. 21 ("Precession"), for
 * the precession of ecliptical coordinates — Meeus' general-precession-in-longitude
 * polynomial IS the IAU 1976 series.
 *
 *   ayanāṁśa(T) = 23.853222° + pA(T)
 *
 * where T is the time in Julian centuries of Terrestrial Time (TT) from J2000.0 and
 * pA(T) is the accumulated general precession in longitude in degrees.
 *
 * ANCHOR
 * ------
 * At J2000.0 the mean Lahiri ayanāṁśa is **23.853222°**. This is the canonical
 * Swiss Ephemeris `SE_SIDM_LAHIRI` / ICRC value, expressed as the Swiss Ephemeris
 * user-defined mode `swe_set_sid_mode(SE_SIDM_USER, 2451545.0, 23.853222)`. Official
 * Lahiri is "an arbitrary value at an arbitrary epoch propagated by IAU 1976
 * precession" — it is NOT a distinct precession series. There is no festival-date
 * tuning here; the anchor and series are fixed.
 *
 * PRECESSION SERIES (IAU 1976 / Meeus ch. 21), referred to J2000.0 (arcseconds):
 *
 *   pA(T) = 5029.0966″·T + 1.11113″·T² − 0.000006″·T³
 *
 * The leading coefficient, 5029.0966″/Julian century, is the IAU 1976 rate of
 * general precession in longitude at J2000.0 (Lieske et al. 1977,
 * A&A 58, 1). (In Meeus' general two-epoch form the T² and T³ coefficients also
 * carry T₀ terms; with the fixed reference epoch J2000.0, T₀ = 0 and they drop out.)
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

/** Canonical Lahiri anchor: mean ayanāṁśa at J2000.0, in degrees. */
export const LAHIRI_ANCHOR_J2000_DEG = 23.853222;

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
 * Accumulated general precession in longitude pA(T), IAU 1976 / Meeus ch. 21,
 * referred to J2000.0.
 *
 * @param T time in Julian centuries (TT) from J2000.0
 * @returns pA in arcseconds
 */
function accumulatedPrecessionArcsec(T: number): number {
  return 5029.0966 * T + 1.11113 * T * T - 0.000006 * T * T * T;
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
