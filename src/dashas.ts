/**
 * src/dashas.ts — Vimśottarī daśā (the BPHS 120-year nakṣatra daśā).
 *
 * SCRIPTURE BASIS: Bṛhat Parāśara Horā Śāstra, daśā-adhyāya. The nine lords
 * and their years, in order:
 *   Ketu 7 · Venus 20 · Sun 6 · Moon 10 · Mars 7 · Rāhu 18 · Jupiter 16 ·
 *   Saturn 19 · Mercury 17   (total 120)
 * The starting lord is the janma nakṣatra's lord (Aśvinī → Ketu, Bharaṇī →
 * Venus, …, the 9-cycle repeating across the 27 nakṣatras). The balance of
 * the first mahādaśā is the UNELAPSED fraction of the janma nakṣatra times
 * the lord's years; the engine measures that fraction in elapsed TIME within
 * the nakṣatra's actual astronomical boundaries (`nakshatraBoundaries`), not
 * in mean arc — the dṛk reading of the rule.
 *
 * Years are Julian years (365.25 days), the prevailing software convention.
 *
 * PROVENANCE: the first period carries `balanceNote` when the birth Moon sits
 * within 1′ of a nakṣatra boundary — there a minute of birth-time error moves
 * daśā starts by days, and consumers should say so rather than imply
 * false precision.
 */

import type { Graha, JanmaFacts } from "./grahas.js";

/** BPHS Vimśottarī sequence: [lord, years]. Total = 120. */
export const VIMSHOTTARI_SEQUENCE: readonly (readonly [Graha, number])[] = [
  ["Ketu", 7],
  ["Venus", 20],
  ["Sun", 6],
  ["Moon", 10],
  ["Mars", 7],
  ["Rahu", 18],
  ["Jupiter", 16],
  ["Saturn", 19],
  ["Mercury", 17],
] as const;

export const VIMSHOTTARI_TOTAL_YEARS = 120;
const YEAR_MS = 365.25 * 86_400_000;

export interface DashaPeriod {
  lord: Graha;
  /** UTC start/end of the mahādaśā. */
  start: Date;
  end: Date;
  /** Length in Vimśottarī years (the first is the birth balance). */
  years: number;
  /** Antardaśās (bhukti) within this mahādaśā, starting from its own lord. */
  antardashas: AntardashaPeriod[];
  /** Set on the first period when the janma nakṣatra fraction is edge-close. */
  balanceNote?: string;
}

export interface AntardashaPeriod {
  lord: Graha;
  start: Date;
  end: Date;
  /**
   * Pratyantardaśās (the third level), present when `levels >= 3` was
   * requested: proportional cuts of the antardaśā starting from its own lord
   * (BPHS — the same self-first ladder at every level). Clipped to birth in
   * the balance region like the antardaśās themselves.
   */
  pratyantardashas?: { lord: Graha; start: Date; end: Date }[];
}

export interface VimshottariOptions {
  /**
   * Ladder depth: 2 = mahā + antar (default), 3 = + pratyantar. Deeper
   * levels divide by 120 each time — a pratyantara is minutes-to-months —
   * so precision claims should mind the janma-nakṣatra margin note.
   */
  levels?: 2 | 3;
}

/** Nakṣatra lord: the 9-cycle across the 27 nakṣatras (Aśvinī → Ketu, …). */
export function nakshatraLord(nakshatraIndex: number): Graha {
  return VIMSHOTTARI_SEQUENCE[((nakshatraIndex % 9) + 9) % 9][0];
}

/**
 * The full Vimśottarī ladder from birth: the balance mahādaśā plus complete
 * periods to 120 years, each with its antardaśās.
 */
export function vimshottariDasha(
  janma: JanmaFacts,
  opts: VimshottariOptions = {},
): DashaPeriod[] {
  const levels = opts.levels ?? 2;
  const startIdx = ((janma.janmaNakshatra % 9) + 9) % 9;
  const periods: DashaPeriod[] = [];
  let cursorMs = janma.birth.getTime();

  // Exactly one full cycle: the balance mahādaśā + the 8 following lords
  // (total = 120 years minus the elapsed portion of the first).
  for (let k = 0; k < 9; k++) {
    const [lord, fullYears] = VIMSHOTTARI_SEQUENCE[(startIdx + k) % 9];
    // First period: only the unelapsed balance of the janma nakṣatra remains.
    const years = k === 0 ? (1 - janma.nakshatraFractionElapsed) * fullYears : fullYears;
    if (years <= 0) continue; // birth exactly on a boundary
    const start = new Date(cursorMs);
    const end = new Date(cursorMs + years * YEAR_MS);

    // Antardaśās: proportional cuts of the mahādaśā, starting from its own
    // lord (BPHS). For the balance period the sub-ladder is the TAIL of the
    // full-period ladder: compute the full ladder from the notional full
    // start, keep what falls after birth.
    const notionalStartMs = end.getTime() - fullYears * YEAR_MS;
    const antardashas: AntardashaPeriod[] = [];
    let subCursor = notionalStartMs;
    for (let j = 0; j < 9; j++) {
      const [subLord, subYears] = VIMSHOTTARI_SEQUENCE[(startIdx + k + j) % 9];
      const subLenMs = ((fullYears * subYears) / VIMSHOTTARI_TOTAL_YEARS) * YEAR_MS;
      const subStart = subCursor;
      const subEnd = subCursor + subLenMs;
      subCursor = subEnd;
      if (subEnd <= start.getTime()) continue; // fully before birth (balance tail)
      const antar: AntardashaPeriod = {
        lord: subLord,
        start: new Date(Math.max(subStart, start.getTime())),
        end: new Date(subEnd),
      };
      if (levels >= 3) {
        // Pratyantardaśās: the same self-first proportional ladder inside the
        // NOTIONAL antardaśā, clipped to birth (balance region) like antars.
        const pratyantars: { lord: Graha; start: Date; end: Date }[] = [];
        let pCursor = subStart;
        for (let p = 0; p < 9; p++) {
          const [pLord, pYears] = VIMSHOTTARI_SEQUENCE[(startIdx + k + j + p) % 9];
          const pLenMs = (pYears / VIMSHOTTARI_TOTAL_YEARS) * subLenMs;
          const pStart = pCursor;
          const pEnd = pCursor + pLenMs;
          pCursor = pEnd;
          if (pEnd <= start.getTime()) continue; // before birth
          pratyantars.push({
            lord: pLord,
            start: new Date(Math.max(pStart, start.getTime())),
            end: new Date(pEnd),
          });
        }
        antar.pratyantardashas = pratyantars;
      }
      antardashas.push(antar);
    }

    const period: DashaPeriod = { lord, start, end, years, antardashas };
    if (k === 0 && janma.moon.nakshatraMarginArcmin < 1) {
      period.balanceNote =
        `janma nakṣatra margin is ${janma.moon.nakshatraMarginArcmin.toFixed(2)}′ — ` +
        `daśā starts are sensitive to birth-time precision here`;
    }
    periods.push(period);
    cursorMs = end.getTime();
  }
  return periods;
}
