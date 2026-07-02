/**
 * src/kootas.ts — aṣṭakūṭa guṇa milan (the classical 36-point marriage
 * matching), computed from the two partners' janma facts (Moon positions
 * only — no lagna required).
 *
 * SCRIPTURE BASIS: the Muhūrta-Cintāmaṇi lineage of the aṣṭakūṭa system
 * (Varṇa 1 · Vaśya 2 · Tārā 3 · Yoni 4 · Graha-Maitrī 5 · Gaṇa 6 · Bhakūṭa 7
 * · Nāḍī 8 = 36). Where published sources differ on a table cell (a few gaṇa
 * and vaśya entries have regional variants), the DRIK-COMPATIBLE reading is
 * encoded and the variant is noted at the table — the plan's D3 policy.
 *
 * PROVENANCE: `gunaMilan` returns the per-kūṭa breakdown with a reason string
 * each, the doṣa flags (nāḍī / bhakūṭa) WITH their classical cancellation
 * (parihāra) checks, and never a bare score.
 */

import { RASHI_NAMES } from "./grahas.js";
import { NAKSHATRA_NAMES } from "./elements.js";

/**
 * The minimal Moon facts the scorer needs — `janmaFacts(...)` satisfies this
 * structurally; hand-built values work for table tests.
 */
export interface MilanParty {
  janmaNakshatra: number;
  janmaRashi: number;
  janmaPada: number;
  moon: { longitude: number };
}

// ───────────────────────────────────────────────────────────────────────────
// Classifications (by janma rāśi / nakṣatra)
// ───────────────────────────────────────────────────────────────────────────

/** Varṇa by rāśi: Brāhmaṇa (water), Kṣatriya (fire), Vaiśya (earth), Śūdra (air). */
const VARNA_BY_RASHI = [
  "Kshatriya", "Vaishya", "Shudra", "Brahmin", "Kshatriya", "Vaishya",
  "Shudra", "Brahmin", "Kshatriya", "Vaishya", "Shudra", "Brahmin",
] as const;
type Varna = (typeof VARNA_BY_RASHI)[number];
const VARNA_RANK: Record<Varna, number> = { Brahmin: 3, Kshatriya: 2, Vaishya: 1, Shudra: 0 };

/** Vaśya classes; Dhanu and Makara are split at 15° (Muhūrta-Cintāmaṇi). */
type Vashya = "Chatushpada" | "Manava" | "Jalachara" | "Vanachara" | "Keeta";
function vashyaOf(moonLongitude: number): Vashya {
  const rashi = Math.floor(moonLongitude / 30) % 12;
  const firstHalf = moonLongitude % 30 < 15;
  switch (rashi) {
    case 0: case 1: return "Chatushpada"; // Meṣa, Vṛṣabha
    case 2: case 5: case 6: case 10: return "Manava"; // Mithuna, Kanyā, Tulā, Kumbha
    case 3: case 11: return "Jalachara"; // Karka, Mīna
    case 4: return "Vanachara"; // Siṁha
    case 7: return "Keeta"; // Vṛścika
    case 8: return firstHalf ? "Manava" : "Chatushpada"; // Dhanu
    case 9: return firstHalf ? "Chatushpada" : "Jalachara"; // Makara
    default: throw new Error("unreachable");
  }
}

/** Vaśya score matrix [groom][bride] (Drik-compatible; some sources vary ±½). */
const VASHYA_ORDER: Vashya[] = ["Chatushpada", "Manava", "Jalachara", "Vanachara", "Keeta"];
const VASHYA_SCORE: number[][] = [
  //           Chat  Man  Jal  Van  Keet   (bride →)
  /* Chat */ [ 2,    1,   1,   0,   1 ],
  /* Man  */ [ 1,    2,   0.5, 0,   1 ],
  /* Jal  */ [ 1,    0.5, 2,   0,   1 ],
  /* Van  */ [ 0,    0,   0,   2,   0 ],
  /* Keet */ [ 1,    1,   1,   0,   2 ],
];

/** Yoni (14 animals) by nakṣatra index 0..26. */
const YONI_BY_NAKSHATRA = [
  "Ashwa", "Gaja", "Mesha", "Sarpa", "Sarpa", "Shwan", "Marjara", "Mesha",
  "Marjara", "Mushaka", "Mushaka", "Gau", "Mahisha", "Vyaghra", "Mahisha",
  "Vyaghra", "Mriga", "Mriga", "Shwan", "Vanara", "Nakula", "Vanara",
  "Simha", "Ashwa", "Simha", "Gau", "Gaja",
] as const;
type Yoni = (typeof YONI_BY_NAKSHATRA)[number];
const YONI_ORDER: Yoni[] = [
  "Ashwa", "Gaja", "Mesha", "Sarpa", "Shwan", "Marjara", "Mushaka",
  "Gau", "Mahisha", "Vyaghra", "Mriga", "Vanara", "Nakula", "Simha",
];
/**
 * Yoni compatibility, symmetric, diagonal 4; the seven sworn-enemy (ati-vaira)
 * pairs are 0: Aśva–Mahiṣa, Gaja–Siṁha, Meṣa–Vānara, Sarpa–Nakula,
 * Śvān–Mṛga, Mārjāra–Mūṣaka, Gau–Vyāghra.
 */
const YONI_SCORE: number[][] = [
  // Ash Gaj Mes Sar Shw Mar Mus Gau Mah Vya Mri Van Nak Sim
  [4, 2, 2, 3, 2, 2, 3, 3, 0, 1, 3, 3, 2, 1], // Ashwa
  [2, 4, 3, 2, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0], // Gaja
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1], // Mesha
  [3, 2, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2], // Sarpa
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1], // Shwan
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1], // Marjara
  [3, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2], // Mushaka
  [3, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1], // Gau
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1], // Mahisha
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1], // Vyaghra
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 2], // Mriga
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2], // Vanara
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2], // Nakula
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 2, 2, 2, 4], // Simha
];

/** Rāśi lords (BPHS). */
type Lord = "Sun" | "Moon" | "Mars" | "Mercury" | "Jupiter" | "Venus" | "Saturn";
const RASHI_LORD: Lord[] = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
/** BPHS natural (naisargika) relationships: F(riend) / N(eutral) / E(nemy). */
const MAITRI: Record<Lord, Record<Lord, "F" | "N" | "E">> = {
  Sun:     { Sun: "F", Moon: "F", Mars: "F", Mercury: "N", Jupiter: "F", Venus: "E", Saturn: "E" },
  Moon:    { Sun: "F", Moon: "F", Mars: "N", Mercury: "F", Jupiter: "N", Venus: "N", Saturn: "N" },
  Mars:    { Sun: "F", Moon: "F", Mars: "F", Mercury: "E", Jupiter: "F", Venus: "N", Saturn: "N" },
  Mercury: { Sun: "F", Moon: "E", Mars: "N", Mercury: "F", Jupiter: "N", Venus: "F", Saturn: "N" },
  Jupiter: { Sun: "F", Moon: "F", Mars: "F", Mercury: "E", Jupiter: "F", Venus: "E", Saturn: "N" },
  Venus:   { Sun: "E", Moon: "E", Mars: "N", Mercury: "F", Jupiter: "N", Venus: "F", Saturn: "F" },
  Saturn:  { Sun: "E", Moon: "E", Mars: "E", Mercury: "F", Jupiter: "N", Venus: "F", Saturn: "F" },
};

/** Gaṇa by nakṣatra. */
type Gana = "Deva" | "Manushya" | "Rakshasa";
const GANA_BY_NAKSHATRA: Gana[] = [
  "Deva", "Manushya", "Rakshasa", "Manushya", "Deva", "Manushya", "Deva",
  "Deva", "Rakshasa", "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa",
  "Deva", "Rakshasa", "Deva", "Rakshasa", "Rakshasa", "Manushya", "Manushya",
  "Deva", "Rakshasa", "Rakshasa", "Manushya", "Manushya", "Deva",
];
/**
 * Gaṇa score [groom][bride]. CONFORMANCE: Deva-groom × Rākṣasa-bride = 0 is
 * pinned by Drik's own output (2000-01-14 22:20 × 2000-01-23 03:10 New Delhi,
 * Aśvinī×Maghā → Gana 0; test/drik-guna-milan.test.ts). Remaining
 * cross-gaṇa cells follow the same source's published table and are pinned
 * as further fixtures land.
 */
const GANA_ORDER: Gana[] = ["Deva", "Manushya", "Rakshasa"];
const GANA_SCORE: number[][] = [
  //          Deva  Man  Rak   (bride →)
  /* Deva */ [ 6,    6,   0 ],
  /* Man  */ [ 5,    6,   0 ],
  /* Rak  */ [ 1,    0,   6 ],
];

/** Nāḍī by nakṣatra: Ādi / Madhya / Antya. */
type Nadi = "Adi" | "Madhya" | "Antya";
const NADI_BY_NAKSHATRA: Nadi[] = [
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya",
  "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya", "Antya",
  "Madhya", "Adi", "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya",
];

/** Tārā: inauspicious counts (mod 9; 0 ≡ 9): 3 Vipat, 5 Pratyari, 7 Vadha. */
const TARA_MALEFIC = new Set([3, 5, 7]);
const taraCount = (from: number, to: number): number => {
  const c = (((to - from + 27) % 27) + 1) % 9;
  return c === 0 ? 9 : c;
};

// ───────────────────────────────────────────────────────────────────────────
// The scorer
// ───────────────────────────────────────────────────────────────────────────

export interface KootaScore {
  koota: string;
  max: number;
  scored: number;
  /** Human-readable basis (the provenance line). */
  reason: string;
}

export interface GunaMilanResult {
  total: number;
  maxTotal: 36;
  kootas: KootaScore[];
  /** Doṣa flags with their classical parihāra (cancellation) evaluation. */
  doshas: {
    nadi: { present: boolean; cancelled: boolean; note: string } | null;
    bhakoota: { present: boolean; cancelled: boolean; note: string } | null;
  };
  groom: { nakshatra: string; pada: number; rashi: string };
  bride: { nakshatra: string; pada: number; rashi: string };
  disclaimer: string;
}

/**
 * Aṣṭakūṭa guṇa milan. `groom`/`bride` are `janmaFacts(...)` records — the
 * kūṭas are Moon-only, so an unknown birth time (noon-computed facts) is
 * acceptable AWAY from the Moon's sign/nakṣatra transition days; callers
 * should surface `moon.nakshatraMarginArcmin` when it is small.
 */
export function gunaMilan(groom: MilanParty, bride: MilanParty): GunaMilanResult {
  const kootas: KootaScore[] = [];
  const gNak = groom.janmaNakshatra;
  const bNak = bride.janmaNakshatra;
  const gRashi = groom.janmaRashi;
  const bRashi = bride.janmaRashi;

  // 1. Varṇa — groom's varṇa must not be lower than the bride's.
  const gV = VARNA_BY_RASHI[gRashi];
  const bV = VARNA_BY_RASHI[bRashi];
  const varna = VARNA_RANK[gV] >= VARNA_RANK[bV] ? 1 : 0;
  kootas.push({ koota: "Varna", max: 1, scored: varna, reason: `groom ${gV} vs bride ${bV}` });

  // 2. Vaśya.
  const gVash = vashyaOf(groom.moon.longitude);
  const bVash = vashyaOf(bride.moon.longitude);
  const vashya = VASHYA_SCORE[VASHYA_ORDER.indexOf(gVash)][VASHYA_ORDER.indexOf(bVash)];
  kootas.push({ koota: "Vashya", max: 2, scored: vashya, reason: `groom ${gVash} × bride ${bVash}` });

  // 3. Tārā — both directions, 1.5 per auspicious count.
  const t1 = taraCount(bNak, gNak); // bride → groom
  const t2 = taraCount(gNak, bNak); // groom → bride
  const tara = (TARA_MALEFIC.has(t1) ? 0 : 1.5) + (TARA_MALEFIC.has(t2) ? 0 : 1.5);
  kootas.push({
    koota: "Tara", max: 3, scored: tara,
    reason: `counts ${t1} (bride→groom) & ${t2} (groom→bride); 3/5/7 are inauspicious`,
  });

  // 4. Yoni.
  const gY = YONI_BY_NAKSHATRA[gNak];
  const bY = YONI_BY_NAKSHATRA[bNak];
  const yoni = YONI_SCORE[YONI_ORDER.indexOf(gY)][YONI_ORDER.indexOf(bY)];
  kootas.push({ koota: "Yoni", max: 4, scored: yoni, reason: `groom ${gY} × bride ${bY}` });

  // 5. Graha-Maitrī — mutual relation of the two rāśi lords.
  const gL = RASHI_LORD[gRashi];
  const bL = RASHI_LORD[bRashi];
  const r1 = MAITRI[gL][bL];
  const r2 = MAITRI[bL][gL];
  const maitri =
    gL === bL || (r1 === "F" && r2 === "F") ? 5
    : (r1 === "F" && r2 === "N") || (r1 === "N" && r2 === "F") ? 4
    : r1 === "N" && r2 === "N" ? 3
    : (r1 === "F" && r2 === "E") || (r1 === "E" && r2 === "F") ? 1
    : (r1 === "N" && r2 === "E") || (r1 === "E" && r2 === "N") ? 0.5
    : 0; // both enemies
  kootas.push({
    koota: "Graha Maitri", max: 5, scored: maitri,
    reason: `lords ${gL} & ${bL}: ${r1}/${r2} (F friend, N neutral, E enemy)`,
  });

  // 6. Gaṇa.
  const gG = GANA_BY_NAKSHATRA[gNak];
  const bG = GANA_BY_NAKSHATRA[bNak];
  const gana = GANA_SCORE[GANA_ORDER.indexOf(gG)][GANA_ORDER.indexOf(bG)];
  kootas.push({ koota: "Gana", max: 6, scored: gana, reason: `groom ${gG} × bride ${bG}` });

  // 7. Bhakūṭa — mutual rāśi distances; 6-8, 2-12 and 5-9 are doṣa (0).
  const d1 = ((bRashi - gRashi + 12) % 12) + 1;
  const d2 = ((gRashi - bRashi + 12) % 12) + 1;
  const bhakootaDosha = (d1 === 6 || d1 === 8) || (d1 === 2 || d1 === 12) || (d1 === 5 || d1 === 9);
  const bhakoota = bhakootaDosha ? 0 : 7;
  kootas.push({
    koota: "Bhakoota", max: 7, scored: bhakoota,
    reason: `rāśi distances ${d1}/${d2} (${RASHI_NAMES[gRashi]} ↔ ${RASHI_NAMES[bRashi]})`,
  });
  // Bhakūṭa parihāra: same lord, or mutually friendly lords.
  const bhakootaCancelled =
    bhakootaDosha && (gL === bL || (MAITRI[gL][bL] === "F" && MAITRI[bL][gL] === "F"));

  // 8. Nāḍī — different nāḍī scores 8; same nāḍī is the gravest doṣa.
  const gN = NADI_BY_NAKSHATRA[gNak];
  const bN = NADI_BY_NAKSHATRA[bNak];
  const nadiDosha = gN === bN;
  const nadi = nadiDosha ? 0 : 8;
  kootas.push({ koota: "Nadi", max: 8, scored: nadi, reason: `groom ${gN} vs bride ${bN}` });
  // Nāḍī parihāra (classical): same nakṣatra but different pada; same rāśi
  // with different nakṣatras; same nakṣatra in different rāśis.
  const nadiCancelled =
    nadiDosha &&
    ((gNak === bNak && groom.janmaPada !== bride.janmaPada) ||
      (gRashi === bRashi && gNak !== bNak) ||
      (gNak === bNak && gRashi !== bRashi));

  const total = kootas.reduce((s, k) => s + k.scored, 0);
  return {
    total,
    maxTotal: 36,
    kootas,
    doshas: {
      nadi: nadiDosha
        ? {
            present: true,
            cancelled: nadiCancelled,
            note: nadiCancelled
              ? "nāḍī doṣa present but cancelled by a classical parihāra (same-nakṣatra/pada or same-rāśi exception)"
              : "nāḍī doṣa (same nāḍī): the gravest aṣṭakūṭa doṣa; no parihāra applies here",
          }
        : null,
      bhakoota: bhakootaDosha
        ? {
            present: true,
            cancelled: bhakootaCancelled,
            note: bhakootaCancelled
              ? "bhakūṭa doṣa present but cancelled: the rāśi lords are the same / mutual friends"
              : `bhakūṭa doṣa (${d1}/${d2})`,
          }
        : null,
    },
    groom: { nakshatra: NAKSHATRA_NAMES[gNak], pada: groom.janmaPada, rashi: RASHI_NAMES[gRashi] },
    bride: { nakshatra: NAKSHATRA_NAMES[bNak], pada: bride.janmaPada, rashi: RASHI_NAMES[bRashi] },
    disclaimer:
      "Computed per the classical aṣṭakūṭa rules (Muhūrta-Cintāmaṇi lineage). " +
      "A guṇa total is one classical input among many, not a verdict on a match; " +
      "consult your family's ācārya/jyotiṣī before any decision.",
  };
}
