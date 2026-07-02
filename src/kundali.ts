/**
 * src/kundali.ts — lagna (ascendant), whole-sign bhāvas, navāṁśa, and the
 * assembled janma-kuṇḍalī (birth chart).
 *
 * SCRIPTURE BASIS (docs/plans/2026-07-02-jyotisha-kundali-guna-milan.md):
 *  • Bhāvas: WHOLE-SIGN from the lagna rāśi — the Bṛhat Parāśara Horā Śāstra
 *    convention (bhāva 1 = the lagna's rāśi, bhāva n = the (n−1)th rāśi from
 *    it). Bhāva-chalit/KP are deliberate non-goals of v1.
 *  • Navāṁśa (D9): BPHS ṣoḍaśavarga — each rāśi divided into 9 parts of
 *    3°20′; movable signs count from themselves, fixed from the 9th, dual
 *    from the 5th. That rule collapses to the uniform arithmetic
 *    `navāṁśa rāśi = ⌊longitude / 3°20′⌋ mod 12`, which is what we compute.
 *
 * LAGNA — the sidereal longitude of the ecliptic point RISING on the eastern
 * horizon at the birth instant. Computed numerically: the true-ecliptic-of-
 * date circle is scanned for its horizon crossing with an eastern azimuth
 * (astronomy-engine `Horizon`, refraction OFF — the ascendant is geometric by
 * convention), then bisected to sub-arcsecond. This avoids the sign-error-
 * prone closed formula and inherits the engine's sidereal-time & nutation
 * handling. Validated against Swiss Ephemeris `houses_ex` (sidereal
 * ascendant) in test/kundali.test.ts.
 *
 * PROVENANCE: the lagna answer includes `window` — the UTC instants the lagna
 * entered and leaves its rāśi (~2 h wide). A birth time known only to ±15 min
 * may or may not pin the lagna; the window makes that visible instead of
 * silently committing.
 */

import { MakeTime, Observer, Horizon, e_tilt } from "astronomy-engine";

import { ayanamsha, normalize360 } from "./ayanamsha.js";
import { validateLocation, type GeoLocation } from "./time.js";
import {
  grahaPositions,
  janmaFacts,
  RASHI_NAMES,
  type GrahaOptions,
  type GrahaPosition,
  type JanmaFacts,
} from "./grahas.js";
import { vimshottariDasha, type DashaPeriod } from "./dashas.js";

const DEG = Math.PI / 180;
const DEG_PER_RASHI = 30;
/** Lagna is ill-behaved above the polar circles (the ecliptic can graze the
 *  horizon); reject rather than emit an unstable chart. */
const MAX_LAGNA_LATITUDE = 66;

// ───────────────────────────────────────────────────────────────────────────
// Ascendant
// ───────────────────────────────────────────────────────────────────────────

/**
 * Altitude & azimuth of the true-ecliptic-of-date point at longitude `lam`
 * (latitude 0) for the given time/observer. Geometric (no refraction).
 */
function eclipticPointHorizon(
  time: ReturnType<typeof MakeTime>,
  observer: Observer,
  lamDeg: number,
): { altitude: number; azimuth: number } {
  const eps = e_tilt(time).tobl * DEG; // true obliquity of date
  const lam = lamDeg * DEG;
  const raDeg = normalize360(Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) / DEG);
  const decDeg = Math.asin(Math.sin(lam) * Math.sin(eps)) / DEG;
  const h = Horizon(time, observer, raDeg / 15, decDeg, "");
  return { altitude: h.altitude, azimuth: h.azimuth };
}

/** TROPICAL (true equinox of date) longitude of the ascendant, degrees. */
export function tropicalAscendant(date: Date, loc: GeoLocation): number {
  if (Math.abs(loc.latitude) > MAX_LAGNA_LATITUDE) {
    throw new Error(
      `lagna is unstable above ±${MAX_LAGNA_LATITUDE}° latitude (got ${loc.latitude})`,
    );
  }
  const time = MakeTime(date);
  const observer = new Observer(loc.latitude, loc.longitude, 0);
  const altAt = (lam: number) => eclipticPointHorizon(time, observer, lam);

  // The ecliptic crosses the horizon at exactly two points (two great
  // circles); the ascendant is the EASTERN one (azimuth 0..180). Note the
  // altitude-vs-λ crossing DIRECTION at the ascendant is +→− at mid
  // latitudes (lower longitudes rise first, so λ just below the lagna is
  // already up), and can differ elsewhere — so take every sign change and
  // select by azimuth, not by direction. 5° steps cannot miss crossings
  // ~180° apart.
  const STEP = 5;
  for (let lam0 = 0; lam0 < 360; lam0 += STEP) {
    const a0 = altAt(lam0).altitude;
    const a1 = altAt(lam0 + STEP).altitude;
    if ((a0 <= 0 && a1 > 0) || (a0 > 0 && a1 <= 0)) {
      // Bisect to ~0.1″.
      let lo = lam0;
      let hi = lam0 + STEP;
      const below = a0 <= 0;
      for (let i = 0; i < 27; i++) {
        const mid = (lo + hi) / 2;
        if (altAt(mid).altitude <= 0 === below) lo = mid;
        else hi = mid;
      }
      const asc = (lo + hi) / 2;
      const az = altAt(asc).azimuth;
      if (az > 0 && az < 180) return normalize360(asc); // eastern → ascendant
      // else: the setting (western) crossing; keep scanning for the other one
    }
  }
  throw new Error("ascendant not found (ecliptic–horizon crossing failed)");
}

/** Sidereal (Lahiri) lagna longitude, degrees [0,360). */
export function siderealLagna(date: Date, loc: GeoLocation): number {
  return normalize360(tropicalAscendant(date, loc) - ayanamsha(date, { nutation: true }));
}

export interface LagnaWindow {
  /** UTC instant the lagna entered its current rāśi. */
  enteredAt: Date;
  /** UTC instant the lagna leaves it (~2 h after enteredAt). */
  leavesAt: Date;
}

/** Root-find the instant the sidereal lagna crosses `targetLon`, near `date`. */
function lagnaCrossing(date: Date, loc: GeoLocation, targetLon: number, dirMs: number): Date {
  // The lagna advances ~360°/day; a rāśi takes ~2 h. March in 10-min steps
  // until the target is bracketed, then bisect.
  const diff = (t: number) =>
    ((siderealLagna(new Date(t), loc) - targetLon + 540) % 360) - 180;
  let t0 = date.getTime();
  let d0 = diff(t0);
  for (let i = 0; i < 30; i++) {
    const t1 = t0 + dirMs;
    const d1 = diff(t1);
    if ((d0 <= 0 && d1 >= 0) || (d0 >= 0 && d1 <= 0)) {
      let lo = Math.min(t0, t1);
      let hi = Math.max(t0, t1);
      for (let j = 0; j < 32; j++) {
        const mid = (lo + hi) / 2;
        if (diff(lo) <= 0 === (diff(mid) <= 0)) lo = mid;
        else hi = mid;
      }
      return new Date((lo + hi) / 2);
    }
    t0 = t1;
    d0 = d1;
  }
  throw new Error("lagna rāśi boundary not found");
}

/** The current lagna rāśi's entry/exit instants around `date`. */
export function lagnaWindow(date: Date, loc: GeoLocation): LagnaWindow {
  const lon = siderealLagna(date, loc);
  const rashiStart = Math.floor(lon / DEG_PER_RASHI) * DEG_PER_RASHI;
  return {
    enteredAt: lagnaCrossing(date, loc, rashiStart, -600_000),
    leavesAt: lagnaCrossing(date, loc, normalize360(rashiStart + 30), 600_000),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Vargas
// ───────────────────────────────────────────────────────────────────────────

/**
 * Navāṁśa (D9) rāśi of a sidereal longitude — BPHS ninth-division; the
 * movable/fixed/dual starting rule collapses to uniform 3°20′ arithmetic.
 */
export function navamsaRashi(longitude: number): number {
  return Math.floor(normalize360(longitude) / (DEG_PER_RASHI / 9)) % 12;
}

// ───────────────────────────────────────────────────────────────────────────
// The chart
// ───────────────────────────────────────────────────────────────────────────

export interface KundaliGraha extends GrahaPosition {
  /** Whole-sign bhāva 1..12 from the lagna (BPHS). */
  bhava: number;
  /** Navāṁśa (D9) rāśi index & name. */
  navamsa: number;
  navamsaName: string;
}

export interface Kundali {
  /** Birth instant (UTC) and location echoed back. */
  birth: Date;
  location: GeoLocation;
  /** True (with-nutation) Lahiri ayanāṁśa at birth, degrees — provenance. */
  ayanamsha: number;
  /** Node model used for Rāhu/Ketu. */
  node: "mean" | "true";
  lagna: {
    longitude: number;
    rashi: number;
    rashiName: string;
    degreesInRashi: number;
    navamsa: number;
    navamsaName: string;
    /** PROVENANCE: how long this lagna rāśi holds around the birth time. */
    window: LagnaWindow;
  };
  /** Chandra lagna (Moon's rāśi) — the Moon-chart reference. */
  chandraLagna: number;
  chandraLagnaName: string;
  grahas: KundaliGraha[];
  /** Moon-centric birth facts (janma nakṣatra/pada, pañcāṅga at birth). */
  janma: JanmaFacts;
  /** Vimśottarī mahādaśās (with antardaśās) covering 120 years from birth. */
  dasha: DashaPeriod[];
}

/**
 * Assemble the janma-kuṇḍalī: lagna + whole-sign bhāvas + navāṁśa + daśā.
 *
 * For an UNKNOWN birth time, call `moonKundali` instead — it omits every
 * lagna-dependent output rather than fabricating one.
 */
export function kundali(birth: Date, loc: GeoLocation, opts: GrahaOptions = {}): Kundali {
  validateLocation(loc);
  const node = opts.node ?? "mean";
  const lagnaLon = siderealLagna(birth, loc);
  const lagnaRashi = Math.floor(lagnaLon / DEG_PER_RASHI) % 12;
  const janma = janmaFacts(birth, loc);
  const grahas: KundaliGraha[] = grahaPositions(birth, { node }).map((p) => ({
    ...p,
    bhava: ((p.rashi - lagnaRashi + 12) % 12) + 1,
    navamsa: navamsaRashi(p.longitude),
    navamsaName: RASHI_NAMES[navamsaRashi(p.longitude)],
  }));
  return {
    birth,
    location: loc,
    ayanamsha: ayanamsha(birth, { nutation: true }),
    node,
    lagna: {
      longitude: lagnaLon,
      rashi: lagnaRashi,
      rashiName: RASHI_NAMES[lagnaRashi],
      degreesInRashi: lagnaLon % DEG_PER_RASHI,
      navamsa: navamsaRashi(lagnaLon),
      navamsaName: RASHI_NAMES[navamsaRashi(lagnaLon)],
      window: lagnaWindow(birth, loc),
    },
    chandraLagna: janma.janmaRashi,
    chandraLagnaName: janma.janmaRashiName,
    grahas,
    janma,
    dasha: vimshottariDasha(janma),
  };
}

/**
 * The Moon-chart fallback for an UNKNOWN birth time: janma facts, positions
 * (bhāvas counted from the Moon — chandra lagna), navāṁśa, and daśā. Every
 * lagna-dependent output is absent by design; the `timeUnknown` flag makes
 * the degraded mode explicit to consumers.
 */
export function moonKundali(
  birth: Date,
  loc: GeoLocation,
  opts: GrahaOptions = {},
): Omit<Kundali, "lagna"> & { timeUnknown: true } {
  validateLocation(loc);
  const node = opts.node ?? "mean";
  const janma = janmaFacts(birth, loc);
  const grahas: KundaliGraha[] = grahaPositions(birth, { node }).map((p) => ({
    ...p,
    bhava: ((p.rashi - janma.janmaRashi + 12) % 12) + 1, // from chandra lagna
    navamsa: navamsaRashi(p.longitude),
    navamsaName: RASHI_NAMES[navamsaRashi(p.longitude)],
  }));
  return {
    birth,
    location: loc,
    ayanamsha: ayanamsha(birth, { nutation: true }),
    node,
    chandraLagna: janma.janmaRashi,
    chandraLagnaName: janma.janmaRashiName,
    grahas,
    janma,
    dasha: vimshottariDasha(janma),
    timeUnknown: true,
  };
}
