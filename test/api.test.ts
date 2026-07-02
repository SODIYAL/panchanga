/**
 * test/api.test.ts — the HTTP API core (api/_lib.ts). Exercises routing,
 * location/date/year parsing, validation → status codes, and payload shape,
 * with a fixed clock so it's deterministic. Imports the engine via the built
 * ../dist (the API does too), so `npm run build` must run first — CI builds
 * before testing.
 */
import { describe, it, expect } from "vitest";
import { handle, type Query } from "../api/_lib.js";

const NOW = { today: "2026-06-25", year: 2026 };
const call = (route: string, query: Query = {}) => handle(route, query, NOW);

describe("api /panchanga", () => {
  it("returns the daily pañcāṅga for a place preset", () => {
    const r = call("/api/panchanga", { place: "calgary", date: "2026-11-08" });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.requestedDate).toBe("2026-11-08");
    expect(body.location.name).toBe("Calgary");
    expect(body.panchanga.date).toBe("2026-11-08");
    expect(body.panchanga.tithi.name).toBe("Amavasya"); // Kārtika Amāvāsyā — Diwali day
    expect(body.panchanga.tithi.paksha).toBe("krishna");
    expect(r.cacheSeconds).toBeGreaterThan(0);
  });

  it("accepts explicit lat/lng/tz", () => {
    const r = call("/api/panchanga", { lat: "28.6139", lng: "77.209", tz: "Asia/Kolkata", date: "2026-01-23" });
    expect(r.status).toBe(200);
    expect((r.body as any).panchanga.vara.name).toBe("Shukravara"); // Friday
  });

  it("defaults the date to today when omitted", () => {
    const r = call("/api/panchanga", { place: "new-delhi" });
    expect(r.status).toBe(200);
    expect((r.body as any).requestedDate).toBe("2026-06-25");
  });

  it("resolves a state-qualified slug, exposing admin & country", () => {
    const r = call("/api/panchanga", { place: "austin-tx", date: "2026-06-25" });
    expect(r.status).toBe(200);
    const loc = (r.body as any).location;
    expect(loc.name).toBe("Austin");
    expect(loc.admin).toBe("TX");
    expect(loc.country).toBe("US");
    expect(loc.timeZone).toBe("America/Chicago");
  });

  it("resolves a bare city name to its most-populous bearer", () => {
    // Vancouver, BC (~600k) beats Vancouver, WA; Austin → Austin, TX.
    expect((call("/api/panchanga", { place: "vancouver" }).body as any).location.admin).toBe("BC");
    expect((call("/api/panchanga", { place: "austin" }).body as any).location.admin).toBe("TX");
  });

  it("keeps the legacy place slugs working", () => {
    for (const place of ["calgary", "toronto", "edmonton", "new-york", "london", "mumbai", "new-delhi"]) {
      expect(call("/api/panchanga", { place }).status).toBe(200);
    }
    // new-york (alias) and london (non-US/CA extra) resolve to the expected cities
    expect((call("/api/panchanga", { place: "new-york" }).body as any).location.name).toBe("New York City");
    expect((call("/api/panchanga", { place: "london" }).body as any).location.timeZone).toBe("Europe/London");
  });
});

describe("api /places (search)", () => {
  it("finds cities by substring, ranked by population, with a total", () => {
    const r = call("/api/places", { q: "spring" });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.count).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThanOrEqual(body.count);
    expect(body.places.every((p: any) => /spring/i.test(p.name) || p.slug.includes("spring"))).toBe(true);
    // population-sorted (descending)
    const pops = body.places.map((p: any) => p.population);
    expect([...pops].sort((a: number, b: number) => b - a)).toEqual(pops);
  });

  it("filters by country and honours limit", () => {
    const r = call("/api/places", { q: "a", country: "CA", limit: "5" });
    const body = r.body as any;
    expect(body.places).toHaveLength(5);
    expect(body.places.every((p: any) => p.country === "CA")).toBe(true);
  });

  it("returns the most-populous cities when q is empty", () => {
    const body = call("/api/places", {}).body as any;
    expect(body.places[0].slug).toBe("mumbai-mh");
  });

  // EXTRA_PLACES keeps hand rows (mumbai, new-delhi) alive for ?place=
  // compatibility, but the generated list now also carries the same physical
  // cities (mumbai-mh, new-delhi-dl) — a search must collapse the pair.
  it("de-dupes same-city results: ?q=mumbai returns exactly one Mumbai", () => {
    const body = call("/api/places", { q: "mumbai" }).body as any;
    const matches = body.places.filter((p: any) => p.name === "Mumbai");
    expect(matches).toHaveLength(1);
    expect(matches[0].slug).toBe("mumbai-mh"); // the richer, populated generated row wins
    expect(matches[0].population).toBeDefined();
  });

  it("de-dupes same-city results: ?q=new delhi returns exactly one New Delhi", () => {
    const body = call("/api/places", { q: "new delhi" }).body as any;
    const matches = body.places.filter((p: any) => p.name === "New Delhi");
    expect(matches).toHaveLength(1);
    expect(matches[0].slug).toBe("new-delhi-dl");
    expect(matches[0].population).toBeDefined();
  });

  it("does NOT de-dupe genuine homonyms: ?q=london still returns London, UK and London, ON", () => {
    const body = call("/api/places", { q: "london" }).body as any;
    expect(body.places.some((p: any) => p.slug === "london")).toBe(true); // EXTRA_PLACES, London UK
    expect(body.places.some((p: any) => p.slug === "london-on")).toBe(true); // ~9° away — different city
  });

  it("matches a hyphen-collapsed compact form: ?q=dehradun finds Dehra Dūn", () => {
    // GeoNames spells it "Dehra Dūn" → slug "dehra-dun-ut"; a squashed query
    // (no space/hyphen) must still hit it, the same way ?q=jerseycity should.
    const body = call("/api/places", { q: "dehradun" }).body as any;
    expect(body.places.some((p: any) => p.slug === "dehra-dun-ut")).toBe(true);
  });

  it("does NOT de-dupe twin cities straddling a border: ?q=kansas city keeps MO and KS", () => {
    // Both rows are generated (both populated) and sit within the 0.5° box —
    // but they are genuinely distinct cities, not one city listed twice.
    const body = call("/api/places", { q: "kansas city" }).body as any;
    expect(body.places.some((p: any) => p.slug === "kansas-city-mo")).toBe(true);
    expect(body.places.some((p: any) => p.slug === "kansas-city-ks")).toBe(true);
  });

  it("compact matching stops at the name: ?q=nut must not leak across the name/state slug boundary", () => {
    // Compacting the whole slug would glue name and state ("dehra-dun-ut" →
    // "dehradunut"), making ?q=nut a false hit. Only the NAME is compacted.
    const body = call("/api/places", { q: "nut", limit: "100" }).body as any;
    expect(body.places.some((p: any) => p.slug === "dehra-dun-ut")).toBe(false);
  });

  it("country filter generalizes beyond US/CA: ?country=IN restricts results to India", () => {
    const body = call("/api/places", { country: "IN", q: "a", limit: "50" }).body as any;
    expect(body.places.length).toBeGreaterThan(0);
    expect(body.places.every((p: any) => p.country === "IN")).toBe(true);
  });
});

describe("api /festivals", () => {
  it("returns the year's festivals for a place, sorted, with names", () => {
    const r = call("/api/festivals", { place: "calgary", year: "2026" });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.count).toBeGreaterThan(100);
    const diwali = body.festivals.find((f: any) => f.id === "diwali-lakshmi-puja");
    expect(diwali.date).toBe("2026-11-08");
    expect(diwali.name).toBe("Diwali / Lakshmi Puja");
    // sorted ascending by date
    const dates = body.festivals.map((f: any) => f.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("api /eclipses", () => {
  it("returns lunar and solar eclipses for the year", () => {
    const r = call("/api/eclipses", { place: "new-delhi", year: "2026" });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.lunar).toHaveLength(2);
    expect(body.solar).toHaveLength(2);
    expect(body.lunar[0].kind).toBe("total"); // 3 Mar 2026 total
  });
});

describe("api /calendar.ics", () => {
  const vevents = (ics: string) => (ics.match(/BEGIN:VEVENT/g) ?? []).length;

  it("returns a valid iCalendar document with text/calendar content-type", () => {
    const r = call("/api/calendar", { place: "calgary" });
    expect(r.status).toBe(200);
    expect(r.contentType).toMatch(/text\/calendar/);
    const ics = r.body as string;
    expect(typeof ics).toBe("string");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:HSNA Festivals — Calgary");
    expect(ics.includes("\r\n")).toBe(true); // CRLF line endings
  });

  it("contains Diwali as an all-day event on the correct date", () => {
    const ics = call("/api/calendar", { place: "calgary", year: "2026" }).body as string;
    expect(ics).toContain("SUMMARY:Diwali / Lakshmi Puja");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261108");
    expect(ics).toContain("UID:diwali-lakshmi-puja-2026-11-08@panchanga");
  });

  it("defaults to a rolling current+next year window", () => {
    const ics = call("/api/calendar", { place: "calgary" }).body as string; // NOW.year = 2026
    expect(ics).toMatch(/DTSTART;VALUE=DATE:2026/);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:2027/);
  });

  it("the `set` parameter scales coverage (core ⊂ major ⊂ all)", () => {
    const core = call("/api/calendar", { place: "calgary", year: "2026", set: "core" }).body as string;
    const major = call("/api/calendar", { place: "calgary", year: "2026", set: "major" }).body as string;
    const all = call("/api/calendar", { place: "calgary", year: "2026", set: "all" }).body as string;
    expect(vevents(core)).toBe(24); // the 24 §4 core festivals
    expect(vevents(major)).toBeGreaterThan(vevents(core));
    expect(vevents(all)).toBeGreaterThan(vevents(major));
  });

  it("400 for a bad place (error stays JSON, not ICS)", () => {
    const r = call("/api/calendar", { place: "atlantis" });
    expect(r.status).toBe(400);
    expect(r.contentType).toBeUndefined();
  });
});

describe("api validation", () => {
  it("usage at the root", () => {
    const r = call("/api");
    expect(r.status).toBe(200);
    expect((r.body as any).places).toContain("calgary");
  });

  it("400 when no location is given", () => {
    const r = call("/api/panchanga", { date: "2026-01-01" });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toMatch(/location/i);
  });

  it("400 for an unknown place", () => {
    expect(call("/api/festivals", { place: "atlantis" }).status).toBe(400);
  });

  it("400 for a malformed date and for a bad year", () => {
    expect(call("/api/panchanga", { place: "calgary", date: "11-08-2026" }).status).toBe(400);
    expect(call("/api/festivals", { place: "calgary", year: "abc" }).status).toBe(400);
  });

  it("400 when the engine rejects the coordinates (out of range)", () => {
    const r = call("/api/panchanga", { lat: "999", lng: "0", tz: "UTC", date: "2026-01-01" });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toMatch(/latitude/i);
  });

  it("404 for an unknown endpoint, with no caching", () => {
    const r = call("/api/nope");
    expect(r.status).toBe(404);
    expect(r.cacheSeconds).toBe(0);
  });
});
