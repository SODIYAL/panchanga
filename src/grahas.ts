/**
 * src/grahas.ts — the nine grahas (navagraha): sidereal positions, Rāhu/Ketu
 * (mean & true node), retrograde flags, and the Moon-centric janma facts that
 * every jyotiṣa feature keys on.
 *
 * SCRIPTURE-FIRST POLICY (docs/plans/2026-07-02-jyotisha-kundali-guna-milan.md)
 *  • Positions are dṛk — the accurate ephemeris — per the Siddhāntic dṛk-tulya
 *    directive (computation must agree with the observed sky). Sidereal frame
 *    is the calibrated Lahiri realization (ayanamsha.ts, KNOWN_ISSUES R6).
 *  • Rāhu/Ketu DEFAULT to the MEAN node: Parāśara-era gaṇita computes the mean
 *    node; the true (osculating) node is a modern refinement offered as
 *    `node: "true"` (Drik Panchang exposes the same choice).
 *
 * NODE MODELS
 *  • MEAN node — Meeus, Astronomical Algorithms (2nd ed.) ch. 47: the mean
 *    longitude of the Moon's ascending node, referred to the MEAN equinox of
 *    date:
 *      Ω(T) = 125.0445479° − 1934.1362891°·T + 0.0020754°·T²
 *             + T³/467441 − T⁴/60616000
 *    Sidereal = Ω − MEAN ayanāṁśa (both mean-equinox-referred, so the
 *    nutation term cancels exactly, mirroring the true-equinox pairing used
 *    for the bodies in ayanamsha.ts).
 *  • TRUE node — the osculating node: the ascending node of the instantaneous
 *    two-body orbit through the Moon's geocentric state vector. Computed from
 *    `GeoMoonState` rotated into the TRUE ecliptic of date (EQJ→ECT):
 *    h = r×v, node direction n = ẑ×h, Ω = atan2(n_y, n_x); sidereal =
 *    Ω − TRUE ayanāṁśa. Validated against Swiss Ephemeris SE_TRUE_NODE
 *    (test/grahas.test.ts).
 *
 * Ketu = Rāhu + 180° always (the descending node).
 */

import {
  Body,
  MakeTime,
  GeoMoonState,
  Rotation_EQJ_ECT,
  RotateVector,
  Vector,
  type FlexibleDateTime,
} from "astronomy-engine";

import { ayanamsha, siderealLongitude, normalize360 } from "./ayanamsha.js";
import { tithiAt, yogaAt, karanaAt, nakshatraAt, nakshatraBoundaries, NAKSHATRA_NAMES, YOGA_NAMES, TITHI_NAMES } from "./elements.js";
import { varaAt, validateLocation, type GeoLocation, type Vara } from "./time.js";

// ───────────────────────────────────────────────────────────────────────────
// Names & constants
// ───────────────────────────────────────────────────────────────────────────

/** The nine grahas, in the traditional navagraha order. */
export const GRAHA_NAMES = [
  "Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu",
] as const;
export type Graha = (typeof GRAHA_NAMES)[number];

/** The 12 rāśis, index 0 = Meṣa (sidereal Aries). */
export const RASHI_NAMES = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
] as const;

const DEG_PER_RASHI = 30;
const DEG_PER_NAKSHATRA = 360 / 27;
const DEG_PER_PADA = DEG_PER_NAKSHATRA / 4;
const DAYS_PER_CENTURY = 36525;

const REAL_BODIES: Partial<Record<Graha, Body>> = {
  Sun: Body.Sun,
  Moon: Body.Moon,
  Mars: Body.Mars,
  Mercury: Body.Mercury,
  Jupiter: Body.Jupiter,
  Venus: Body.Venus,
  Saturn: Body.Saturn,
};

export interface GrahaOptions {
  /**
   * Rāhu/Ketu model. Default `"mean"` (Parāśara-era gaṇita — the scriptural
   * default); `"true"` = the osculating node (Drik Panchang's other setting).
   */
  node?: "mean" | "true";
}

// ───────────────────────────────────────────────────────────────────────────
// Nodes
// ───────────────────────────────────────────────────────────────────────────

/** Mean lunar ascending node, MEAN equinox of date (Meeus ch. 47), degrees. */
function meanNodeTropical(date: FlexibleDateTime): number {
  const T = MakeTime(date).tt / DAYS_PER_CENTURY;
  return normalize360(
    125.0445479 -
      1934.1362891 * T +
      0.0020754 * T * T +
      (T * T * T) / 467441 -
      (T * T * T * T) / 60616000,
  );
}

/** Sidereal mean Rāhu. Mean-equinox pairing: Ω_mean − mean ayanāṁśa. */
export function meanNodeSidereal(date: FlexibleDateTime): number {
  return normalize360(meanNodeTropical(date) - ayanamsha(date));
}

/**
 * Sidereal true (osculating) Rāhu: node of the instantaneous orbit from the
 * Moon's geocentric state vector, in the true ecliptic of date.
 */
export function trueNodeSidereal(date: FlexibleDateTime): number {
  const time = MakeTime(date);
  const s = GeoMoonState(time);
  const rot = Rotation_EQJ_ECT(time);
  const r = RotateVector(rot, new Vector(s.x, s.y, s.z, time));
  const v = RotateVector(rot, new Vector(s.vx, s.vy, s.vz, time));
  // h = r × v; ascending-node direction n = ẑ × h = (−h_y, h_x, 0).
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  const omegaTropicalTrue = normalize360((Math.atan2(hx, -hy) * 180) / Math.PI);
  return normalize360(omegaTropicalTrue - ayanamsha(date, { nutation: true }));
}

// ───────────────────────────────────────────────────────────────────────────
// Positions
// ───────────────────────────────────────────────────────────────────────────

/** Sidereal (Lahiri) longitude of a graha in degrees [0, 360). */
export function grahaLongitude(
  date: FlexibleDateTime,
  graha: Graha,
  opts: GrahaOptions = {},
): number {
  const node = opts.node ?? "mean";
  if (graha === "Rahu") {
    return node === "true" ? trueNodeSidereal(date) : meanNodeSidereal(date);
  }
  if (graha === "Ketu") {
    return normalize360(grahaLongitude(date, "Rahu", opts) + 180);
  }
  return siderealLongitude(date, REAL_BODIES[graha]!);
}

export interface GrahaPosition {
  graha: Graha;
  /** Sidereal (Lahiri) longitude, degrees [0, 360). */
  longitude: number;
  /** Rāśi index 0..11 (0 = Meṣa) and name. */
  rashi: number;
  rashiName: string;
  /** Degrees into the rāśi, 0..30. */
  degreesInRashi: number;
  /** Nakṣatra index 0..26, name, and pada 1..4. */
  nakshatra: number;
  nakshatraName: string;
  pada: number;
  /** Longitude motion < 0 (vakrī). Mean Rāhu/Ketu are always retrograde. */
  retrograde: boolean;
  /**
   * PROVENANCE — arcminutes to the nearest rāśi / nakṣatra boundary. A small
   * margin means the placement flips with small time or model changes
   * (birth-time precision, mean vs true node); consumers should surface it.
   */
  rashiMarginArcmin: number;
  nakshatraMarginArcmin: number;
}

const marginArcmin = (lon: number, stepDeg: number): number => {
  const into = lon % stepDeg;
  return Math.min(into, stepDeg - into) * 60;
};

/** Full position record for one graha. */
export function grahaPosition(
  date: FlexibleDateTime,
  graha: Graha,
  opts: GrahaOptions = {},
): GrahaPosition {
  const lon = grahaLongitude(date, graha, opts);
  // Retrograde: wrapped longitude rate over ±30 min.
  const t = MakeTime(date).date.getTime();
  const before = grahaLongitude(new Date(t - 1_800_000), graha, opts);
  const after = grahaLongitude(new Date(t + 1_800_000), graha, opts);
  const rate = ((after - before + 540) % 360) - 180;
  const nak = Math.floor(lon / DEG_PER_NAKSHATRA) % 27;
  return {
    graha,
    longitude: lon,
    rashi: Math.floor(lon / DEG_PER_RASHI) % 12,
    rashiName: RASHI_NAMES[Math.floor(lon / DEG_PER_RASHI) % 12],
    degreesInRashi: lon % DEG_PER_RASHI,
    nakshatra: nak,
    nakshatraName: NAKSHATRA_NAMES[nak],
    pada: (Math.floor(lon / DEG_PER_PADA) % 4) + 1,
    retrograde: rate < 0,
    rashiMarginArcmin: marginArcmin(lon, DEG_PER_RASHI),
    nakshatraMarginArcmin: marginArcmin(lon, DEG_PER_NAKSHATRA),
  };
}

/** All nine grahas at an instant. */
export function grahaPositions(
  date: FlexibleDateTime,
  opts: GrahaOptions = {},
): GrahaPosition[] {
  return GRAHA_NAMES.map((g) => grahaPosition(date, g, opts));
}

// ───────────────────────────────────────────────────────────────────────────
// Janma facts (the Moon-centric record matching & daśā key on)
// ───────────────────────────────────────────────────────────────────────────

export interface JanmaFacts {
  /** Birth instant (UTC) echoed back. */
  birth: Date;
  moon: GrahaPosition;
  /** Janma rāśi (Moon's rāśi) and janma nakṣatra convenience aliases. */
  janmaRashi: number;
  janmaRashiName: string;
  janmaNakshatra: number;
  janmaNakshatraName: string;
  janmaPada: number;
  /**
   * Fraction of the janma nakṣatra the Moon has traversed at birth, 0..1 —
   * by ELAPSED TIME within the nakṣatra's actual boundaries (not arc), the
   * convention Vimśottarī daśā balances are computed with.
   */
  nakshatraFractionElapsed: number;
  /** Pañcāṅga at the birth instant. */
  tithi: number;
  tithiName: string;
  yoga: number;
  yogaName: string;
  karana: string;
  /** Vāra (sunrise-to-sunrise weekday); null only at polar latitudes. */
  vara: Vara | null;
}

/** The Moon-centric birth record. Pure; throws on invalid location. */
export function janmaFacts(birth: Date, loc: GeoLocation): JanmaFacts {
  validateLocation(loc);
  const moon = grahaPosition(birth, "Moon");
  const nb = nakshatraBoundaries(birth);
  const fraction =
    (birth.getTime() - nb.start.getTime()) / (nb.end.getTime() - nb.start.getTime());
  const tithi = tithiAt(birth);
  const yoga = yogaAt(birth);
  return {
    birth,
    moon,
    janmaRashi: moon.rashi,
    janmaRashiName: moon.rashiName,
    janmaNakshatra: moon.nakshatra,
    janmaNakshatraName: moon.nakshatraName,
    janmaPada: moon.pada,
    nakshatraFractionElapsed: Math.min(1, Math.max(0, fraction)),
    tithi,
    tithiName: TITHI_NAMES[tithi - 1],
    yoga,
    yogaName: YOGA_NAMES[yoga],
    karana: karanaAt(birth),
    vara: varaAt(birth, loc),
  };
}

// Re-export for consumers assembling charts.
export { nakshatraAt };
