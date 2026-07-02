/**
 * src/doshas.ts — chart-level doṣa evaluations: Mangal (Kuja) doṣa and the
 * Kāla-sarpa flag.
 *
 * MANGAL DOṢA — Mars in bhāva 1, 2, 4, 7, 8 or 12, evaluated whole-sign from
 * THREE reference points (lagna, Moon, Venus), each reported separately —
 * the classical practice checks all three, and hiding the reference point is
 * how calculators mislead. The 2nd house is the South-Indian addition; it is
 * INCLUDED here (Drik-compatible) and identifiable in the output since the
 * house number is reported. Classical mitigations reported (not silently
 * applied): Mars in own sign (Meṣa/Vṛścika) or exaltation (Makara).
 *
 * KĀLA-SARPA — all seven bodies within one half of the Rāhu→Ketu axis.
 * Informational flag only.
 */

import type { KundaliGraha } from "./kundali.js";

const MANGAL_HOUSES = new Set([1, 2, 4, 7, 8, 12]);

export interface MangalDosha {
  /** Present from ANY reference point (the common aggregation). */
  present: boolean;
  /** Per-reference evaluation: house Mars occupies counted from each. */
  fromLagna: { house: number; dosha: boolean } | null;
  fromMoon: { house: number; dosha: boolean };
  fromVenus: { house: number; dosha: boolean };
  /** Classical mitigating placements, reported for the jyotiṣī to weigh. */
  mitigations: string[];
}

/**
 * Mangal doṣa from a chart's grahas. `lagnaRashi` is null in Moon-chart mode
 * (unknown birth time) — the lagna reference is then omitted, not faked.
 */
export function mangalDosha(grahas: KundaliGraha[], lagnaRashi: number | null): MangalDosha {
  const mars = grahas.find((g) => g.graha === "Mars")!;
  const moon = grahas.find((g) => g.graha === "Moon")!;
  const venus = grahas.find((g) => g.graha === "Venus")!;
  const houseFrom = (refRashi: number) => ((mars.rashi - refRashi + 12) % 12) + 1;

  const fromLagna = lagnaRashi === null ? null : (() => {
    const house = houseFrom(lagnaRashi);
    return { house, dosha: MANGAL_HOUSES.has(house) };
  })();
  const fromMoon = { house: houseFrom(moon.rashi), dosha: MANGAL_HOUSES.has(houseFrom(moon.rashi)) };
  const fromVenus = { house: houseFrom(venus.rashi), dosha: MANGAL_HOUSES.has(houseFrom(venus.rashi)) };

  const mitigations: string[] = [];
  if (mars.rashi === 0 || mars.rashi === 7) mitigations.push("Mars is in its own sign (svakṣetra)");
  if (mars.rashi === 9) mitigations.push("Mars is exalted (Makara)");

  return {
    present: (fromLagna?.dosha ?? false) || fromMoon.dosha || fromVenus.dosha,
    fromLagna,
    fromMoon,
    fromVenus,
    mitigations,
  };
}

export interface KalaSarpa {
  present: boolean;
  note: string;
}

/** Kāla-sarpa: the seven bodies all on one side of the Rāhu→Ketu axis. */
export function kalaSarpa(grahas: KundaliGraha[]): KalaSarpa {
  const rahu = grahas.find((g) => g.graha === "Rahu")!.longitude;
  const bodies = grahas.filter((g) => g.graha !== "Rahu" && g.graha !== "Ketu");
  // Arc from Rāhu forward to Ketu is [0°, 180°) in Rāhu-relative longitude.
  const rel = bodies.map((g) => (g.longitude - rahu + 360) % 360);
  const allFirstHalf = rel.every((r) => r < 180);
  const allSecondHalf = rel.every((r) => r >= 180);
  const present = allFirstHalf || allSecondHalf;
  return {
    present,
    note: present
      ? "all seven grahas lie on one side of the Rāhu–Ketu axis (informational; traditions differ on its weight)"
      : "grahas occupy both sides of the Rāhu–Ketu axis",
  };
}
