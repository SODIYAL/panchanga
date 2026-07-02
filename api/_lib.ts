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
import type { GeoLocation, FestivalRule, FestivalResult, Sampradaya } from "../dist/index.js";
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
  kundali,
  moonKundali,
  SHODASHAVARGA,
  localCivilTimeToUTC,
  janmaFacts,
  gunaMilan,
  mangalDosha,
} from "../api-engine/index.js";
import { PLACES } from "./places.generated.js";

/** A resolvable named location. The bulk come from places.generated.ts (every
 *  US + Canada city ≥10k people, plus every India city/town ≥15k); a handful
 *  of extra marquee cities are added below. */
type Place = GeoLocation & {
  slug: string;
  name: string;
  admin?: string; // state (USPS) / province (CA) code; absent for the extras
  country?: string;
  population?: number;
};

/** Non-US/CA cities kept reachable by slug. Their slugs take precedence over
 *  the generated list and over bare-name lookups, so `?place=london` stays
 *  London, UK (not the larger-by-our-data London, Ontario). */
const EXTRA_PLACES: Place[] = [
  { slug: "new-delhi", name: "New Delhi", latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" },
  { slug: "mumbai", name: "Mumbai", latitude: 19.076, longitude: 72.8777, timeZone: "Asia/Kolkata" },
  { slug: "london", name: "London", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
];

/** Short, friendly aliases → canonical slug (for names the dataset spells out). */
const ALIASES: Record<string, string> = {
  "new-york": "new-york-city-ny",
  nyc: "new-york-city-ny",
  la: "los-angeles-ca",
  sf: "san-francisco-ca",
  dc: "washington-dc",
};

/** US/CA cities first (already sorted by descending population), extras last. */
const ALL_PLACES: readonly Place[] = [...PLACES, ...EXTRA_PLACES];

/** Normalise a user-supplied place token the same way slugs are built:
 *  lowercase, strip diacritics, collapse non-alphanumerics to single hyphens. */
function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `/api/places` search only: EXTRA_PLACES keeps hand rows (mumbai, new-delhi)
 * reachable by bare slug for `?place=` compatibility, but the generated list
 * can independently carry the same physical city (mumbai-mh, new-delhi-dl) —
 * so a search for either would otherwise show the city twice. Collapse a pair
 * only when it can actually BE such a duplicate — one record without
 * `population` (a hand-kept extra) and one with (its generated counterpart) —
 * AND they share a normalized name and sit within half a degree of lat/lng.
 * Two populated records are always two genuinely distinct cities, even inside
 * the box (Kansas City MO/KS, Niagara Falls NY/ON, Bristol VA/TN straddle a
 * border); mere homonyms — London, UK vs. London, ON, ~9° apart — are also
 * left alone. `lookupPlace`/`?place=` is untouched.
 */
function dedupeSameCity(places: readonly Place[]): Place[] {
  const byName = new Map<string, Place[]>();
  for (const p of places) {
    const key = normalizeKey(p.name);
    const group = byName.get(key);
    if (group) group.push(p);
    else byName.set(key, [p]);
  }
  const drop = new Set<Place>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      if (drop.has(group[i])) continue;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (drop.has(b)) continue;
        const a = group[i];
        const samePlace = Math.abs(a.latitude - b.latitude) <= 0.5 && Math.abs(a.longitude - b.longitude) <= 0.5;
        if (!samePlace) continue;
        // Only an extras-vs-generated pair can be one city listed twice:
        // extras carry no population, generated rows always do. Both
        // populated ⇒ genuinely distinct twin cities — keep both.
        if ((a.population === undefined) === (b.population === undefined)) continue;
        drop.add(a.population === undefined ? a : b);
      }
    }
  }
  return drop.size === 0 ? places.slice() : places.filter((p) => !drop.has(p));
}

const BY_SLUG = new Map<string, Place>(ALL_PLACES.map((p) => [p.slug, p]));
// Bare city name → its most-populous bearer. PLACES is population-sorted, so the
// first time a name is seen it is the largest (e.g. "vancouver" → Vancouver, BC).
const BY_NAME = new Map<string, Place>();
for (const p of ALL_PLACES) {
  const key = normalizeKey(p.name);
  if (!BY_NAME.has(key)) BY_NAME.set(key, p);
}

/** Resolve a `?place=` token: exact slug → alias → bare city name (largest). */
function lookupPlace(raw: string): Place | undefined {
  const key = normalizeKey(raw);
  const aliased = ALIASES[key];
  return BY_SLUG.get(key) ?? (aliased ? BY_SLUG.get(aliased) : undefined) ?? BY_NAME.get(key);
}

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

interface ResolvedLocation extends GeoLocation {
  name?: string;
  admin?: string;
  country?: string;
}

/** Resolve the location from `?place=` or `?lat=&lng=&tz=`. */
function resolveLocation(q: Query): ResolvedLocation {
  const place = first(q, "place");
  if (place) {
    const p = lookupPlace(place);
    if (!p) {
      throw new ApiError(
        400,
        `unknown place "${place}". Use a slug like "calgary-ab" or "austin-tx", ` +
          `search GET /api/places?q=${encodeURIComponent(place)}, or pass lat, lng & tz.`,
      );
    }
    return { name: p.name, admin: p.admin, country: p.country, latitude: p.latitude, longitude: p.longitude, timeZone: p.timeZone };
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
    "GET /api/panchanga": "?date=YYYY-MM-DD (default today) & (place=<slug> | lat&lng&tz)",
    "GET /api/festivals":
      "?year=YYYY (default current) & (place=<slug> | lat&lng&tz) & sampradaya=smarta|vaishnava (Ekādaśī convention, default smarta) & detail=full (adds instants, rule, notes)",
    "GET /api/eclipses": "?year=YYYY (default current) & (place=<slug> | lat&lng&tz)",
    "GET /api/kundali":
      "?dob=YYYY-MM-DD & tob=HH:MM (local birth time; omit if unknown → Moon-chart) & (place=<slug> | lat&lng&tz) & node=mean|true (default mean) & vargas=all|D3,D10,… (BPHS shodashavarga divisional charts) & dashaLevels=2|3 (3 adds pratyantardashas) — janma-kundali: grahas, lagna+window, bhavas, navamsa+vargottama, Vimshottari dasha",
    "GET /api/guna-milan":
      "?groomDob=YYYY-MM-DD & groomTob=HH:MM (optional) & (groomPlace | groomLat&groomLng&groomTz) & brideDob & brideTob & (bridePlace | …) — ashtakoota (36-guna) matching with the per-koota breakdown, dosha/parihara evaluation, and (when both birth times are given) the Mangal-dosha comparison",
    "GET /api/calendar.ics":
      "?set=major|all|core (default major) & year=YYYY (default current+next) & (place | lat&lng&tz) & sampradaya=smarta|vaishnava — subscribable iCalendar feed",
    "GET /api/places": "?q=<name> & country=US|CA|IN & limit=N — search the supported cities",
  },
  places: ["calgary", "new-delhi", "toronto", "vancouver", "edmonton", "new-york", "mumbai", "london"],
  placesCount: ALL_PLACES.length,
  placeSearch: "every US & Canada city ≥10k people, and every India city/town ≥15k, is a slug (e.g. austin-tx, jaipur-rj); discover them via GET /api/places?q=",
  source: "https://github.com/SODIYAL/panchanga",
};

/** Which festivals an ICS feed carries. Default = the named festivals a temple
 *  calendar shows; "all" adds the twice-monthly recurring vratas; "core" = §4. */
function rulesForSet(set: string, year: number, sampradaya: Sampradaya): FestivalRule[] {
  if (set === "all") return allRules(year, { sampradaya });
  if (set === "core") return CORE_RULES;
  return [...CORE_RULES, ...oneOffFestivalRules(year), ...regionalFestivalRules(year), CHHATH_RULE];
}

/**
 * Resolve a birth (dob, optional tob) in `tz` to a UTC instant, strictly:
 * dob must be a REAL calendar date (no silent Feb-30 → Mar-2 rollover) within
 * the engine's validated 1900–2200 envelope; tob must be 24h HH:MM. The
 * wall-clock → UTC conversion is DST-correct (`localCivilTimeToUTC`), so a
 * birth on a spring-forward/fall-back day resolves to the right instant.
 */
function resolveBirth(
  dob: string | undefined,
  tob: string | undefined,
  tz: string,
  label: string,
): { birth: Date; timeKnown: boolean } {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    throw new ApiError(400, `invalid or missing ${label} "${dob ?? ""}"; expected YYYY-MM-DD (local birth date).`);
  }
  const [y, m, d] = dob.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) {
    throw new ApiError(400, `${label} "${dob}" is not a real calendar date.`);
  }
  if (y < 1900 || y > 2200) {
    throw new ApiError(400, `${label} year ${y} is outside the validated 1900–2200 range.`);
  }
  if (tob !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(tob)) {
    throw new ApiError(400, `invalid ${label.replace("Dob", "Tob").replace("dob", "tob")} "${tob}"; expected HH:MM (24h), or omit if unknown.`);
  }
  const [hh, mm] = (tob ?? "12:00").split(":").map(Number);
  return { birth: localCivilTimeToUTC(y, m, d, hh, mm, tz), timeKnown: tob !== undefined };
}

/** Parse `?sampradaya=` (Ekādaśī convention). Default Smārta. */
function resolveSampradaya(q: Query): Sampradaya {
  const raw = (first(q, "sampradaya") ?? "smarta").toLowerCase();
  if (raw !== "smarta" && raw !== "vaishnava") {
    throw new ApiError(400, `invalid sampradaya "${raw}"; expected "smarta" or "vaishnava".`);
  }
  return raw;
}

// ── Provenance ──────────────────────────────────────────────────────────────
// Every date the API emits can explain itself: `basis` is a one-line
// human-readable digest of the rule that decided it; `detail=full` adds the
// raw observance, the key instants, and the engine's per-rule notes.

const RASHI_NAMES = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const tithiWord = (t: number | string): string => (typeof t === "string" ? t : `tithi ${t}`);

/** One-line human-readable statement of how a rule resolves its date. */
function describeObservance(rule: FestivalRule): string {
  const o = rule.observance;
  // Month prefix ("Kartika ") — empty (not a stray leading space) for the
  // rules that carry no month label.
  const m = rule.month?.purnimanta ? `${rule.month.purnimanta} ` : "";
  switch (o.kind) {
    case "tithi-pervades": {
      const parts = [
        `${m}${o.paksha} ${tithiWord(o.tithi)} pervading the ${o.window} window (precedence: ${o.precedence})`,
      ];
      if (o.nakshatra) parts.push(`${o.nakshatra.name} nakshatra (${o.nakshatra.mode})`);
      if (o.avoidKarana === "vishti") parts.push("Bhadra (Vishti) excluded");
      if (o.vedha) parts.push(`previous-tithi vedha at ${o.vedha.at} shifts to the next day`);
      if (o.adhika === "prefer-adhika") parts.push("prefers the adhika lunation");
      return parts.join("; ");
    }
    case "solar-ingress":
      return `Sun's sidereal ingress into ${RASHI_NAMES[o.rashi] ?? `rashi ${o.rashi}`}`;
    case "moonrise":
      return `${m}${o.paksha} ${tithiWord(o.tithi)} live at moonrise`;
    case "solar-arghya":
      return `${m}${o.paksha} ${tithiWord(o.tithi)}: sunset arghya + next-sunrise arghya`;
    case "derived":
      return `${Math.abs(o.offsetDays)} day(s) ${o.offsetDays >= 0 ? "after" : "before"} ${o.from}`;
    case "nakshatra-pervades":
      return `${o.nakshatra} nakshatra at sunrise with the Sun in ${RASHI_NAMES[o.solarRashi] ?? `rashi ${o.solarRashi}`}`;
    case "weekday-relative":
      return `latest ${WEEKDAY_NAMES[o.weekday] ?? `weekday ${o.weekday}`} before ${o.from}`;
  }
}

/** "Nov 20, 07:16" in the location's own timezone. */
function fmtLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Multi-line provenance text for an ICS VEVENT description. */
function eventDescription(rule: FestivalRule, r: FestivalResult, tz: string): string {
  const parts = [describeObservance(rule)];
  if (r.instants.tithiStart && r.instants.tithiEnd) {
    parts.push(`Tithi: ${fmtLocal(r.instants.tithiStart, tz)} – ${fmtLocal(r.instants.tithiEnd, tz)} (${tz})`);
  } else if (r.instants.ingress) {
    parts.push(`Ingress: ${fmtLocal(r.instants.ingress, tz)} (${tz})`);
  }
  if (r.instants.moonrise) parts.push(`Moonrise: ${fmtLocal(r.instants.moonrise, tz)} (${tz})`);
  parts.push("Computed astronomically (drik) — verify with your local authority before ritual use.");
  return parts.join("\n");
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
function buildIcs(
  calName: string,
  events: { id: string; name: string; date: string; description?: string }[],
): string {
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
      ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
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
        const sampradaya = resolveSampradaya(query);
        const full = (first(query, "detail") ?? "").toLowerCase() === "full";
        const rules = allRules(year, { sampradaya });
        const ruleById = new Map(rules.map((r) => [r.id, r]));
        const { results, diagnostics } = computeFestivals(year, loc, { rules });
        const festivals = results
          .filter((r) => r.date)
          .map((r) => {
            const rule = ruleById.get(r.id);
            return {
              id: r.id,
              name: rule?.displayName ?? r.id,
              date: r.date,
              month: r.monthLabel.purnimanta,
              sampradaya: rule?.sampradaya ?? "smarta",
              basis: rule ? describeObservance(rule) : "",
              ...(full
                ? { instants: r.instants, rule: rule?.observance, notes: r.diagnostics }
                : {}),
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));
        return {
          status: 200,
          body: { year, location: loc, sampradaya, count: festivals.length, festivals, diagnostics },
          cacheSeconds: 604_800,
        };
      }
      case "kundali": {
        const loc = resolveLocation(query);
        const dob = first(query, "dob");
        const tob = first(query, "tob");
        const nodeRaw = (first(query, "node") ?? "mean").toLowerCase();
        if (nodeRaw !== "mean" && nodeRaw !== "true") {
          throw new ApiError(400, `invalid node "${nodeRaw}"; expected "mean" (Parashara-era default) or "true".`);
        }
        // Divisional charts: "all" or a comma list of shodashavarga keys.
        const vargasRaw = first(query, "vargas");
        let vargas: readonly string[] | "all" | undefined;
        if (vargasRaw !== undefined) {
          if (vargasRaw.toLowerCase() === "all") vargas = "all";
          else {
            const list = vargasRaw.split(",").map((v) => v.trim().toUpperCase());
            const bad = list.filter((v) => !(SHODASHAVARGA as readonly string[]).includes(v));
            if (bad.length > 0) {
              throw new ApiError(400, `unknown varga(s) "${bad.join(", ")}"; expected a subset of ${SHODASHAVARGA.join(", ")} or "all".`);
            }
            vargas = list;
          }
        }
        const levelsRaw = first(query, "dashaLevels");
        if (levelsRaw !== undefined && levelsRaw !== "2" && levelsRaw !== "3") {
          throw new ApiError(400, `invalid dashaLevels "${levelsRaw}"; expected 2 (maha+antar) or 3 (+pratyantar).`);
        }
        const dashaLevels = levelsRaw === "3" ? 3 : 2;
        const { birth, timeKnown } = resolveBirth(dob, tob, loc.timeZone, "dob");
        const chartOpts = { node: nodeRaw, vargas, dashaLevels } as Parameters<typeof kundali>[2];
        try {
          const chart = timeKnown
            ? kundali(birth, loc, chartOpts)
            : moonKundali(birth, loc, chartOpts);
          return {
            status: 200,
            body: {
              input: { dob, tob: tob ?? null, timeUnknown: !timeKnown, location: loc, node: nodeRaw },
              kundali: chart,
              note: !timeKnown
                ? "birth time unknown: Moon-chart mode (bhavas from chandra lagna; no lagna-dependent outputs). Positions computed for local noon; the Moon moves ~13°/day, so janma nakshatra may be uncertain on nakshatra-transition days."
                : undefined,
            },
            cacheSeconds: 31_536_000, // a birth chart is immutable
          };
        } catch (e) {
          throw new ApiError(400, (e as Error).message); // e.g. polar-latitude lagna
        }
      }
      case "guna-milan": {
        // Per-party birth resolution: prefixed params re-routed through the
        // same location/date machinery as everything else.
        const party = (prefix: "groom" | "bride") => {
          const sub: Query = {
            place: first(query, `${prefix}Place`),
            lat: first(query, `${prefix}Lat`),
            lng: first(query, `${prefix}Lng`),
            tz: first(query, `${prefix}Tz`),
          };
          let loc: ResolvedLocation;
          try {
            loc = resolveLocation(sub);
          } catch (e) {
            // Prefix the location error so the caller knows WHICH party's
            // location is missing/wrong.
            throw new ApiError(400, `${prefix}: ${(e as Error).message.replace("?place=", `?${prefix}Place=`)}`);
          }
          const { birth, timeKnown } = resolveBirth(
            first(query, `${prefix}Dob`),
            first(query, `${prefix}Tob`),
            loc.timeZone,
            `${prefix}Dob`,
          );
          return { loc, birth, timeKnown };
        };
        const groom = party("groom");
        const bride = party("bride");
        const gFacts = janmaFacts(groom.birth, groom.loc);
        const bFacts = janmaFacts(bride.birth, bride.loc);
        const milan = gunaMilan(gFacts, bFacts);

        // Provenance: an unknown birth time makes the janma nakṣatra itself
        // uncertain on Moon-transition days — surface, don't bury.
        const warnings: string[] = [];
        for (const [who, p, f] of [["groom", groom, gFacts], ["bride", bride, bFacts]] as const) {
          if (!p.timeKnown) {
            warnings.push(
              `${who}: birth time unknown (noon assumed). Janma nakṣatra margin is ` +
                `${f.moon.nakshatraMarginArcmin.toFixed(0)}′ — the Moon moves ~13°/day, so verify the ` +
                `nakṣatra if the birth fell near a transition.`,
            );
          }
        }

        // Mangal-doṣa comparison only when BOTH lagnas are computable.
        let manglik: unknown;
        if (groom.timeKnown && bride.timeKnown) {
          try {
            const gk = kundali(groom.birth, groom.loc);
            const bk = kundali(bride.birth, bride.loc);
            const g = mangalDosha(gk.grahas, gk.lagna.rashi);
            const b = mangalDosha(bk.grahas, bk.lagna.rashi);
            manglik = {
              groom: g,
              bride: b,
              note:
                g.present === b.present
                  ? "both parties have the same Mangal-doṣa status (a classical mutual-cancellation consideration)"
                  : "Mangal-doṣa status differs between the parties; consult a jyotiṣī on the parihāras",
            };
          } catch {
            /* polar lagna etc. — omit the manglik section rather than fail the match */
          }
        }

        return {
          status: 200,
          body: { gunaMilan: milan, manglik: manglik ?? null, warnings },
          cacheSeconds: 31_536_000,
        };
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
        const sampradaya = resolveSampradaya(query);
        // A single year if pinned, else a rolling current+next year so a
        // subscriber always has upcoming festivals without re-subscribing.
        const years = first(query, "year") ? [resolveYear(query, now.year)] : [now.year, now.year + 1];
        const seen = new Set<string>();
        const events: { id: string; name: string; date: string; description?: string }[] = [];
        for (const y of years) {
          const rules = rulesForSet(set, y, sampradaya);
          const ruleById = new Map(rules.map((r) => [r.id, r]));
          for (const r of computeFestivals(y, loc, { rules }).results) {
            if (!r.date) continue;
            const uid = `${r.id}-${r.date}`;
            if (seen.has(uid)) continue;
            seen.add(uid);
            const rule = ruleById.get(r.id);
            events.push({
              id: r.id,
              name: rule?.displayName ?? r.id,
              date: r.date,
              description: rule ? eventDescription(rule, r, loc.timeZone) : undefined,
            });
          }
        }
        events.sort((a, b) => a.date.localeCompare(b.date));
        const label = loc.name
          ? loc.admin
            ? `${loc.name}, ${loc.admin}`
            : loc.name
          : `${loc.latitude},${loc.longitude}`;
        const ics = buildIcs(`HSNA Festivals — ${label}`, events);
        return { status: 200, body: ics, contentType: "text/calendar; charset=utf-8", cacheSeconds: 86_400 };
      }
      case "places": {
        const q = (first(query, "q") ?? "").trim();
        const key = normalizeKey(q);
        // Hyphen-collapsed form so a squashed query ("dehradun", "jerseycity")
        // still matches a multi-word NAME ("Dehra Dūn", "Jersey City"). Only
        // the name is compacted — compacting the slug would glue the name to
        // the state suffix ("dehradunut") and make ?q=nut a false hit.
        const compactKey = key.replace(/-/g, "");
        const country = (first(query, "country") ?? "").toUpperCase();
        const rawLimit = Number(first(query, "limit"));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 25;
        const filtered = ALL_PLACES.filter((p) => {
          if (country && p.country !== country) return false;
          if (!key) return true;
          const nameKey = normalizeKey(p.name);
          return (
            p.slug.includes(key) ||
            nameKey.includes(key) ||
            nameKey.replace(/-/g, "").includes(compactKey)
          );
        });
        const matches = dedupeSameCity(filtered);
        const places = matches.slice(0, limit).map((p) => ({
          slug: p.slug,
          name: p.name,
          admin: p.admin,
          country: p.country,
          latitude: p.latitude,
          longitude: p.longitude,
          timeZone: p.timeZone,
          population: p.population,
        }));
        return { status: 200, body: { query: q, total: matches.length, count: places.length, places }, cacheSeconds: 86_400 };
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
