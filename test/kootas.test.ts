/**
 * test/kootas.test.ts — aṣṭakūṭa guṇa milan tables & scorer, Mangal doṣa,
 * Kāla-sarpa. Table-integrity properties + classical known-value checks.
 */
import { describe, it, expect } from "vitest";
import { gunaMilan, type MilanParty } from "../src/kootas.js";
import { janmaFacts } from "../src/grahas.js";
import { kundali } from "../src/kundali.js";
import { mangalDosha, kalaSarpa } from "../src/doshas.js";
import type { GeoLocation } from "../src/types.js";

const DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };

/** Build a party from nakṣatra+pada (rāśi & longitude derived consistently). */
function party(nakshatra: number, pada: number): MilanParty {
  const lon = nakshatra * (360 / 27) + (pada - 0.5) * (360 / 108);
  return { janmaNakshatra: nakshatra, janmaRashi: Math.floor(lon / 30) % 12, janmaPada: pada, moon: { longitude: lon } };
}

describe("aṣṭakūṭa scorer — classical known values", () => {
  it("identical janma nakṣatra & pada scores 28 (everything but nāḍī)", () => {
    // The classical result: a same-nakṣatra pair scores 1+2+3+4+5+6+7 = 28
    // with nāḍī doṣa (0/8), NOT cancelled when the pada is also identical.
    const p = party(3, 2); // Rohiṇī 2
    const r = gunaMilan(p, { ...p });
    expect(r.total).toBe(28);
    expect(r.doshas.nadi?.present).toBe(true);
    expect(r.doshas.nadi?.cancelled).toBe(false);
  });

  it("same nakṣatra, different pada → nāḍī doṣa cancelled by parihāra", () => {
    const r = gunaMilan(party(3, 1), party(3, 3));
    expect(r.doshas.nadi?.present).toBe(true);
    expect(r.doshas.nadi?.cancelled).toBe(true);
  });

  it("tārā: 3/5/7 counts score 0 per direction", () => {
    // Groom Aśvinī (0), bride Kṛttikā (2): bride→groom count = 26→27? use
    // arithmetic: count(from 2 to 0) = ((0−2+27)%27)+1 = 26 → mod 9 = 8 ✓ benefic;
    // count(from 0 to 2) = 3 → Vipat, malefic. Tārā = 1.5.
    const r = gunaMilan(party(2, 1), party(0, 1));
    expect(r.kootas.find((k) => k.koota === "Tara")!.scored).toBe(1.5);
  });

  it("yoni: sworn-enemy pair scores 0 (Gau–Vyāghra), same yoni 4", () => {
    // Uttara Phalguni (Gau) groom × Chitrā (Vyāghra) bride.
    const enemy = gunaMilan(party(11, 1), party(13, 1));
    expect(enemy.kootas.find((k) => k.koota === "Yoni")!.scored).toBe(0);
    const same = gunaMilan(party(0, 1), party(23, 1)); // Aśvinī & Śatabhiṣā, both Aśva
    expect(same.kootas.find((k) => k.koota === "Yoni")!.scored).toBe(4);
  });

  it("graha-maitrī: Karka×Siṁha lords (Moon,Sun mutual friends) = 5; Meṣa×Kanyā (Mars,Mercury E/N) = 0.5", () => {
    // Punarvasu 4 → Karka; Maghā 1 → Siṁha.
    const friends = gunaMilan(party(6, 4), party(9, 1));
    expect(friends.kootas.find((k) => k.koota === "Graha Maitri")!.scored).toBe(5);
    // Aśvinī 1 → Meṣa (Mars); Hasta 1 → Kanyā (Mercury): Mars→Merc E, Merc→Mars N → 0.5.
    const strained = gunaMilan(party(0, 1), party(12, 1));
    expect(strained.kootas.find((k) => k.koota === "Graha Maitri")!.scored).toBe(0.5);
  });

  it("bhakūṭa: 6-8 rāśi distance is doṣa (0); parihāra when lords are friends", () => {
    // Meṣa (Aśvinī) × Kanyā (Hasta): distances 6/8, lords Mars/Mercury not mutual friends.
    const dosha = gunaMilan(party(0, 1), party(12, 1));
    expect(dosha.kootas.find((k) => k.koota === "Bhakoota")!.scored).toBe(0);
    expect(dosha.doshas.bhakoota?.present).toBe(true);
    expect(dosha.doshas.bhakoota?.cancelled).toBe(false);
    // Karka (Puṣya) × Dhanu (Mūla): distances 6/8, lords Moon/Jupiter —
    // Moon→Jup N, so not mutual friends either; use Meṣa×Vṛścika same-lord:
    // distances 8/6, lords both Mars → cancelled.
    const cancelled = gunaMilan(party(0, 1), party(16, 4)); // Aśvinī(Meṣa) × Anurādhā p4? → Vṛścika
    expect(cancelled.groom.rashi).toBe("Mesha");
    expect(cancelled.bride.rashi).toBe("Vrishchika");
    expect(cancelled.doshas.bhakoota?.present).toBe(true);
    expect(cancelled.doshas.bhakoota?.cancelled).toBe(true);
  });

  it("varṇa is directional: Brahmin bride with Kshatriya groom loses the point", () => {
    // Groom Meṣa (Kshatriya), bride Karka (Brahmin) → 0.
    const r = gunaMilan(party(0, 1), party(7, 1));
    expect(r.kootas.find((k) => k.koota === "Varna")!.scored).toBe(0);
    // Reversed → 1.
    const r2 = gunaMilan(party(7, 1), party(0, 1));
    expect(r2.kootas.find((k) => k.koota === "Varna")!.scored).toBe(1);
  });

  it("total is bounded and the breakdown always sums to it", () => {
    for (let g = 0; g < 27; g += 3) {
      for (let b = 0; b < 27; b += 3) {
        const r = gunaMilan(party(g, ((g + b) % 4) + 1), party(b, ((g * b) % 4) + 1));
        expect(r.total).toBeGreaterThanOrEqual(0);
        expect(r.total).toBeLessThanOrEqual(36);
        expect(r.kootas.reduce((s, k) => s + k.scored, 0)).toBeCloseTo(r.total, 9);
        expect(r.kootas).toHaveLength(8);
      }
    }
  });

  it("works on real janmaFacts end-to-end", () => {
    const g = janmaFacts(new Date("1996-08-15T03:45:00Z"), DELHI);
    const b = janmaFacts(new Date("1998-12-03T14:20:00Z"), DELHI);
    const r = gunaMilan(g, b);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(36);
    expect(r.groom.nakshatra).toBe(g.janmaNakshatraName);
    expect(r.disclaimer).toContain("ācārya");
  });
});

describe("doṣas", () => {
  const k = kundali(new Date("2026-01-23T04:00:00Z"), DELHI);

  it("mangal doṣa reports all three reference points with house numbers", () => {
    const m = mangalDosha(k.grahas, k.lagna.rashi);
    expect(m.fromLagna).not.toBeNull();
    for (const ref of [m.fromLagna!, m.fromMoon, m.fromVenus]) {
      expect(ref.house).toBeGreaterThanOrEqual(1);
      expect(ref.house).toBeLessThanOrEqual(12);
      expect(ref.dosha).toBe([1, 2, 4, 7, 8, 12].includes(ref.house));
    }
    expect(m.present).toBe(
      (m.fromLagna!.dosha) || m.fromMoon.dosha || m.fromVenus.dosha,
    );
  });

  it("moon-chart mode omits the lagna reference instead of faking it", () => {
    const m = mangalDosha(k.grahas, null);
    expect(m.fromLagna).toBeNull();
  });

  it("kāla-sarpa flag is consistent with the actual longitudes", () => {
    const ks = kalaSarpa(k.grahas);
    const rahu = k.grahas.find((g) => g.graha === "Rahu")!.longitude;
    const rel = k.grahas
      .filter((g) => g.graha !== "Rahu" && g.graha !== "Ketu")
      .map((g) => (g.longitude - rahu + 360) % 360);
    const expected = rel.every((r) => r < 180) || rel.every((r) => r >= 180);
    expect(ks.present).toBe(expected);
  });
});
