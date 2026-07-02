/**
 * test/api-kundali.test.ts — the /api/kundali endpoint. Like api.test.ts,
 * requires `npm run build` first (imports the bundled api-engine).
 */
import { describe, it, expect } from "vitest";
import { handle, type Query } from "../api/_lib.js";

const NOW = { today: "2026-06-25", year: 2026 };
const call = (q: Query = {}) => handle("/api/kundali", q, NOW);

describe("api /kundali", () => {
  it("returns a full chart for dob+tob+place", () => {
    const r = call({ dob: "2026-01-23", tob: "09:30", place: "new-delhi" });
    expect(r.status).toBe(200);
    const b = r.body as any;
    expect(b.input.timeUnknown).toBe(false);
    expect(b.kundali.lagna.rashiName).toBe("Kumbha"); // 09:30 IST New Delhi
    expect(b.kundali.lagna.window.enteredAt).toBeTruthy();
    expect(b.kundali.grahas).toHaveLength(9);
    expect(b.kundali.janma.janmaNakshatraName).toBe("Purva Bhadrapada");
    expect(b.kundali.dasha).toHaveLength(9);
    expect(b.kundali.dasha[0].lord).toBe("Jupiter");
    expect(b.kundali.node).toBe("mean");
    expect(b.kundali.ayanamsha).toBeGreaterThan(24);
    expect(r.cacheSeconds).toBe(31_536_000);
  });

  it("unknown birth time → Moon-chart mode with an explicit note", () => {
    const r = call({ dob: "2026-01-23", place: "new-delhi" });
    expect(r.status).toBe(200);
    const b = r.body as any;
    expect(b.input.timeUnknown).toBe(true);
    expect(b.kundali.timeUnknown).toBe(true);
    expect(b.kundali.lagna).toBeUndefined();
    expect(b.note).toContain("Moon-chart");
    expect(b.kundali.grahas.find((g: any) => g.graha === "Moon").bhava).toBe(1);
  });

  it("node=true switches the Rāhu model", () => {
    const mean = (call({ dob: "2026-01-23", tob: "09:30", place: "new-delhi" }).body as any)
      .kundali.grahas.find((g: any) => g.graha === "Rahu");
    const tru = (call({ dob: "2026-01-23", tob: "09:30", place: "new-delhi", node: "true" }).body as any)
      .kundali.grahas.find((g: any) => g.graha === "Rahu");
    expect(mean.longitude).not.toBeCloseTo(tru.longitude, 4);
  });

  it("validates inputs: bad dob / tob / node / polar latitude", () => {
    expect(call({ dob: "23-01-2026", place: "new-delhi" }).status).toBe(400);
    expect(call({ dob: "2026-01-23", tob: "9:30am", place: "new-delhi" }).status).toBe(400);
    expect(call({ dob: "2026-01-23", node: "osculating", place: "new-delhi" }).status).toBe(400);
    const polar = call({ dob: "2026-01-23", tob: "09:30", lat: "70", lng: "20", tz: "Europe/Oslo" });
    expect(polar.status).toBe(400);
    expect((polar.body as any).error).toContain("lagna");
  });
});

describe("api /guna-milan", () => {
  const base = {
    groomDob: "1996-08-15", groomTob: "09:15", groomPlace: "new-delhi",
    brideDob: "1998-12-03", brideTob: "19:50", bridePlace: "mumbai",
  };

  it("returns the full breakdown + manglik comparison when both times known", () => {
    const r = handle("/api/guna-milan", base, NOW);
    expect(r.status).toBe(200);
    const b = r.body as any;
    expect(b.gunaMilan.kootas).toHaveLength(8);
    expect(b.gunaMilan.total).toBeGreaterThanOrEqual(0);
    expect(b.gunaMilan.total).toBeLessThanOrEqual(36);
    expect(b.gunaMilan.disclaimer).toBeTruthy();
    expect(b.manglik).not.toBeNull();
    expect(b.manglik.groom.fromLagna).not.toBeNull();
    expect(b.warnings).toHaveLength(0);
  });

  it("unknown birth time → warning, no manglik lagna reference", () => {
    const { brideTob, ...rest } = base;
    const r = handle("/api/guna-milan", rest, NOW);
    expect(r.status).toBe(200);
    const b = r.body as any;
    expect(b.warnings.some((w: string) => w.includes("bride"))).toBe(true);
    expect(b.manglik).toBeNull(); // needs both lagnas
  });

  it("validates per-party inputs", () => {
    expect(handle("/api/guna-milan", { ...base, brideDob: "bad" }, NOW).status).toBe(400);
    const { groomPlace, ...noLoc } = base;
    expect(handle("/api/guna-milan", noLoc, NOW).status).toBe(400);
  });
});
