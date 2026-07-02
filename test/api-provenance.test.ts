/**
 * test/api-provenance.test.ts — the API's provenance surface and the
 * sampradāya profile parameter.
 *
 * Every festival the API emits explains itself: a one-line `basis` digest of
 * the deciding rule by default, plus `detail=full` for the raw observance,
 * key instants, and per-rule notes. `sampradaya=vaishnava` switches the
 * Ekādaśī convention (aruṇodaya daśamī-vedha / Gauṇa shift) in both the JSON
 * and the .ics feed. Like api.test.ts, requires `npm run build` first.
 */
import { describe, it, expect } from "vitest";
import { handle, type Query } from "../api/_lib.js";

const NOW = { today: "2026-06-25", year: 2026 };
const call = (route: string, query: Query = {}) => handle(route, query, NOW);

describe("api /festivals provenance", () => {
  it("every festival carries a basis and sampradaya by default (no instants)", () => {
    const r = call("/api/festivals", { place: "new-delhi", year: "2026" });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.sampradaya).toBe("smarta");
    expect(body.festivals.length).toBeGreaterThan(100);
    for (const f of body.festivals) {
      expect(f.basis, `${f.id} missing basis`).toBeTruthy();
      expect(f.sampradaya).toBe("smarta");
      expect(f.instants).toBeUndefined();
    }
    const holi = body.festivals.find((f: any) => f.id === "holika-dahan");
    expect(holi.basis).toContain("purnima");
    expect(holi.basis).toContain("pradosha");
    expect(holi.basis).toContain("Bhadra");
  });

  it("detail=full adds instants, the raw rule, and notes", () => {
    const r = call("/api/festivals", { place: "new-delhi", year: "2026", detail: "full" });
    const body = r.body as any;
    const ekadashi = body.festivals.find((f: any) => f.id === "ekadashi-ashadha-krishna");
    expect(ekadashi.instants.tithiStart).toBeTruthy();
    expect(ekadashi.instants.tithiEnd).toBeTruthy();
    expect(ekadashi.rule.kind).toBe("tithi-pervades");
    expect(Array.isArray(ekadashi.notes)).toBe(true);
    const sankranti = body.festivals.find((f: any) => f.id === "makar-sankranti");
    expect(sankranti.instants.ingress).toBeTruthy();
    expect(sankranti.basis).toContain("Makara");
  });

  it("sampradaya=vaishnava switches the Ekādaśī convention (Yogini Jul 10 → 11)", () => {
    const smarta = call("/api/festivals", { place: "new-delhi", year: "2026" }).body as any;
    const vaish = call("/api/festivals", {
      place: "new-delhi",
      year: "2026",
      sampradaya: "vaishnava",
    }).body as any;
    expect(vaish.sampradaya).toBe("vaishnava");
    const pick = (b: any, id: string) => b.festivals.find((f: any) => f.id === id);
    expect(pick(smarta, "ekadashi-ashadha-krishna").date).toBe("2026-07-10");
    expect(pick(vaish, "ekadashi-ashadha-krishna").date).toBe("2026-07-11");
    expect(pick(vaish, "ekadashi-ashadha-krishna").name).toContain("Vaishnava");
    expect(pick(vaish, "ekadashi-ashadha-krishna").sampradaya).toBe("vaishnava");
    expect(pick(vaish, "ekadashi-ashadha-krishna").basis).toContain("vedha");
    // Non-Ekādaśī rules are unaffected by the profile.
    expect(pick(vaish, "holika-dahan").date).toBe(pick(smarta, "holika-dahan").date);
    expect(pick(vaish, "holika-dahan").sampradaya).toBe("smarta");
  });

  it("rejects an unknown sampradaya", () => {
    const r = call("/api/festivals", { place: "new-delhi", sampradaya: "iskcon" });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toContain("sampradaya");
  });
});

describe("api /calendar.ics provenance", () => {
  it("VEVENTs carry a DESCRIPTION with the basis, local tithi times, and disclaimer", () => {
    const r = call("/api/calendar", { place: "new-delhi", year: "2026", set: "core" });
    expect(r.status).toBe(200);
    const ics = r.body as string;
    expect(ics).toContain("DESCRIPTION:");
    // Unfold RFC 5545 continuation lines before inspecting content.
    const unfolded = ics.replace(/\r\n[ \t]/g, "");
    const events = unfolded.split("BEGIN:VEVENT").slice(1);
    expect(events.length).toBeGreaterThan(20);
    for (const e of events) {
      expect(e).toContain("DESCRIPTION:");
      expect(e).toContain("verify with your local authority");
    }
    const diwali = events.find((e) => e.includes("SUMMARY:Diwali"));
    expect(diwali).toBeTruthy();
    expect(diwali!).toContain("Tithi:");
  });

  it("sampradaya=vaishnava flows through to the all-set feed", () => {
    const r = call("/api/calendar", {
      place: "new-delhi",
      year: "2026",
      set: "all",
      sampradaya: "vaishnava",
    });
    const unfolded = (r.body as string).replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain("SUMMARY:Vaishnava Yogini Ekadashi");
    expect(unfolded).toContain("UID:ekadashi-ashadha-krishna-2026-07-11@panchanga");
  });
});
