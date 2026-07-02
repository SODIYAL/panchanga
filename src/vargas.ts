/**
 * src/vargas.ts — the BPHS ṣoḍaśavarga: all sixteen divisional charts.
 *
 * SCRIPTURE BASIS: Bṛhat Parāśara Horā Śāstra, ṣoḍaśavarga-adhyāya. Each
 * varga divides a rāśi into N equal parts (except D30, whose parts are
 * unequal by the text) and assigns each part a rāśi by a per-varga rule.
 * The rules are NOT one formula — encoded per varga below, each with its
 * BPHS mapping:
 *
 *   D1  rāśi        — the sign itself.
 *   D2  horā        — 2×15°; odd signs: Sun's horā (Siṁha) then Moon's
 *                     (Karka); even signs reversed. (BPHS assigns horās to
 *                     the luminaries only; the cyclical "parivṛtti" horā some
 *                     software offers is a non-BPHS variant, not implemented.)
 *   D3  drekkāṇa    — 3×10°; parts go to the sign, the 5th, the 9th (+4·part).
 *   D4  caturthāṁśa — 4×7°30′; the sign, 4th, 7th, 10th (+3·part).
 *   D7  saptāṁśa    — 7 parts; odd signs count from the sign itself, even
 *                     signs from the 7th from it.
 *   D9  navāṁśa     — 9×3°20′; movable from itself, fixed from the 9th, dual
 *                     from the 5th — collapses to uniform ⌊lon/3°20′⌋ mod 12.
 *   D10 daśāṁśa     — 10×3°; odd from the sign, even from the 9th from it.
 *   D12 dvādaśāṁśa  — 12×2°30′; counted from the sign itself (+part).
 *   D16 ṣoḍaśāṁśa   — 16 parts; movable from Meṣa, fixed from Siṁha, dual
 *                     from Dhanu.
 *   D20 viṁśāṁśa    — 20×1°30′; movable from Meṣa, fixed from Dhanu, dual
 *                     from Siṁha.
 *   D24 siddhāṁśa   — 24×1°15′; odd from Siṁha, even from Karka.
 *   D27 bhāṁśa      — 27 parts; fiery from Meṣa, earthy from Karka, airy from
 *                     Tulā, watery from Makara — collapses to uniform
 *                     ⌊lon/(30/27)⌋ mod 12 (same shape as D9's collapse).
 *   D30 triṁśāṁśa   — UNEQUAL parts. Odd signs: 5° Mars (Meṣa), 5° Saturn
 *                     (Kumbha), 8° Jupiter (Dhanu), 7° Mercury (Mithuna),
 *                     5° Venus (Tulā). Even signs, reverse order into the
 *                     lords' even signs: 5° Venus (Vṛṣabha), 7° Mercury
 *                     (Kanyā), 8° Jupiter (Mīna), 5° Saturn (Makara),
 *                     5° Mars (Vṛścika).
 *   D40 khavedāṁśa  — 40 parts; odd from Meṣa, even from Tulā.
 *   D45 akṣavedāṁśa — 45 parts; movable from Meṣa, fixed from Siṁha, dual
 *                     from Dhanu.
 *   D60 ṣaṣṭyāṁśa   — 60×0°30′; counted from the sign itself (+part).
 *
 * PROVENANCE: `vargaRashi` is pure arithmetic on a sidereal longitude — the
 * chart-level uncertainty is entirely the input longitude's (see each
 * position's boundary margins). A D60 part is 30′ wide, so a ~1′ position
 * uncertainty flips a D60 in ~3% of cases: consumers showing high vargas
 * should surface the margins.
 */

import { normalize360 } from "./ayanamsha.js";

/** The sixteen BPHS vargas, in ṣoḍaśavarga order. */
export const SHODASHAVARGA = [
  "D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12",
  "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60",
] as const;
export type Varga = (typeof SHODASHAVARGA)[number];

/** Sanskrit names, keyed by varga. */
export const VARGA_NAMES: Record<Varga, string> = {
  D1: "Rashi", D2: "Hora", D3: "Drekkana", D4: "Chaturthamsha",
  D7: "Saptamsha", D9: "Navamsha", D10: "Dashamsha", D12: "Dvadashamsha",
  D16: "Shodashamsha", D20: "Vimshamsha", D24: "Siddhamsha", D27: "Bhamsha",
  D30: "Trimshamsha", D40: "Khavedamsha", D45: "Akshavedamsha", D60: "Shashtyamsha",
};

const KARKA = 3, SIMHA = 4;
/** Movable(0)/fixed(1)/dual(2) quality of a rāśi index. */
const quality = (rashi: number): number => rashi % 3;
/** "Odd sign" in the classical 1-based sense: Meṣa, Mithuna, … (even index). */
const isOdd = (rashi: number): boolean => rashi % 2 === 0;

/**
 * The rāśi index (0..11) a sidereal longitude occupies in the given varga,
 * per the BPHS rules documented in the file header.
 */
export function vargaRashi(longitude: number, varga: Varga): number {
  const lon = normalize360(longitude);
  const rashi = Math.floor(lon / 30) % 12;
  const deg = lon % 30;
  const part = (n: number): number => Math.min(n - 1, Math.floor((deg * n) / 30));

  switch (varga) {
    case "D1":
      return rashi;
    case "D2":
      // Odd: Sun's horā (Siṁha) then Moon's (Karka); even signs reversed.
      return isOdd(rashi) ? (deg < 15 ? SIMHA : KARKA) : (deg < 15 ? KARKA : SIMHA);
    case "D3":
      return (rashi + 4 * part(3)) % 12;
    case "D4":
      return (rashi + 3 * part(4)) % 12;
    case "D7":
      return ((isOdd(rashi) ? rashi : rashi + 6) + part(7)) % 12;
    case "D9":
      return Math.floor(lon / (30 / 9)) % 12; // the uniform collapse
    case "D10":
      return ((isOdd(rashi) ? rashi : rashi + 8) + part(10)) % 12;
    case "D12":
      return (rashi + part(12)) % 12;
    case "D16":
      return ([0, SIMHA, 8][quality(rashi)] + part(16)) % 12;
    case "D20":
      return ([0, 8, SIMHA][quality(rashi)] + part(20)) % 12;
    case "D24":
      return ((isOdd(rashi) ? SIMHA : KARKA) + part(24)) % 12;
    case "D27":
      return Math.floor(lon / (30 / 27)) % 12; // uniform collapse (fiery→Meṣa …)
    case "D30": {
      // Unequal segments → the segment lord's sign (odd: lords' odd signs in
      // Mars/Saturn/Jupiter/Mercury/Venus order; even: reverse order into the
      // lords' even signs).
      if (isOdd(rashi)) {
        if (deg < 5) return 0; // Meṣa (Mars)
        if (deg < 10) return 10; // Kumbha (Saturn)
        if (deg < 18) return 8; // Dhanu (Jupiter)
        if (deg < 25) return 2; // Mithuna (Mercury)
        return 6; // Tulā (Venus)
      }
      if (deg < 5) return 1; // Vṛṣabha (Venus)
      if (deg < 12) return 5; // Kanyā (Mercury)
      if (deg < 20) return 11; // Mīna (Jupiter)
      if (deg < 25) return 9; // Makara (Saturn)
      return 7; // Vṛścika (Mars)
    }
    case "D40":
      return ((isOdd(rashi) ? 0 : 6) + part(40)) % 12;
    case "D45":
      return ([0, SIMHA, 8][quality(rashi)] + part(45)) % 12;
    case "D60":
      return (rashi + part(60)) % 12;
  }
}

/** All sixteen varga placements of a longitude, keyed by varga. */
export function shodashavarga(longitude: number): Record<Varga, number> {
  const out = {} as Record<Varga, number>;
  for (const v of SHODASHAVARGA) out[v] = vargaRashi(longitude, v);
  return out;
}

/** Vargottama: the same rāśi in D1 and D9 — a classical strength marker. */
export function isVargottama(longitude: number): boolean {
  return vargaRashi(longitude, "D1") === vargaRashi(longitude, "D9");
}
