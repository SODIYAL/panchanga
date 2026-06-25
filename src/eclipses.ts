/**
 * src/eclipses.ts — grahaṇa (solar & lunar eclipses).
 *
 * Wraps astronomy-engine's eclipse search to enumerate the eclipses of a given
 * year, with their contact timings, type, local visibility, and sūtak window.
 *
 * Conventions:
 *  • A grahaṇa "counts" for a location only when it is VISIBLE there — a lunar
 *    eclipse when the Moon is above the horizon during the umbral/penumbral
 *    phase, a solar eclipse when the Sun is above the horizon and the disc is
 *    obscured. Sūtak (the abstention period) applies only to a visible eclipse.
 *  • Sūtak begins before first contact: 9 hours (3 prahara) for a Chandra
 *    Grahaṇa, 12 hours (4 prahara) for a Sūrya Grahaṇa, and runs to mokṣa (last
 *    contact). This is the widely-used Smārta convention.
 *
 * Timings are UTC instants. Lunar contact times are derived from the eclipse
 * peak and astronomy-engine's semi-durations (sd_*, in minutes).
 */

import {
  SearchLunarEclipse,
  NextLunarEclipse,
  SearchGlobalSolarEclipse,
  NextGlobalSolarEclipse,
  SearchLocalSolarEclipse,
  Equator,
  Horizon,
  Observer,
  Body,
  MakeTime,
} from "astronomy-engine";

import { validateLocation, type GeoLocation, type IsoWindow } from "./time.js";

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

const iso = (d: Date): string => d.toISOString();
const isoWin = (start: Date, end: Date): IsoWindow => ({ start: iso(start), end: iso(end) });

/**
 * Eclipse type (grahaṇa kind), as a local string union so consumers can name
 * the discriminant without reaching into the `astronomy-engine` dependency.
 */
export type GrahanKind = "penumbral" | "partial" | "total" | "annular";

// All timed fields are ISO-UTC strings, matching the other assembled result
// objects (DailyPanchanga, FestivalResult). Use `new Date(...)` to deserialize.
export interface LunarEclipse {
  kind: GrahanKind; // penumbral | partial | total
  /** ISO-UTC instant of greatest eclipse. */
  peak: string;
  penumbral: IsoWindow;
  /** Umbral partial phase; null for a penumbral-only eclipse. */
  partial: IsoWindow | null;
  /** Totality; null unless the eclipse is total. */
  total: IsoWindow | null;
  /** Whether the Moon is above the horizon at peak in `loc` (null if no loc). */
  visible: boolean | null;
  /** Sūtak window (9h before umbral first contact → mokṣa) when visible; else null. */
  sutak: IsoWindow | null;
}

export interface SolarEclipse {
  kind: GrahanKind; // partial | annular | total
  /** ISO-UTC instant of greatest eclipse (global). */
  peak: string;
  /** Local circumstances at `loc` when the eclipse is seen there; else null. */
  local: { partialStart: string; peak: string; partialEnd: string; obscuration: number } | null;
  visible: boolean | null;
  /** Sūtak window (12h before local first contact → last contact); else null. */
  sutak: IsoWindow | null;
}

/** Altitude (degrees) of `body` at instant `when` as seen from `loc`. */
function altitude(body: Body, when: Date, loc: GeoLocation): number {
  const t = MakeTime(when);
  const obs = new Observer(loc.latitude, loc.longitude, loc.elevationMeters ?? 0);
  const eq = Equator(body, t, obs, true, true);
  return Horizon(t, obs, eq.ra, eq.dec, "normal").altitude;
}

/** All lunar eclipses whose peak falls in calendar `year` (UTC). */
export function lunarEclipses(year: number, loc?: GeoLocation): LunarEclipse[] {
  if (loc) validateLocation(loc);
  const out: LunarEclipse[] = [];
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);

  let e = SearchLunarEclipse(new Date(yearStart));
  // Guard against an eclipse found just before the year boundary.
  for (let i = 0; i < 30 && e.peak.date.getTime() < yearStart; i++) e = NextLunarEclipse(e.peak);

  for (let i = 0; i < 30 && e.peak.date.getTime() < yearEnd; i++) {
    const peak = e.peak.date;
    const span = (sdMin: number): IsoWindow =>
      isoWin(new Date(peak.getTime() - sdMin * MIN_MS), new Date(peak.getTime() + sdMin * MIN_MS));
    const penumbral = span(e.sd_penum);
    const partial = e.sd_partial > 0 ? span(e.sd_partial) : null;
    const total = e.sd_total > 0 ? span(e.sd_total) : null;

    const visible = loc ? altitude(Body.Moon, peak, loc) > 0 : null;
    // Sūtak applies only to a grahaṇa with an UMBRAL phase. A purely penumbral
    // (māndya / upacchāyā) lunar eclipse is not reckoned as a grahaṇa in the
    // Smārta convention, so it carries no sūtak; and for umbral eclipses the
    // window is reckoned from the umbral (partial) contacts, not the penumbral.
    const sutak =
      visible && partial
        ? isoWin(new Date(new Date(partial.start).getTime() - 9 * HOUR_MS), new Date(partial.end))
        : null;

    out.push({
      kind: e.kind as unknown as GrahanKind,
      peak: iso(peak),
      penumbral,
      partial,
      total,
      visible,
      sutak,
    });
    e = NextLunarEclipse(e.peak);
  }
  return out;
}

/** All solar eclipses whose greatest-eclipse instant falls in calendar `year`. */
export function solarEclipses(year: number, loc?: GeoLocation): SolarEclipse[] {
  if (loc) validateLocation(loc);
  const out: SolarEclipse[] = [];
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);

  let e = SearchGlobalSolarEclipse(new Date(yearStart));
  for (let i = 0; i < 30 && e.peak.date.getTime() < yearStart; i++) e = NextGlobalSolarEclipse(e.peak);

  for (let i = 0; i < 30 && e.peak.date.getTime() < yearEnd; i++) {
    const peak = e.peak.date;
    let local: SolarEclipse["local"] = null;
    let visible: boolean | null = loc ? false : null;
    let sutak: IsoWindow | null = null;

    if (loc) {
      const obs = new Observer(loc.latitude, loc.longitude, loc.elevationMeters ?? 0);
      // Search a local eclipse around the global peak; accept it only if it is
      // the SAME event (its peak is within a day) and the Sun is up & obscured.
      const lse = SearchLocalSolarEclipse(new Date(peak.getTime() - 24 * HOUR_MS), obs);
      const within = Math.abs(lse.peak.time.date.getTime() - peak.getTime()) < 24 * HOUR_MS;
      if (within && lse.partial_begin && lse.peak.altitude > 0 && lse.obscuration > 0) {
        const partialStart = lse.partial_begin.time.date;
        const partialEnd = lse.partial_end!.time.date;
        local = {
          partialStart: iso(partialStart),
          peak: iso(lse.peak.time.date),
          partialEnd: iso(partialEnd),
          obscuration: lse.obscuration,
        };
        visible = true;
        sutak = isoWin(new Date(partialStart.getTime() - 12 * HOUR_MS), partialEnd);
      }
    }

    out.push({ kind: e.kind as unknown as GrahanKind, peak: iso(peak), local, visible, sutak });
    e = NextGlobalSolarEclipse(e.peak);
  }
  return out;
}
