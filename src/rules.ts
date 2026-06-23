/**
 * src/rules.ts — per-festival rule DATA.
 *
 * This module encodes the HSNA v1 festival rule set as `FestivalRule[]`
 * instances, following the grammar declared in `src/types.ts` and sourced
 * verbatim from the verified spec:
 *   `docs/superpowers/plans/2026-06-23-festivals-decisions-and-spec.md`
 *   §4 "Verified v1 festival spec" (24 core festivals)
 *   §4b "Extended set" (Ekadashi / Sankashti Chaturthi / Chhath Puja)
 *
 * CALENDRICAL ONLY — no HSNA editorial copy (deity/significance/links live
 * in web/ later). `meta.note` is used only to flag mapping imperfections.
 *
 * AUTHORITIES:
 *  • Sampradāya: Smārta (Drik Panchang default)
 *  • Month system: Pūrṇimānta (primary)
 *  • Month-name spellings match LUNAR_MONTH_NAMES in elements.ts exactly.
 */

import type { FestivalRule } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// §4 — CORE RULES (24 festivals, calendar order)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 24 individually named festivals from §4 of the spec. Ordered by 2026
 * date (calendar year order, Jan–Dec).
 *
 * Month-name spellings must match the strings in `LUNAR_MONTH_NAMES`
 * (elements.ts) exactly, since the evaluator normalizes and compares them:
 *   Chaitra · Vaishakha · Jyeshtha · Ashadha · Shravana · Bhadrapada ·
 *   Ashwina · Kartika · Margashirsha · Pausha · Magha · Phalguna
 */
export const CORE_RULES: FestivalRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Makar Sankranti — solar-ingress, rashi 9 (Makara = Capricorn, 270°)
  //    Spec: puṇya-kāla = 40 ghaṭis from ingress moment.
  //    Note: rashi 9 is Makara (0=Mesha, 9=Makara) per elements.ts solarIngress.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "makar-sankranti",
    displayName: "Makar Sankranti",
    month: { purnimanta: "Pausha" },
    category: "solar",
    observance: {
      kind: "solar-ingress",
      rashi: 9,
      punyaKala: "after-moment-to-sunset",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Vasant Panchami — Magha Shukla 5, pūrvāhna (forenoon)
  //    Spec: Panchami pervading forenoon (sunrise→midday).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vasant-panchami",
    displayName: "Vasant Panchami",
    month: { purnimanta: "Magha" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 5,
      window: "purvahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Maha Shivratri — Phalguna Krishna 14, niśīta (midnight window)
  //    Spec: Chaturdashi pervading niśīta.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "maha-shivratri",
    displayName: "Maha Shivratri",
    month: { purnimanta: "Phalguna" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "krishna",
      tithi: 14,
      window: "nishita",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Holika Dahan — Phalguna Shukla Pūrṇimā, pradoṣa, Bhadra-free
  //    Spec: Purnima in pradoṣa AND Bhadra-free (vishti karana exclusion).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "holika-dahan",
    displayName: "Holika Dahan",
    month: { purnimanta: "Phalguna" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: "purnima",
      window: "pradosha",
      precedence: "max-window-fraction",
      avoidKarana: "vishti",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Holi (Dhulandi) — derived +1 day from Holika Dahan
  //    Spec: Chaitra Krishna 1 at sunrise (derived from Holika +1).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "holi",
    displayName: "Holi (Dhulandi)",
    month: { purnimanta: "Chaitra" },
    category: "derived",
    observance: {
      kind: "derived",
      from: "holika-dahan",
      offsetDays: 1,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Rama Navami — Chaitra Shukla 9, madhyāhna
  //    Spec: Navami pervading madhyāhna (Rama's birth).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "rama-navami",
    displayName: "Rama Navami",
    month: { purnimanta: "Chaitra" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 9,
      window: "madhyahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Hanuman Jayanti — Chaitra Shukla Pūrṇimā, sunrise
  //    Spec: Purnima at sunrise (purnima-vyāpti).
  //    PRECEDENCE: udaya. A sunrise-anchored vyāpti festival is observed on the
  //    day whose tithi is PRESENT AT SUNRISE (udaya-tithi), not the day with the
  //    larger window-fraction. In 2026 Pūrṇimā spans both Apr 1 and Apr 2
  //    sunrises with a *larger* fraction on Apr 1, yet Drik picks Apr 2 because
  //    Pūrṇimā prevails at Apr 2 sunrise — exactly the udaya rule.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "hanuman-jayanti",
    displayName: "Hanuman Jayanti",
    month: { purnimanta: "Chaitra" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: "purnima",
      window: "sunrise",
      precedence: "udaya",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Mesha Sankranti / Baisakhi — solar-ingress rashi 0 (Mesha = Aries)
  //    Spec: optional; sidereal Sun → Mesha (0°); solar new year.
  //    Marked extended:true per task brief ("optional").
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "mesha-sankranti",
    displayName: "Mesha Sankranti / Baisakhi",
    month: { purnimanta: "Chaitra" },
    category: "solar",
    extended: true,
    observance: {
      kind: "solar-ingress",
      rashi: 0,
      punyaKala: "after-moment-to-sunset",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Akshaya Tritiya — Vaishakha Shukla 3, pūrvāhna
  //    Spec: Tritiya pervading forenoon; Rohini+Wed auspicious but not required.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "akshaya-tritiya",
    displayName: "Akshaya Tritiya",
    month: { purnimanta: "Vaishakha" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 3,
      window: "purvahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Guru Purnima — Ashadha Shukla Pūrṇimā, sunrise
  //     Spec: Purnima-vyāpti.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "guru-purnima",
    displayName: "Guru Purnima",
    month: { purnimanta: "Ashadha" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: "purnima",
      window: "sunrise",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Raksha Bandhan — Shravana Shukla Pūrṇimā, aparāhna, Bhadra-free
  //     Spec: tie thread in aparāhna, Bhadra-free.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "raksha-bandhan",
    displayName: "Raksha Bandhan",
    month: { purnimanta: "Shravana" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: "purnima",
      window: "aparahna",
      precedence: "max-window-fraction",
      avoidKarana: "vishti",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Krishna Janmashtami — Bhadrapada Krishna 8, niśīta
  //     Spec: Smārta: Ashtami at niśīta + Rohini preference (preferred, not required);
  //     Saptami-viddha OK (so no required filter).
  //     sampradaya:"smarta" explicit per spec.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "krishna-janmashtami",
    displayName: "Krishna Janmashtami",
    month: { purnimanta: "Bhadrapada" },
    category: "lunar-tithi",
    sampradaya: "smarta",
    observance: {
      kind: "tithi-pervades",
      paksha: "krishna",
      tithi: 8,
      window: "nishita",
      precedence: "max-window-fraction",
      nakshatra: { name: "Rohini", window: "nishita", mode: "preferred" },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Ganesh Chaturthi — Bhadrapada Shukla 4, madhyāhna
  //     Spec: Chaturthi pervading madhyāhna.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ganesh-chaturthi",
    displayName: "Ganesh Chaturthi",
    month: { purnimanta: "Bhadrapada" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 4,
      window: "madhyahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Navratri / Ghatasthapana (Sharadiya) — Ashwina Shukla 1, pūrvāhna
  //     Spec: Pratipadā in first ⅓ of day.
  //     Note: The spec also mentions nakshatra/yoga prohibitions (Chitra, Vaidhrti)
  //     as flags for 2026, but this is editorial/diagnostic, not a rule constraint
  //     in the grammar; not encoding here (Phase 4).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "sharadiya-navratri",
    displayName: "Navratri / Ghatasthapana",
    month: { purnimanta: "Ashwina" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 1,
      window: "purvahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 15. Durga Ashtami — Ashwina Shukla 8, sunrise
  //     Spec: Ashtami at sunrise.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "durga-ashtami",
    displayName: "Durga Ashtami",
    month: { purnimanta: "Ashwina" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 8,
      window: "sunrise",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 16. Maha Navami — Ashwina Shukla 9, sunrise
  //     Spec: Navami-vyāpti → PRECEDENCE: udaya (present-at-sunrise), matching
  //     the sister sunrise rules (Durga Ashtami, Hanuman Jayanti).
  //     KNOWN EXPECTED-DIFF (2026): Drik publishes Maha Navami on Oct 19, the
  //     SAME civil day as Maha Ashtami, with Sandhi Pūjā 10:27–11:15 IST. In
  //     2026 Navami runs Oct 19 10:52 → Oct 20 12:51 IST, so it prevails at the
  //     Oct 20 sunrise, NOT Oct 19's (Oct 19 sunrise carries Ashtami). Pure
  //     udaya-tithi therefore yields Oct 20. Drik's Oct 19 comes from the
  //     Durga-Pūjā Sandhi / Navami-conjoined-with-Ashtami convention (Navami
  //     observed on the Ashtami-udaya day when the Sandhi junction falls that
  //     morning) — a Durga-Pūjā-specific rule NOT expressible in the generic
  //     tithi-pervasion grammar. Left as a documented +1 expected-diff rather
  //     than hardcoded or hacked. (Vijayadashami/aparāhna on Oct 20 still
  //     matches Drik.)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "maha-navami",
    displayName: "Maha Navami",
    month: { purnimanta: "Ashwina" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 9,
      window: "sunrise",
      precedence: "udaya",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 17. Vijayadashami (Dussehra) — Ashwina Shukla 10, aparāhna
  //     Spec: Dashami pervading aparāhna.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vijayadashami",
    displayName: "Vijayadashami (Dussehra)",
    month: { purnimanta: "Ashwina" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 10,
      window: "aparahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 18. Karva Chauth — Kartika Krishna 4, moonrise
  //     Spec: Chaturthi live at moonrise; fast broken at chandrodaya.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "karva-chauth",
    displayName: "Karva Chauth",
    month: { purnimanta: "Kartika" },
    category: "moonrise",
    observance: {
      kind: "moonrise",
      paksha: "krishna",
      tithi: 4,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 19. Dhanteras — Kartika Krishna 13, pradoṣa
  //     Spec: Trayodashi pervading pradoṣa.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "dhanteras",
    displayName: "Dhanteras",
    month: { purnimanta: "Kartika" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "krishna",
      tithi: 13,
      window: "pradosha",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 20. Naraka Chaturdashi (Choti Diwali) — Kartika Krishna 14
  //     Spec: Abhyaṅga-snāna at moonrise-before-sunrise with Chaturdashi current.
  //     IMPERFECT FIT FLAG: The grammar has no "moonrise-before-sunrise" kind.
  //     Mapped to `moonrise` (Kartika Krishna 14) as the closest available
  //     primitive. The evaluator will find the day whose moonrise falls within
  //     the Chaturdashi interval — which for a pre-dawn moonrise will be the
  //     same civil day as the Abhyanga Snana. Phase 4 should add a dedicated
  //     "moonrise-before-sunrise" window or a "pratahkala-moonrise" kind.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "naraka-chaturdashi",
    displayName: "Naraka Chaturdashi (Choti Diwali)",
    month: { purnimanta: "Kartika" },
    category: "moonrise",
    observance: {
      kind: "moonrise",
      paksha: "krishna",
      tithi: 14,
    },
    meta: {
      note: "IMPERFECT FIT: spec requires moonrise-before-sunrise (Abhyanga Snana). Mapped to `moonrise` kind (nearest available). Phase 4 should add a moonrise-before-sunrise primitive or dedicate a pre-dawn window.",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 21. Diwali / Lakshmi Puja — Kartika Krishna Amāvāsyā, pradoṣa
  //     Spec: 2-day tie-break: day where Amāvāsyā pervades pradoṣa
  //     (+ sthira/Vṛṣabha lagna — editorial, not in grammar).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "diwali-lakshmi-puja",
    displayName: "Diwali / Lakshmi Puja",
    month: { purnimanta: "Kartika" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "krishna",
      tithi: "amavasya",
      window: "pradosha",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 22. Govardhan Puja / Annakut — Kartika Shukla 1, prātaḥ-kāla
  //     Spec: Pratipadā at forenoon.
  //     Note: "pratahkala" maps to the sunriseWindow function in time.ts
  //     (alias of sunrise kāla). This is correct per §5 and the kāla definitions.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "govardhan-puja",
    displayName: "Govardhan Puja / Annakut",
    month: { purnimanta: "Kartika" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 1,
      window: "pratahkala",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 23. Bhai Dooj — Kartika Shukla 2, aparāhna
  //     Spec: Dwitiya pervading aparāhna.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "bhai-dooj",
    displayName: "Bhai Dooj",
    month: { purnimanta: "Kartika" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 2,
      window: "aparahna",
      precedence: "max-window-fraction",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 24. Gita Jayanti (Mokshada Ekadashi) — Margashirsha Shukla 11, sunrise
  //     Spec: Ekadashi-vyāpti; Gita Jayanti date coincides with the Ekadashi
  //     (Smārta / Vaishnava split is on the underlying vrata, not this date).
  //     Also generated by the ekadashi() generator below, but kept here as a
  //     named core festival per §4. The two rules produce the same date.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "gita-jayanti",
    displayName: "Gita Jayanti (Mokshada Ekadashi)",
    month: { purnimanta: "Margashirsha" },
    category: "lunar-tithi",
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 11,
      window: "sunrise",
      precedence: "udaya",
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// §4b — EXTENDED SET GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 12 regular pūrṇimānta months in calendar order (amānta names;
 * pūrṇimānta derivation is handled by the evaluator from `elements.ts`).
 *
 * Month-name spellings match LUNAR_MONTH_NAMES in elements.ts exactly.
 */
const PURNIMANTA_MONTHS = [
  "Chaitra",       // 0
  "Vaishakha",     // 1
  "Jyeshtha",      // 2
  "Ashadha",       // 3
  "Shravana",      // 4
  "Bhadrapada",    // 5
  "Ashwina",       // 6
  "Kartika",       // 7
  "Margashirsha",  // 8
  "Pausha",        // 9
  "Magha",         // 10
  "Phalguna",      // 11
] as const;

/**
 * Canonical Ekadashi names for each (month, paksha) pair where well known.
 * Indexed as `EKADASHI_NAMES[monthIndex][paksha]`.
 * Source: Drik Panchang Ekadashi calendar; widely attested in tradition.
 * Pairs not listed here fall back to "<Month> <Paksha> Ekadashi".
 *
 * Note: this list covers the 12 regular months only.
 * Adhika months (Padmini = adhika Shukla Ekadashi, Parama = adhika Krishna
 * Ekadashi) use their own canonical names.
 */
const EKADASHI_NAMES: Record<string, { shukla: string; krishna: string }> = {
  Chaitra:      { shukla: "Kamada Ekadashi",       krishna: "Varuthini Ekadashi" },
  Vaishakha:    { shukla: "Mohini Ekadashi",        krishna: "Apara Ekadashi" },
  Jyeshtha:     { shukla: "Nirjala Ekadashi",       krishna: "Yogini Ekadashi" },
  Ashadha:      { shukla: "Devshayani Ekadashi",    krishna: "Kamika Ekadashi" },
  Shravana:     { shukla: "Putrada Ekadashi",       krishna: "Aja Ekadashi" },
  Bhadrapada:   { shukla: "Parsva Ekadashi",        krishna: "Indira Ekadashi" },
  Ashwina:      { shukla: "Papankusha Ekadashi",    krishna: "Rama Ekadashi" },
  Kartika:      { shukla: "Devutthana Ekadashi",    krishna: "Utpanna Ekadashi" },
  Margashirsha: { shukla: "Mokshada Ekadashi",      krishna: "Saphala Ekadashi" },
  Pausha:       { shukla: "Putrada Ekadashi",       krishna: "Sat-tila Ekadashi" },
  Magha:        { shukla: "Jaya Ekadashi",          krishna: "Vijaya Ekadashi" },
  Phalguna:     { shukla: "Amalaki Ekadashi",       krishna: "Papamochani Ekadashi" },
};

/**
 * Canonical names for Ekadashis falling in an Adhika (leap) month.
 * Source: tradition / Drik Panchang.
 */
const ADHIKA_EKADASHI_NAMES = {
  shukla: "Padmini Ekadashi",
  krishna: "Parama Ekadashi",
};

/**
 * Generate all Ekadashi rules for `year`.
 *
 * Rule (§4b, Smārta householder):
 *   Observe the day on which Ekadashi prevails at sunrise (udaya-tithi).
 *   When two candidate days arise (Dashami-vedha), take the first — Smārta
 *   householders accept Dashami-vedha (the Vaishnava arunodaya/Dashami-vedha
 *   skip is NOT used here).
 *
 * Count (2026): 24 Ekadashis total.
 *   12 regular months × 2 pakshas = 24.
 *   The Adhika Jyeshtha in 2026 contributes Padmini (Shukla-11) + Parama
 *   (Krishna-11), which ARE included in the 24.
 *
 * Implementation strategy: generate rules for all 12 regular months (both
 * pakshas), PLUS the Adhika Jyeshtha pair. The evaluator's nija-preference
 * logic (findTithiIntervalInMonth) will resolve the regular "Jyeshtha" rules
 * to the Nija lunation, while the adhika rules get their own month label
 * "Adhika Jyeshtha".
 *
 * Precedence "udaya" → Ekadashi present at sunrise (window start) wins.
 */
export function ekadashiRules(year: number): FestivalRule[] {
  const rules: FestivalRule[] = [];

  // 12 regular months, both pakshas.
  for (const month of PURNIMANTA_MONTHS) {
    const names = EKADASHI_NAMES[month];

    // Shukla Ekadashi (tithi 11 of shukla paksha).
    rules.push({
      id: `ekadashi-${month.toLowerCase()}-shukla`,
      displayName: names?.shukla ?? `${month} Shukla Ekadashi`,
      month: { purnimanta: month },
      category: "lunar-tithi",
      extended: true,
      observance: {
        kind: "tithi-pervades",
        paksha: "shukla",
        tithi: 11,
        window: "sunrise",
        precedence: "udaya",
      },
    });

    // Krishna Ekadashi (tithi 11 of krishna paksha).
    // Note: in pūrṇimānta reckoning, the Krishna paksha of e.g. Chaitra
    // belongs to Chaitra month (the fortnight BEFORE Chaitra Shukla).
    // The evaluator's absoluteTithi + findTithiIntervalInMonth handles this
    // correctly via the pūrṇimānta label on the tithi midpoint.
    rules.push({
      id: `ekadashi-${month.toLowerCase()}-krishna`,
      displayName: names?.krishna ?? `${month} Krishna Ekadashi`,
      month: { purnimanta: month },
      category: "lunar-tithi",
      extended: true,
      observance: {
        kind: "tithi-pervades",
        paksha: "krishna",
        tithi: 11,
        window: "sunrise",
        precedence: "udaya",
      },
    });
  }

  // Adhika Jyeshtha pair (present in 2026; generator is year-aware via
  // the month label "Adhika Jyeshtha" which the evaluator normalizes and
  // matches against the adhika lunation in the year's new-moon scan).
  // These are only emitted when an adhika Jyeshtha is expected. For now we
  // always emit them; the evaluator will return an empty date (with a
  // diagnostic) for years without an adhika Jyeshtha, and the integration
  // test checks the 2026 count. In a future revision, emit conditionally.
  rules.push({
    id: "ekadashi-adhika-jyeshtha-shukla",
    displayName: ADHIKA_EKADASHI_NAMES.shukla,
    month: { purnimanta: "Adhika Jyeshtha" },
    category: "lunar-tithi",
    extended: true,
    meta: {
      note: "Adhika Jyeshtha Shukla Ekadashi. Present in 2026; evaluator returns empty date with diagnostic in non-adhika years.",
    },
    observance: {
      kind: "tithi-pervades",
      paksha: "shukla",
      tithi: 11,
      window: "sunrise",
      precedence: "udaya",
    },
  });

  rules.push({
    id: "ekadashi-adhika-jyeshtha-krishna",
    displayName: ADHIKA_EKADASHI_NAMES.krishna,
    month: { purnimanta: "Adhika Jyeshtha" },
    category: "lunar-tithi",
    extended: true,
    meta: {
      note: "Adhika Jyeshtha Krishna Ekadashi. Present in 2026; evaluator returns empty date with diagnostic in non-adhika years.",
    },
    observance: {
      kind: "tithi-pervades",
      paksha: "krishna",
      tithi: 11,
      window: "sunrise",
      precedence: "udaya",
    },
  });

  void year; // year parameter reserved for future conditional adhika emission
  return rules;
}

/**
 * Generate Sankashti Chaturthi rules for `year`.
 *
 * Rule (§4b): Each month's Krishna-paksha Chaturthi, the day Chaturthi is
 * current at moonrise (moonrise-vyāpti). If Chaturthi touches no moonrise,
 * falls on the day whose moonrise is nearest to the Chaturthi interval.
 * Kind: `moonrise` (Kartika Krishna 4 is the model; this extends to all months).
 *
 * Note: Angāraki (when Sankashti falls on a Tuesday) is an editorial flag,
 * not a rule-selection criterion — not encoded here.
 *
 * Count (2026): 13 Sankashti Chaturthis (Adhika Jyeshtha contributes one extra).
 *
 * Like ekadashiRules, always emits the Adhika Jyeshtha entry; the evaluator
 * handles years without an adhika month gracefully (empty date + diagnostic).
 */
export function sankashtiRules(year: number): FestivalRule[] {
  const rules: FestivalRule[] = [];

  for (const month of PURNIMANTA_MONTHS) {
    rules.push({
      id: `sankashti-chaturthi-${month.toLowerCase()}`,
      displayName: `Sankashti Chaturthi (${month})`,
      month: { purnimanta: month },
      category: "moonrise",
      extended: true,
      observance: {
        kind: "moonrise",
        paksha: "krishna",
        tithi: 4,
      },
    });
  }

  // Adhika Jyeshtha Sankashti (present in 2026).
  rules.push({
    id: "sankashti-chaturthi-adhika-jyeshtha",
    displayName: "Sankashti Chaturthi (Adhika Jyeshtha)",
    month: { purnimanta: "Adhika Jyeshtha" },
    category: "moonrise",
    extended: true,
    meta: {
      note: "Adhika Jyeshtha Sankashti Chaturthi. Present in 2026; evaluator returns empty date with diagnostic in non-adhika years.",
    },
    observance: {
      kind: "moonrise",
      paksha: "krishna",
      tithi: 4,
    },
  });

  void year;
  return rules;
}

/**
 * The single Chhath Puja rule (§4b): anchored on Kartika Shukla Shashthi.
 *
 * Spec: main day = Shashthi prevails at SUNSET (Sandhya Arghya).
 * Grammar kind: `solar-arghya` (tithi at sunset + next sunrise).
 * This is a clean mapping: solar-arghya resolves to the day whose sunset
 * falls within the Shashthi interval (Sandhya Arghya = evening offering),
 * and records the next morning's sunrise (Uṣā Arghya).
 *
 * The 4-day festival (Nahay Khay → Kharna → Shashthi → Saptami) is not
 * modelled here as separate rules; only the anchor day is captured.
 */
export const CHHATH_RULE: FestivalRule = {
  id: "chhath-puja",
  displayName: "Chhath Puja (Sandhya Arghya)",
  month: { purnimanta: "Kartika" },
  category: "lunar-tithi",
  extended: true,
  observance: {
    kind: "solar-arghya",
    paksha: "shukla",
    tithi: 6,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Public API — allRules(year)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assemble the complete rule set for `year`: core (§4) + extended (§4b).
 *
 * The extended generators are year-aware so that Adhika-month entries can in
 * future be emitted conditionally; for now they always include the Adhika
 * Jyeshtha entries (the evaluator handles gracefully for non-adhika years).
 *
 * Note: `gita-jayanti` appears in both CORE_RULES and
 * `ekadashiRules` (as `ekadashi-margashirsha-shukla`). These are separate
 * rules with different IDs that produce the same date — gita-jayanti as a
 * named festival and the Margashirsha Shukla Ekadashi as part of the full
 * Ekadashi calendar. No deduplication is applied; both are surfaced.
 */
export function allRules(year: number): FestivalRule[] {
  return [
    ...CORE_RULES,
    ...ekadashiRules(year),
    ...sankashtiRules(year),
    CHHATH_RULE,
  ];
}
