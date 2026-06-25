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

// Runtime values come from the esbuild bundle (api-engine/index.js) with
// astronomy-engine inlined, so the Vercel ESM lambda never resolves
// astronomy-engine's CommonJS build (whose `Body` enum defeats Node's named-
// export detection). Types come from the real library declarations.
import type { GeoLocation, FestivalRule } from "../dist/index.js";
import {
  dailyPanchanga,
  computeFestivals,
  allRules,
  CORE_RULES,
  oneOffFestivalRules,
  regionalFestivalRules,
  CHHATH_RULE,
  lunarEclipses,
  solarEclipses,
} from "../api-engine/index.js";

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
  /** An object (serialised to JSON by the adapter) or a ready-made string. */
  body: unknown;
  /** Seconds for the Cache-Control max-age (the engine is deterministic). */
  cacheSeconds: number;
  /** Overrides the default `application/json` (e.g. `text/calendar` for .ics). */
  contentType?: string;
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
    "GET /api/calendar.ics": "?set=major|all|core (default major) & year=YYYY (default current+next) & (place | lat&lng&tz) — subscribable iCalendar feed",
  },
  places: Object.keys(PRESETS),
  source: "https://github.com/SODIYAL/panchanga",
};

/** Which festivals an ICS feed carries. Default = the named festivals a temple
 *  calendar shows; "all" adds the twice-monthly recurring vratas; "core" = §4. */
function rulesForSet(set: string, year: number): FestivalRule[] {
  if (set === "all") return allRules(year);
  if (set === "core") return CORE_RULES;
  return [...CORE_RULES, ...oneOffFestivalRules(year), ...regionalFestivalRules(year), CHHATH_RULE];
}

const nextDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Escape an iCalendar TEXT value (RFC 5545 §3.3.11). */
const icsEscape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold a content line at 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let s = line;
  while (s.length > 75) {
    out.push(s.slice(0, 75));
    s = " " + s.slice(75);
  }
  out.push(s);
  return out.join("\r\n");
}

/** Build an iCalendar document of all-day festival events. */
function buildIcs(calName: string, events: { id: string; name: string; date: string }[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HSNA//panchanga//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT24H",
    "X-PUBLISHED-TTL:PT24H",
  ];
  for (const e of events) {
    const d = e.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}-${e.date}@panchanga`,
      `DTSTAMP:${d}T000000Z`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${nextDay(e.date).replace(/-/g, "")}`,
      `SUMMARY:${icsEscape(e.name)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

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
      case "calendar": {
        const loc = resolveLocation(query);
        const set = (first(query, "set") ?? "major").toLowerCase();
        // A single year if pinned, else a rolling current+next year so a
        // subscriber always has upcoming festivals without re-subscribing.
        const years = first(query, "year") ? [resolveYear(query, now.year)] : [now.year, now.year + 1];
        const seen = new Set<string>();
        const events: { id: string; name: string; date: string }[] = [];
        for (const y of years) {
          const rules = rulesForSet(set, y);
          const names = new Map(rules.map((r) => [r.id, r.displayName]));
          for (const r of computeFestivals(y, loc, { rules }).results) {
            if (!r.date) continue;
            const uid = `${r.id}-${r.date}`;
            if (seen.has(uid)) continue;
            seen.add(uid);
            events.push({ id: r.id, name: names.get(r.id) ?? r.id, date: r.date });
          }
        }
        events.sort((a, b) => a.date.localeCompare(b.date));
        const place = (loc as { name?: string }).name ?? `${loc.latitude},${loc.longitude}`;
        const ics = buildIcs(`HSNA Festivals — ${place}`, events);
        return { status: 200, body: ics, contentType: "text/calendar; charset=utf-8", cacheSeconds: 86_400 };
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
