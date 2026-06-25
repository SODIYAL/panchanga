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
