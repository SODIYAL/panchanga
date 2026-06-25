/**
 * api/_lib.ts — the platform-agnostic core of the HTTP JSON API.
 *
 * `handle(path, query)` is a PURE function: it parses & validates the request,
 * calls the panchanga engine, and returns `{ status, body, cacheSeconds }`. It
 * has no dependency on any HTTP framework, so it is unit-tested directly
 * (test/api.test.ts) and reused by the thin Vercel adapters in api/*.ts.
 *
 * Endpoints (all GET):
 *   /api/panchanga?date=YYYY-MM-DD&place=calgary           → daily pañcāṅga
 *   /api/festivals?year=2026&place=calgary                 → festival dates
 *   /api/eclipses?year=2026&place=calgary                  → grahaṇas
 *   /api                                                   → usage
 * Location is given either by a `place` preset or by `lat`, `lng` & `tz`.
 */

import {
  dailyPanchanga,
  computeFestivals,
  allRules,
  lunarEclipses,
  solarEclipses,
  type GeoLocation,
} from "../dist/index.js";

/** Named location presets so callers can pass `?place=calgary` instead of coords. */
const PRESETS: Record<string, GeoLocation & { name: string }> = {
  calgary: { name: "Calgary", latitude: 51.0447, longitude: -114.0719, timeZone: "America/Edmonton" },
  "new-delhi": { name: "New Delhi", latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" },
  toronto: { name: "Toronto", latitude: 43.6532, longitude: -79.3832, timeZone: "America/Toronto" },
  vancouver: { name: "Vancouver", latitude: 49.2827, longitude: -123.1207, timeZone: "America/Vancouver" },
  edmonton: { name: "Edmonton", latitude: 53.5461, longitude: -113.4938, timeZone: "America/Edmonton" },
  "new-york": { name: "New York", latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" },
  london: { name: "London", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
  mumbai: { name: "Mumbai", latitude: 19.076, longitude: 72.8777, timeZone: "Asia/Kolkata" },
};

export type Query = Record<string, string | string[] | undefined>;

export interface ApiResult {
  status: number;
  body: unknown;
  /** Seconds for the Cache-Control max-age (the engine is deterministic). */
  cacheSeconds: number;
}

/** A request error carrying an HTTP status; caught at the top of `handle`. */
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function first(q: Query, key: string): string | undefined {
  const v = q[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Resolve the location from `?place=` or `?lat=&lng=&tz=`. */
function resolveLocation(q: Query): GeoLocation & { name?: string } {
  const place = first(q, "place");
  if (place) {
    const preset = PRESETS[place.toLowerCase()];
    if (!preset) {
      throw new ApiError(
        400,
        `unknown place "${place}". Known places: ${Object.keys(PRESETS).join(", ")} — or pass lat, lng & tz.`,
      );
    }
    return preset;
  }
  const lat = first(q, "lat");
  const lng = first(q, "lng");
  const tz = first(q, "tz");
  if (lat === undefined || lng === undefined || tz === undefined) {
    throw new ApiError(400, "provide a location: ?place=<name> OR ?lat=<deg>&lng=<deg>&tz=<IANA>.");
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError(400, "lat and lng must be numbers.");
  }
  return { latitude, longitude, timeZone: tz };
}

/** A `YYYY-MM-DD` date, defaulting to today (UTC). */
function resolveDate(q: Query, today: string): { dateStr: string; instant: Date } {
  const raw = first(q, "date") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, `invalid date "${raw}"; expected YYYY-MM-DD.`);
  }
  // Noon UTC lands inside the intended local day for every timezone from −12 to
  // +11 (i.e. everywhere this calendar is used).
  const instant = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(instant.getTime())) throw new ApiError(400, `invalid date "${raw}".`);
  return { dateStr: raw, instant };
}

function resolveYear(q: Query, currentYear: number): number {
  const raw = first(q, "year");
  if (raw === undefined) return currentYear;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new ApiError(400, `invalid year "${raw}"; expected an integer in 1900..2200.`);
  }
  return year;
}

const USAGE = {
  name: "panchanga HTTP API",
  description: "Drik Panchanga (Smārta, pūrṇimānta) — tithi, nakṣatra, festivals & eclipses.",
  endpoints: {
    "GET /api/panchanga": "?date=YYYY-MM-DD (default today) & (place=<name> | lat&lng&tz)",
    "GET /api/festivals": "?year=YYYY (default current) & (place=<name> | lat&lng&tz)",
    "GET /api/eclipses": "?year=YYYY (default current) & (place=<name> | lat&lng&tz)",
  },
  places: Object.keys(PRESETS),
  source: "https://github.com/SODIYAL/panchanga",
};

/**
 * Resolve a request to a JSON response. `now` (a `{ today, year }` pair) is
 * injected so the function stays pure/testable — adapters pass the real clock.
 */
export function handle(path: string, query: Query, now: { today: string; year: number }): ApiResult {
  const route = path.replace(/\/+$/, "").split("/").pop() ?? "";
  try {
    switch (route) {
      case "panchanga": {
        const loc = resolveLocation(query);
        const { dateStr, instant } = resolveDate(query, now.today);
        const result = dailyPanchanga(instant, loc);
        return { status: 200, body: { requestedDate: dateStr, location: loc, panchanga: result }, cacheSeconds: 86_400 };
      }
      case "festivals": {
        const loc = resolveLocation(query);
        const year = resolveYear(query, now.year);
        const names = new Map(allRules(year).map((r) => [r.id, r.displayName]));
        const { results, diagnostics } = computeFestivals(year, loc, { rules: allRules(year) });
        const festivals = results
          .filter((r) => r.date)
          .map((r) => ({ id: r.id, name: names.get(r.id) ?? r.id, date: r.date, month: r.monthLabel.purnimanta }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return { status: 200, body: { year, location: loc, count: festivals.length, festivals, diagnostics }, cacheSeconds: 604_800 };
      }
      case "eclipses": {
        const loc = resolveLocation(query);
        const year = resolveYear(query, now.year);
        return {
          status: 200,
          body: { year, location: loc, lunar: lunarEclipses(year, loc), solar: solarEclipses(year, loc) },
          cacheSeconds: 604_800,
        };
      }
      case "api":
      case "":
        return { status: 200, body: USAGE, cacheSeconds: 86_400 };
      default:
        return { status: 404, body: { error: `unknown endpoint "${route}"`, usage: USAGE }, cacheSeconds: 0 };
    }
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400; // engine validation → 400
    return { status, body: { error: (e as Error).message }, cacheSeconds: 0 };
  }
}
