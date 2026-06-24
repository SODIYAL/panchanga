/**
 * src/panchanga.ts — the daily pañcāṅga aggregator.
 *
 * `dailyPanchanga(date, loc)` bundles the five aṅgas — vāra, tithi, nakṣatra,
 * yoga, karaṇa — plus the day's sun/moon instants and lunar-month label into a
 * single record. Each running aṅga is resolved at the day's SUNRISE (the udaya
 * convention: "today's tithi/yoga" is the one prevailing at sunrise), and each
 * carries the instant at which it gives way to the next.
 *
 * This module computes NOTHING new: it composes the element functions in
 * `elements.ts`, the rise/set + vāra helpers in `time.ts`, and the lunar-month
 * label in `elements.ts`. It is the convenience layer that turns a kit of
 * primitives into "the pañcāṅga for this day at this place".
 */

import type { GeoLocation, Paksha } from "./types.js";

import {
  tithiBoundaries,
  nakshatraBoundaries,
  yogaBoundaries,
  karanaBoundaries,
  lunarMonth,
  TITHI_NAMES,
  NAKSHATRA_NAMES,
  YOGA_NAMES,
} from "./elements.js";

import {
  startOfLocalDayUTC,
  localDayString,
  riseSet,
  sunset,
  moonrise,
  VARA_NAMES,
} from "./time.js";

const DAY_MS = 86_400_000;

/** A running aṅga (nakṣatra / yoga / karaṇa) prevailing at sunrise. */
export interface RunningElement {
  /** Element index (nakṣatra/yoga 0..26; karaṇa half-tithi 0..59). */
  index: number;
  /** Element name. */
  name: string;
  /** ISO-UTC instant this element ends (gives way to the next). */
  endsAt: string;
}

/** The full pañcāṅga for one civil day at one location. */
export interface DailyPanchanga {
  /** Civil date (YYYY-MM-DD) in `loc`'s timezone. */
  date: string;
  location: GeoLocation;
  /** ISO-UTC sun/moon instants for the day; `null` at polar latitudes. */
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  /** Vāra (weekday) of this civil day. */
  vara: { index: number; name: string };
  /** Tithi prevailing at sunrise. `number` is the absolute tithi 1..30. */
  tithi: { number: number; name: string; paksha: Paksha; endsAt: string };
  nakshatra: RunningElement;
  yoga: RunningElement;
  karana: RunningElement;
  /** Lunar-month labels + paksha at sunrise. */
  month: { purnimanta: string; amanta: string; paksha: Paksha };
}

/**
 * Compute the full pañcāṅga for the civil day of `date` at `loc`.
 *
 * Every running aṅga is read at the day's sunrise. If there is no sunrise
 * (polar day/night), the aṅgas are anchored at local solar-ish noon so the day
 * still yields a pañcāṅga, while `sunrise`/`sunset`/`moonrise` report `null`.
 */
export function dailyPanchanga(date: Date, loc: GeoLocation): DailyPanchanga {
  const dateStr = localDayString(date, loc.timeZone);
  const dayStart = startOfLocalDayUTC(date, loc.timeZone);

  const sr = riseSet("rise", dayStart, loc);
  const ss = sunset(dayStart, loc);
  const mr = moonrise(dayStart, loc);

  // Resolve every running aṅga at sunrise (udaya); fall back to local noon when
  // there is no sunrise so the day still produces a pañcāṅga.
  const anchor = sr ?? new Date(dayStart.getTime() + DAY_MS / 2);

  const tb = tithiBoundaries(anchor);
  const tithiPaksha: Paksha = tb.number <= 15 ? "shukla" : "krishna";
  const nb = nakshatraBoundaries(anchor);
  const yb = yogaBoundaries(anchor);
  const kb = karanaBoundaries(anchor);
  const lm = lunarMonth(anchor, { system: "purnimanta" });

  // The vāra of a named civil day is simply that date's weekday (the
  // sunrise-rollback in `varaAt` only matters for arbitrary pre-dawn instants).
  const varaIndex = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

  return {
    date: dateStr,
    location: loc,
    sunrise: sr ? sr.toISOString() : null,
    sunset: ss ? ss.toISOString() : null,
    moonrise: mr ? mr.toISOString() : null,
    vara: { index: varaIndex, name: VARA_NAMES[varaIndex] },
    tithi: {
      number: tb.number,
      name: TITHI_NAMES[tb.number - 1],
      paksha: tithiPaksha,
      endsAt: tb.end.toISOString(),
    },
    nakshatra: { index: nb.index, name: NAKSHATRA_NAMES[nb.index], endsAt: nb.end.toISOString() },
    yoga: { index: yb.index, name: YOGA_NAMES[yb.index], endsAt: yb.end.toISOString() },
    karana: { index: kb.index, name: kb.name, endsAt: kb.end.toISOString() },
    month: { purnimanta: lm.purnimantaLabel, amanta: lm.amantaLabel, paksha: lm.paksha },
  };
}
