/**
 * src/types.ts — the observance-rule GRAMMAR (the engine's keystone).
 *
 * This module is the CANONICAL home for the festival rule algebra. It declares
 * the `Observance` union (how a festival's civil date is determined), the
 * `FestivalRule` record (the authored datum), and the `FestivalResult` output.
 *
 * The grammar is taken verbatim from the plan
 * (`docs/superpowers/plans/2026-06-23-festivals-page-v2.md`, "Rule grammar (the
 * keystone)"). It is the widened algebra derived from the verified spec table —
 * the v1 grammar could not express the festivals it named.
 *
 * SINGLE-DEFINITION POLICY
 * ────────────────────────
 * `Kala` is defined here (it names kāla windows AND the moonrise/sunset/ingress
 * instants observances key on). `GeoLocation` lives in `time.ts` (next to the
 * rise/set machinery that consumes it) and is RE-EXPORTED here so callers can
 * import the whole grammar from one place. There is exactly one definition of
 * each — no divergent duplicates.
 */

// Re-export so the grammar's home also surfaces the location type. (Single
// definition: the type itself still lives in time.ts.)
export type { GeoLocation } from "./time.js";

// ───────────────────────────────────────────────────────────────────────────
// Primitives
// ───────────────────────────────────────────────────────────────────────────

/**
 * A named time anchor. The first nine resolve to a kāla *window* (`{start,end}`)
 * via the corresponding `time.ts` function and are usable as a `tithi-pervades`
 * window; the last three (`moonrise`, `sunset`, `sankrantiPunyaKala`) are
 * instants used by the non-`tithi-pervades` observances.
 *
 * Note: `time.ts` exposes `pratahkala` (alias of `sunriseWindow`) for the
 * `"sunrise"` kāla, and `arunodaya` is the pre-sunrise window (4 ghaṭikās
 * before sunrise) for aruṇodaya-vyāpinī observances.
 */
export type Kala =
  | "sunrise" | "purvahna" | "madhyahna" | "aparahna" | "pradosha"
  | "nishita" | "pratahkala" | "brahmaMuhurta"
  | "moonrise" | "sunset" | "arunodaya" | "sankrantiPunyaKala";

/**
 * A tithi reference within a paksha: 1..15 (Pratipadā..Pūrṇimā/Amāvāsyā), or a
 * boundary alias. `"purnima"` ≡ tithi 15 of śukla pakṣa; `"amavasya"` ≡ tithi
 * 15 of kṛṣṇa pakṣa.
 */
export type TithiRef = number | "purnima" | "amavasya";

/** Lunar fortnight. */
export type Paksha = "shukla" | "krishna";

// ───────────────────────────────────────────────────────────────────────────
// The observance union — how a festival's civil date is determined
// ───────────────────────────────────────────────────────────────────────────

/**
 * The five ways a festival date resolves. The discriminant is `kind`.
 */
export type Observance =
  /**
   * Most lunar festivals: the tithi must PERVADE a kāla window on the chosen
   * civil day. Among the (usually two) candidate days the tithi touches, a
   * `precedence` policy selects the winner.
   *
   *  • "max-window-fraction" — the day whose tithi interval covers the larger
   *    fraction of that day's `window` wins (the vyāpti/pervasion rule).
   *  • "udaya" — the day on which the tithi is present at the window's start
   *    (sunrise-prevailing).
   *  • "first" / "second" — fixed: the earlier / later candidate.
   *
   * `nakshatra` (e.g. Janmāṣṭamī's Rohiṇī): `"required"` filters out days where
   * the nakshatra is absent; `"preferred"` is only a tie-break.
   * `avoidKarana: "vishti"` (Bhadra — Holikā, Rakhi): the Bhadra overlap is
   * recorded, and (via `bhadraSplit`) its Mukha/Pucchā windows and Vāsa are
   * surfaced in the result instants.
   * `fallback` applies when the tithi pervades the window on NO candidate day.
   */
  | { kind: "tithi-pervades"; paksha: Paksha; tithi: TithiRef; window: Kala;
      precedence: "max-window-fraction" | "udaya" | "first" | "second";
      nakshatra?: { name: string; window?: Kala; mode: "required" | "preferred" };
      avoidKarana?: "vishti";
      fallback?: "previous-day" | "next-day" }
  /** Pure solar: the Sun's sidereal ingress into a rāśi. */
  | { kind: "solar-ingress"; rashi: number /* 0=Mesha … 9=Makara */;
      punyaKala?: "after-moment-to-sunset" | "around-moment" }
  /** Moon-sighting festivals: tithi live at moonrise (Karva Chauth, Sankashti). */
  | { kind: "moonrise"; paksha: Paksha; tithi: TithiRef }
  /** Sūrya-arghya festivals: tithi at sunset, and next sunrise (Chhath). */
  | { kind: "solar-arghya"; paksha: Paksha; tithi: TithiRef }
  /** Offset from another festival (Holi = Holikā +1). */
  | { kind: "derived"; from: string; offsetDays: number };

// ───────────────────────────────────────────────────────────────────────────
// The authored rule
// ───────────────────────────────────────────────────────────────────────────

export type FestivalRule = {
  /** Stable slug. */
  id: string;
  displayName: string;
  /**
   * Pūrṇimānta month label; the amānta label is derived at output time.
   * OPTIONAL: solar-ingress and derived rules don't key on a lunar month, so
   * they omit it rather than carry an empty-string placeholder. For lunar-tithi
   * / moonrise / solar-arghya rules it is required to anchor the lunation.
   */
  month?: { purnimanta: string };
  category: "lunar-tithi" | "solar" | "moonrise" | "derived";
  /** True if this is part of the §4b extended set. */
  extended?: boolean;
  observance: Observance;
  /** Default "smarta". */
  sampradaya?: "smarta" | "vaishnava";
  meta?: { deity?: string; note?: string };
};

// ───────────────────────────────────────────────────────────────────────────
// The computed result
// ───────────────────────────────────────────────────────────────────────────

export type FestivalResult = {
  id: string;
  /** Local civil date (YYYY-MM-DD) in `loc` tz. Empty string when unresolved. */
  date: string;
  /** Key instants (tithi start/end, window start/end, moment, …) as ISO UTC. */
  instants: Record<string, string>;
  monthLabel: { purnimanta: string; amanta: string };
  /** Never silently drop: any miss is explained here. */
  diagnostics: string[];
};
