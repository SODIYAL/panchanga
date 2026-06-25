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
      // Ghaṭasthāpana is udaya-vyāpinī: observed on the day Pratipadā is present
      // at sunrise. max-window-fraction coincides with udaya at New Delhi (the
      // tithi sits in the evening there) but diverges at far-western longitudes
      // where Pratipadā straddles sunrise — Calgary 2026 confirmed udaya matches
      // Drik (Oct 11) while max-window-fraction wrongly gave Oct 10.
      precedence: "udaya",
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
  //     Spec: Navami-vyāpti → PRECEDENCE: udaya (present-at-sunrise), the same
  //     sunrise-anchored udaya rule used by Hanuman Jayanti. NOTE: Durga Ashtami
  //     (the adjacent sunrise festival) intentionally stays on
  //     max-window-fraction — it resolves correctly that way for 2026; do NOT
  //     switch it to udaya.
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
// NOTE on krishna names: the engine labels months pūrṇimānta, so the Krishna
// pakṣa of month M falls within month M (the fortnight before M's Pūrṇimā). The
// canonical Ekadashi names follow that same pūrṇimānta attribution — e.g. Māgha
// Kṛṣṇa = Ṣaṭtilā, Phālguna Kṛṣṇa = Vijayā — which is what Drik Panchang lists.
// (An earlier version keyed the krishna column one month early, an amānta-style
// offset, which mislabelled all twelve Krishna Ekadashis.)
const EKADASHI_NAMES: Record<string, { shukla: string; krishna: string }> = {
  Chaitra:      { shukla: "Kamada Ekadashi",       krishna: "Papamochani Ekadashi" },
  Vaishakha:    { shukla: "Mohini Ekadashi",        krishna: "Varuthini Ekadashi" },
  Jyeshtha:     { shukla: "Nirjala Ekadashi",       krishna: "Apara Ekadashi" },
  Ashadha:      { shukla: "Devshayani Ekadashi",    krishna: "Yogini Ekadashi" },
  Shravana:     { shukla: "Putrada Ekadashi",       krishna: "Kamika Ekadashi" },
  Bhadrapada:   { shukla: "Parsva Ekadashi",        krishna: "Aja Ekadashi" },
  Ashwina:      { shukla: "Papankusha Ekadashi",    krishna: "Indira Ekadashi" },
  Kartika:      { shukla: "Devutthana Ekadashi",    krishna: "Rama Ekadashi" },
  Margashirsha: { shukla: "Mokshada Ekadashi",      krishna: "Utpanna Ekadashi" },
  Pausha:       { shukla: "Putrada Ekadashi",       krishna: "Saphala Ekadashi" },
  Magha:        { shukla: "Jaya Ekadashi",          krishna: "Sat-tila Ekadashi" },
  Phalguna:     { shukla: "Amalaki Ekadashi",       krishna: "Vijaya Ekadashi" },
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
// Recurring monthly vratas (§4c) — Pradoṣa, Masik Śivarātri, Pūrṇimā,
// Amāvāsyā, and the minor (non-Makar/Mesha) Sankrāntis.
//
// The mechanism already exists (tithi-pervades / solar-ingress); these supply
// the rule DATA. Each generator mirrors ekadashiRules: the 12 regular months
// plus the Adhika Jyeshtha entries (present in 2026), which the evaluator
// resolves to empty in non-adhika years.
// ═══════════════════════════════════════════════════════════════════════════

const PAKSHAS = ["shukla", "krishna"] as const;
const ADHIKA = "Adhika Jyeshtha";
const ADHIKA_NOTE = "Adhika-month entry; resolves to empty with a diagnostic in non-adhika years.";

/** Slugify a month label for an id: lower-case, spaces → hyphens. */
const monthSlug = (month: string): string => month.toLowerCase().replace(/\s+/g, "-");

/**
 * Shared scaffold for the recurring monthly vratas. Emits one rule per
 * pūrṇimānta month plus the trailing Adhika Jyeṣṭha entry (present in 2026; the
 * evaluator resolves it to an empty date with a diagnostic in non-adhika
 * years). `build(month, slug, adhika)` returns the rule(s) for one month —
 * `adhika` is true only on the Adhika pass, so callers attach `ADHIKA_NOTE`
 * (and any extra pakṣa fan-out) themselves. This collapses four near-identical
 * push-loop bodies into one.
 */
function monthlyVrataRules(
  build: (month: string, slug: string, adhika: boolean) => FestivalRule[],
): FestivalRule[] {
  const out: FestivalRule[] = [];
  for (const month of PURNIMANTA_MONTHS) out.push(...build(month, monthSlug(month), false));
  out.push(...build(ADHIKA, monthSlug(ADHIKA), true));
  return out;
}

/**
 * Pradoṣa Vrata — Trayodaśī (13) pervading the pradoṣa (post-sunset) window, in
 * both pakṣas of every month. The (S)/(K) suffix marks śukla/kṛṣṇa.
 */
export function pradoshRules(year: number): FestivalRule[] {
  void year;
  return monthlyVrataRules((month, slug, adhika) =>
    PAKSHAS.map((paksha) => ({
      id: `pradosh-${slug}-${paksha}`,
      displayName: `Pradosh Vrat (${paksha === "shukla" ? "S" : "K"}, ${month})`,
      month: { purnimanta: month },
      category: "lunar-tithi",
      extended: true,
      ...(adhika ? { meta: { note: ADHIKA_NOTE } } : {}),
      observance: { kind: "tithi-pervades", paksha, tithi: 13, window: "pradosha", precedence: "max-window-fraction" },
    })),
  );
}

/**
 * Masik Śivarātri — Kṛṣṇa Caturdaśī (14) in the niśīta (midnight) window.
 *
 * `fallback: "nearest-window"`: at far-western longitudes the Caturdaśī can
 * straddle two midnights without covering either niśīta (it ends ~1h before the
 * later one and starts after the earlier one), so no day pervades. The vrata
 * still occurs — on the day the Caturdaśī is current going into the night — so
 * we keep the candidate whose niśīta is nearest the tithi instead of dropping
 * the date. (Closes the 2 undated Calgary 2026 entries; no effect where a day
 * does pervade, i.e. New Delhi and the other 11 months.)
 */
export function masikShivaratriRules(year: number): FestivalRule[] {
  void year;
  return monthlyVrataRules((month, slug, adhika) => [{
    id: `masik-shivaratri-${slug}`,
    displayName: `Masik Shivaratri (${month})`,
    month: { purnimanta: month },
    category: "lunar-tithi",
    extended: true,
    ...(adhika ? { meta: { note: ADHIKA_NOTE } } : {}),
    observance: { kind: "tithi-pervades", paksha: "krishna", tithi: 14, window: "nishita", precedence: "max-window-fraction", fallback: "nearest-window" },
  }]);
}

/**
 * Pūrṇimā Vrata — the full-moon day of every pūrṇimānta month. The vrata is kept
 * on the day the full Moon is up during Pūrṇimā (moonrise-vyāpti), which is the
 * day panchāṅgas list as "Purnima Vrat" (distinct from the next-morning
 * snāna-dāna Pūrṇimā).
 *
 * KNOWN ISSUE (vs Drik Panchang Calgary 2026): this fires a day early in ~3/13
 * months (e.g. Jyeṣṭha Jun 28 vs DP Jun 29) when Pūrṇimā begins the prior
 * evening. A plain udaya rule overcorrects (drops months where Pūrṇimā never
 * touches a sunrise, and pushes others a day late), so the correct fix needs a
 * proper udaya-with-fallback / vedha policy — tracked, not yet implemented.
 */
export function purnimaVratRules(year: number): FestivalRule[] {
  void year;
  return monthlyVrataRules((month, slug, adhika) => [{
    id: `purnima-vrat-${slug}`,
    displayName: `${month} Purnima Vrat`,
    month: { purnimanta: month },
    category: "moonrise",
    extended: true,
    ...(adhika ? { meta: { note: ADHIKA_NOTE } } : {}),
    observance: { kind: "moonrise", paksha: "shukla", tithi: "purnima" },
  }]);
}

/**
 * Pūrṇimā snāna-dāna — the full-moon day Drik lists as "X Purnima" (distinct
 * from the moonrise "Purnima Vrat" above). It is the day Pūrṇimā prevails at
 * sunrise (udaya), when the morning snāna/dāna is performed; at far-western
 * longitudes this is typically the civil day AFTER the vrat. `nearest-window`
 * covers the rare month whose Pūrṇimā touches no sunrise.
 */
export function purnimaSnanaRules(year: number): FestivalRule[] {
  void year;
  return monthlyVrataRules((month, slug, adhika) => [{
    id: `purnima-snana-${slug}`,
    displayName: `${month} Purnima (Snana-Dana)`,
    month: { purnimanta: month },
    category: "lunar-tithi",
    extended: true,
    ...(adhika ? { meta: { note: ADHIKA_NOTE } } : {}),
    observance: { kind: "tithi-pervades", paksha: "shukla", tithi: "purnima", window: "sunrise", precedence: "udaya", fallback: "nearest-window" },
  }]);
}

/** Amāvāsyā — the new-moon (amāvāsyā) day of every pūrṇimānta month. */
export function amavasyaRules(year: number): FestivalRule[] {
  void year;
  return monthlyVrataRules((month, slug, adhika) => [{
    id: `amavasya-${slug}`,
    displayName: `${month} Amavasya`,
    month: { purnimanta: month },
    category: "lunar-tithi",
    extended: true,
    ...(adhika ? { meta: { note: ADHIKA_NOTE } } : {}),
    observance: { kind: "tithi-pervades", paksha: "krishna", tithi: "amavasya", window: "sunrise", precedence: "max-window-fraction" },
  }]);
}

/**
 * The ten minor Sankrāntis (the Sun's sidereal ingress into each rāśi), i.e.
 * all twelve except Makara and Meṣa, which are CORE festivals. `punyaKala`
 * follows Makar Sankranti's convention.
 */
export function sankrantiRules(year: number): FestivalRule[] {
  // [displayName, id-suffix, rāśi index]; rāśi 0 = Mesha … 11 = Mīna.
  const minor: ReadonlyArray<readonly [string, string, number]> = [
    ["Kumbha Sankranti", "kumbha", 10],
    ["Meena Sankranti", "meena", 11],
    ["Vrishabha Sankranti", "vrishabha", 1],
    ["Mithuna Sankranti", "mithuna", 2],
    ["Karka Sankranti", "karka", 3],
    ["Simha Sankranti", "simha", 4],
    ["Kanya Sankranti", "kanya", 5],
    ["Tula Sankranti", "tula", 6],
    ["Vrishchika Sankranti", "vrishchika", 7],
    ["Dhanu Sankranti", "dhanu", 8],
  ];
  void year;
  // `month` is omitted: solar-ingress keys on the rāśi, not a lunar-month label.
  return minor.map(([displayName, slug, rashi]) => ({
    id: `sankranti-${slug}`,
    displayName,
    category: "solar" as const,
    extended: true,
    observance: { kind: "solar-ingress" as const, rashi, punyaKala: "after-moment-to-sunset" as const },
  }));
}

/**
 * One-off regional festivals & jayantis on the HSNA calendar. Most are plain
 * udaya-tithi observances (the tithi present at sunrise); the full-moon
 * jayantis use moonrise-vyāpti; Lohri and the Navrātri Pāraṇā are offsets from
 * another festival. Validated against HSNA 2026 (test/hsna-oneoff.test.ts).
 */
export function oneOffFestivalRules(year: number): FestivalRule[] {
  // udaya-tithi at sunrise by default; some festivals key on a later kāla (the
  // tithi prevailing at that ritual window), which is given explicitly.
  const T = (
    id: string,
    displayName: string,
    month: string,
    paksha: "shukla" | "krishna",
    tithi: number,
    window: "sunrise" | "purvahna" | "madhyahna" | "aparahna" | "pradosha" | "nishita" = "sunrise",
    precedence: "udaya" | "max-window-fraction" | "first" | "second" = "udaya",
  ): FestivalRule => ({
    id,
    displayName,
    month: { purnimanta: month },
    category: "lunar-tithi",
    extended: true,
    observance: { kind: "tithi-pervades", paksha, tithi, window, precedence },
  });
  // full-moon (moonrise-vyāpti)
  const P = (id: string, displayName: string, month: string): FestivalRule => ({
    id,
    displayName,
    month: { purnimanta: month },
    category: "moonrise",
    extended: true,
    observance: { kind: "moonrise", paksha: "shukla", tithi: "purnima" },
  });
  // offset from another rule (`month` omitted — derived rules take their date,
  // and thus their month label, from the referenced festival).
  const D = (id: string, displayName: string, from: string, offsetDays: number): FestivalRule => ({
    id,
    displayName,
    category: "derived",
    extended: true,
    observance: { kind: "derived", from, offsetDays },
  });
  void year;
  return [
    D("lohri", "Lohri", "makar-sankranti", -1),
    T("phulera-dooj", "Phulera Dhooj", "Phalguna", "shukla", 2),
    T("ugadi-gudi-padwa", "Chaitra Navratri / Ugadi / Gudi Padwa", "Chaitra", "shukla", 1),
    D("chaitra-navratri-parana", "Chaitra Navratri Parana", "rama-navami", 1),
    P("koorm-jayanti", "Koorm Jayanti", "Vaishakha"),
    T("narad-jayanti", "Narad Jayanti", "Jyeshtha", "krishna", 1),
    // Ganga Dussehra — Jyeṣṭha Śukla Daśamī, observed in the ADHIKA Jyeṣṭha when
    // the year has one (Drik 2026: 25 May, Adhika Jyeṣṭha) and in the nija
    // Jyeṣṭha otherwise. `adhika:"prefer-adhika"` encodes exactly that — it
    // resolves every year without hardcoding the leap month.
    {
      id: "ganga-dussehra",
      displayName: "Ganga Dussehra",
      month: { purnimanta: "Jyeshtha" },
      category: "lunar-tithi",
      extended: true,
      observance: {
        kind: "tithi-pervades", paksha: "shukla", tithi: 10,
        window: "sunrise", precedence: "udaya", adhika: "prefer-adhika",
      },
    },
    T("jagannath-rath-yatra", "Jagannath Rath Yatra", "Ashadha", "shukla", 2),
    T("hariyali-teej", "Hariyali Teej", "Shravana", "shukla", 3),
    T("nag-panchami", "Nag Panchami", "Shravana", "shukla", 5),
    // Kajari Teej — evening (candra) worship → pradoṣa-vyāpinī Tṛtīyā.
    T("kajari-teej", "Kajari Teej", "Bhadrapada", "krishna", 3, "pradosha", "max-window-fraction"),
    T("balram-jayanti", "Balram Jayanti", "Bhadrapada", "krishna", 6),
    T("hartalika-teej", "Hartalika Teej", "Bhadrapada", "shukla", 3),
    // Rishi Panchami — canonically madhyāhna-vyāpinī (midday) Pañcamī.
    T("rishi-panchami", "Rishi Panchami", "Bhadrapada", "shukla", 5, "madhyahna", "max-window-fraction"),
    T("anant-chaturdashi", "Anant Chaturdashi", "Bhadrapada", "shukla", 14),
    P("pitru-paksha-begins", "Pitru Paksha Begins (Bhadrapada Purnima)", "Bhadrapada"),
    T("kalparambha", "Kalparambha", "Ashwina", "shukla", 6),
    T("navpatrika-puja", "Navpatrika Puja", "Ashwina", "shukla", 7),
    // Ahoi Ashtami — fast broken at evening star-sight → pradoṣa-vyāpinī Aṣṭamī.
    T("ahoi-ashtami", "Ahoi Ashtami", "Kartika", "krishna", 8, "pradosha", "max-window-fraction"),
    T("kansh-vadh", "Kansh Vadh", "Kartika", "shukla", 10),
    T("tulsi-vivah", "Tulsi Vivah", "Kartika", "shukla", 12),
    P("dattatreya-jayanti", "Dattatreya Jayanti", "Margashirsha"),
  ];
}

/**
 * Additional regional festivals & jayantis from the Drik Panchang Calgary
 * calendar, beyond the §4 core and the HSNA one-offs. Each is anchored on its
 * ritual kāla (deity-birth festivals on madhyāhna/pradoṣa/niśīta, snāna rites at
 * sunrise) and verified against Drik Panchang Calgary 2026
 * (test/conformance-calgary-regional.test.ts).
 *
 * Helpers mirror oneOffFestivalRules: T (tithi-pervades), P (moonrise pūrṇimā),
 * A (kṛṣṇa amāvāsyā at sunrise), SI (solar ingress / saṅkrānti-day festival).
 */
export function regionalFestivalRules(year: number): FestivalRule[] {
  const T = (
    id: string,
    displayName: string,
    month: string,
    paksha: "shukla" | "krishna",
    tithi: number,
    window: "sunrise" | "purvahna" | "madhyahna" | "aparahna" | "pradosha" | "nishita" = "sunrise",
    precedence: "udaya" | "max-window-fraction" | "first" | "second" = "udaya",
  ): FestivalRule => ({
    id, displayName, month: { purnimanta: month }, category: "lunar-tithi", extended: true,
    observance: { kind: "tithi-pervades", paksha, tithi, window, precedence },
  });
  const P = (id: string, displayName: string, month: string): FestivalRule => ({
    id, displayName, month: { purnimanta: month }, category: "moonrise", extended: true,
    observance: { kind: "moonrise", paksha: "shukla", tithi: "purnima" },
  });
  const A = (id: string, displayName: string, month: string): FestivalRule => ({
    id, displayName, month: { purnimanta: month }, category: "lunar-tithi", extended: true,
    observance: { kind: "tithi-pervades", paksha: "krishna", tithi: "amavasya", window: "sunrise", precedence: "max-window-fraction" },
  });
  const SI = (id: string, displayName: string, rashi: number): FestivalRule => ({
    id, displayName, category: "solar", extended: true,
    observance: { kind: "solar-ingress", rashi, punyaKala: "after-moment-to-sunset" },
  });
  void year;
  return [
    // ── Māgha ──
    T("ratha-saptami", "Ratha Saptami", "Magha", "shukla", 7),
    T("bhishma-ashtami", "Bhishma Ashtami", "Magha", "shukla", 8, "madhyahna", "max-window-fraction"),
    // ── Chaitra ──
    T("gangaur", "Gangaur / Gauri Puja", "Chaitra", "shukla", 3),
    T("yamuna-chhath", "Yamuna Chhath", "Chaitra", "shukla", 6),
    T("swaminarayan-jayanti", "Swaminarayan Jayanti", "Chaitra", "shukla", 9),
    // ── Vaiśākha — deity-birth jayantis on their ritual kāla ──
    T("parashurama-jayanti", "Parashurama Jayanti", "Vaishakha", "shukla", 3, "pradosha", "max-window-fraction"),
    T("ganga-saptami", "Ganga Saptami", "Vaishakha", "shukla", 7, "madhyahna", "max-window-fraction"),
    T("sita-navami", "Sita Navami", "Vaishakha", "shukla", 9, "madhyahna", "max-window-fraction"),
    T("narasimha-jayanti", "Narasimha Jayanti", "Vaishakha", "shukla", 14, "pradosha", "max-window-fraction"),
    // ── Jyeṣṭha ──
    A("vat-savitri-vrat", "Vat Savitri Vrat", "Jyeshtha"),
    A("shani-jayanti", "Shani Jayanti", "Jyeshtha"),
    P("vat-purnima-vrat", "Vat Purnima Vrat", "Jyeshtha"),
    // ── Bhādrapada ──
    T("radha-ashtami", "Radha Ashtami", "Bhadrapada", "shukla", 8),
    T("ganesh-visarjan", "Ganesh Visarjan", "Bhadrapada", "shukla", 14),
    // ── Āśvina ──
    SI("vishwakarma-puja", "Vishwakarma Puja", 5), // on Kanya Sankranti day
    // ── Kārtika ──
    T("govatsa-dwadashi", "Govatsa Dwadashi", "Kartika", "krishna", 12),
    T("kali-chaudas", "Kali Chaudas", "Kartika", "krishna", 14, "nishita", "max-window-fraction"),
    // ── Mārgaśīrṣa ──
    T("kalabhairav-jayanti", "Kalabhairav Jayanti", "Margashirsha", "krishna", 8, "nishita", "max-window-fraction"),
    T("vivah-panchami", "Vivah Panchami", "Margashirsha", "shukla", 5),
    // ── Nakṣatra- and weekday-anchored ──
    // Onam — Śravaṇa (Thiruvoṇam) nakṣatra at sunrise while the Sun is in Siṃha.
    {
      id: "onam", displayName: "Onam (Thiruvonam)", category: "nakshatra", extended: true,
      observance: { kind: "nakshatra-pervades", nakshatra: "Shravana", solarRashi: 4 },
    },
    // Varalakṣmī Vrat — the Friday (weekday 5) before Śrāvaṇa Pūrṇimā.
    {
      id: "varalakshmi-vrat", displayName: "Varalakshmi Vrat", category: "derived", extended: true,
      observance: { kind: "weekday-relative", from: "purnima-snana-shravana", weekday: 5 },
    },
  ];
}

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
    ...pradoshRules(year),
    ...masikShivaratriRules(year),
    ...purnimaVratRules(year),
    ...purnimaSnanaRules(year),
    ...amavasyaRules(year),
    ...sankrantiRules(year),
    ...oneOffFestivalRules(year),
    ...regionalFestivalRules(year),
    CHHATH_RULE,
  ];
}
