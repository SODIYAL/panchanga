# Daily Rāśiphala — design

**Date:** 2026-07-31
**Status:** design approved, not yet implemented
**Scope:** a deterministic 12-rāśi daily horoscope (rāśiphala) computed from gochara

---

## 1. Goal

Add a daily horoscope to the panchanga engine, in the public "temple website /
newspaper" form: **twelve readings keyed by janma rāśi (Moon sign)**, needing no birth
time and no birth place from the reader.

This is deliberately *not* a personalised horoscope. See §9 for what that costs, stated
in the classical sources' own terms.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Product shape | 12-rāśi public rāśiphala; janma rāśi is the only reader input |
| Prose generation | Deterministic composition from authored fragments — no LLM, no network |
| Architecture | Three modules: factor engine / classical data / composer |
| Rāhu & Ketu | Included, mirroring Śani and Maṅgala respectively (Raman), marked derived |
| Primary source | Phaladīpikā ch. 26 |
| Cross-check, good houses | Bṛhat Saṁhitā ch. 104 |
| Cross-check, vedha | Raman, *Hindu Predictive Astrology* ch. 34 |

Deterministic composition is not a stylistic preference — it is what keeps this feature
consistent with the rest of the engine, which has exactly one runtime dependency, makes
no network calls, and attaches provenance to every output. An LLM prose layer would
break all three properties at once.

## 3. Sources and their exact scope

Each source is cited only for what it actually covers. This matters: the naive
assumption that any one text supplies the whole system is false, and was corrected
during design.

**Phaladīpikā ch. 26 (Mantreśvara)** — primary. Supplies the per-graha good-house lists
(Sl. 2) *and* the vedha pairings (Sl. 3–8). Establishes the reference point at Sl. 1:
*"Of all the Lagnas it is only the Moon's Lagna that is most important for ascertaining
the gocaraphala."* Covers seven grahas.

**Bṛhat Saṁhitā ch. 104 (Varāhamihira)** — cross-checks the good-house lists only.
Verses 4–45 give per-graha transit effects from the natal Moon. **Contains no vedha
points whatsoever**, and omits Rāhu/Ketu. It can therefore validate half of `phala.ts`
and no more.

**Raman, *Hindu Predictive Astrology* ch. 34** — cross-checks the vedha pairings that
Bṛhat Saṁhitā lacks, and is the authority for the Rāhu/Ketu substitution rule.

### Known divergence to pin at implementation

**Maṅgala's 10th house.** Raman lists Mars as favourable in 3, 6, 10, 11; Phaladīpikā
Sl. 2 gives 3, 6 (+11) without the 10th. Phaladīpikā is primary, so the 10th is *not*
favourable in the shipped table, and the divergence goes in `KNOWN_ISSUES.md` as the
first entry of a new "Gochara" section — the same discipline the calendar convention
edges already follow.

## 4. Architecture

Three modules, mirroring the evaluator/data split the repo already uses in
`src/festivals.ts` (evaluator) vs `src/rules.ts` (data):

```
src/gochara.ts     compute  — houses from janma rāśi, vedha resolution, Śani states
src/phala.ts       data     — good-house/vedha paired lists, authored fragments
src/rashiphala.ts  compose  — factors → prose + basis
```

The boundary earns its keep: the factor layer makes falsifiable claims that can be
tested against published sources, while the prose layer cannot be tested for
correctness at all (§8). Welding them together would make the classical claims
untestable.

### Data flow

Everything anchors at **sunrise**, the udaya convention already used by
`dailyPanchanga` (`src/panchanga.ts:112`), so the rāśiphala and the pañcāṅga never
disagree about which day it is.

```
date + loc
  → dailyPanchanga(date, loc)          (existing)
  → grahaPositions(sunrise)            (existing) → sidereal rāśi of all nine
  → for janmaRashi 0..11:
        gocharaFactors(rashis, janmaRashi) → GocharaFactors
  → composeRashiphala(factors, panchanga) → Rashiphala
```

One ephemeris evaluation serves all twelve readings; the grahas are computed once and
reckoned from twelve reference points. House counting is whole-sign,
`((graha - janma + 12) % 12) + 1`, identical to `src/doshas.ts:40`.

## 5. Factor engine — `src/gochara.ts`

```ts
interface TransitFactor {
  graha: Graha;
  rashi: number;                        // sidereal rāśi occupied
  house: number;                        // 1..12 from janma rāśi
  favourable: boolean;                  // house ∈ this graha's good list
  vedha: { by: Graha; fromHouse: number } | null;
  effective: "favourable" | "obstructed" | "neutral";
  derived?: "mirrors-shani" | "mirrors-mangala";   // Rāhu/Ketu only
}

interface ShaniState {
  kind: "sade-sati" | "kantaka" | "ashtama" | null;
  phase: 1 | 2 | 3 | null;              // sāḍe sātī only
  house: number;
}

interface GocharaFactors {
  janmaRashi: number;
  janmaRashiName: string;
  transits: TransitFactor[];            // nine entries; two flagged `derived`
  shani: ShaniState;
  validUntil: string;                   // ISO-UTC — when Candra changes rāśi
}
```

### Design points

**`favourable` is binary, not three-valued.** The sources give a *list of good houses*
per graha; everything outside that list is simply not-good. There is no attested middle
value, and inventing one would be fabrication. `effective: "neutral"` denotes "not in
the good list", not a classical third category.

`effective` is fully determined by the two fields above — implementers should derive it,
never set it independently:

| `favourable` | `vedha` | `effective` |
|---|---|---|
| `true` | `null` | `"favourable"` |
| `true` | present | `"obstructed"` |
| `false` | — | `"neutral"` (vedha is not evaluated for non-good houses) |

**Vedha is positional.** The good-house and vedha lists are paired *ordinally* — the
Nth good house is obstructed from the Nth vedha house. Sun favourable in 11, 3, 10, 6 is
obstructed from 5, 9, 4, 12 respectively. This is not a house-to-house lookup table; it
is a per-graha zip of two lists, and encoding it as a flat map would lose the pairing.

**Vedha cancels; it never inverts.** An obstructed transit yields `"obstructed"` — the
promised good result does not land. It does not become a bad result.

**The two vedha exemptions are mutual** and must be encoded explicitly, with a test
asserting each: Sun ↔ Śani do not obstruct each other (Phaladīpikā gives the reason —
no vedha between father and son), and Candra ↔ Budha do not obstruct each other.

**Rāhu and Ketu do not act as obstructing bodies.** They receive mirrored good-house and
vedha lists (Rāhu ← Śani, Ketu ← Maṅgala) so that a transit result can be reported for
them, but no source assigns them a vedha-causing role, so they are excluded from the
obstructor scan. This is a design decision filling a source silence, and is recorded as
such in `KNOWN_ISSUES.md`.

**Candra bala is not a separate factor.** The Moon's own good houses are 1, 3, 6, 7, 10,
11 — identical to the classical Candra bala list. They are one computation. The Moon's
`TransitFactor` *is* the Candra bala; reporting both would be double-counting dressed as
corroboration.

**Śani states** are exact functions of janma rāśi, which makes them the best-fitting
factor in this tier. Śani in the 12th/1st/2nd from Candra is Sāḍe Sātī, reported with
its phase (1 rising / 2 peak / 3 setting) since the three differ in classical import.
The 4th is Kaṇṭaka Śani. The 8th is Aṣṭama Śani — **not** "Ardhāṣṭama", which sources
apply inconsistently, some to the 4th; the ambiguity is noted in the module docstring
rather than resolved silently.

**`validUntil` is the honesty mechanism.** A rāśiphala holds only while the Moon keeps
its rāśi (~2¼ days); the slow grahas are the standing background. Carrying the expiry
instant states the reading's shelf life instead of implying a day-shaped truth, and
gives the API a computed `Cache-Control` rather than a guessed one.

## 6. Classical data — `src/phala.ts`

```ts
interface PhalaEntry {
  goodHouses: readonly number[];
  vedhaHouses: readonly number[];   // positionally paired with goodHouses
  fragments: Readonly<Record<number, string>>;  // house → authored phrase
  source: string;                   // e.g. "phaladipika-26.3"
  crossCheck: { brihatSamhita?: number[]; raman?: number[]; diverges?: string };
}
```

### Transcription targets

These are the tables to be encoded, drawn from Phaladīpikā Sl. 2–8:

| Graha | Good houses | Vedha houses (paired) |
|---|---|---|
| Sūrya | 11, 3, 10, 6 | 5, 9, 4, 12 |
| Candra | 7, 1, 6, 11, 10, 3 | 2, 5, 12, 8, 4, 9 |
| Maṅgala | 3, 11, 6 | 12, 5, 9 |
| Budha | 2, 4, 6, 8, 10, 11 | 5, 3, 9, 1, 8, 12 |
| Guru | 2, 11, 9, 5, 7 | 12, 8, 10, 4, 3 |
| Śukra | 1, 2, 3, 4, 5, 8, 9, 12, 11 | 8, 7, 1, 10, 9, 5, 11, 6, 3 |
| Śani | 3, 11, 6 | 12, 5, 9 |

**These tables are provisional.** They were assembled during design from an online
English rendering, not from a print edition, and **must be verified against a published
translation before shipping**. Two specific cells to scrutinise: Budha's 8th appears in
both its good list and its vedha list (pairing resolves to 10th-obstructed-from-8th,
which is coherent, but warrants a direct read), and Śukra's nine-element pairing is the
longest and most error-prone to transcribe.

## 7. Composer — `src/rashiphala.ts`

```ts
interface Rashiphala {
  date: string; location: GeoLocation;
  janmaRashi: number; janmaRashiName: string;
  text: string;              // composed prose
  basis: string[];           // one line per contributing factor
  factors: GocharaFactors;   // raw record, always present
  validUntil: string;
  notes: string[];           // source divergences touching this reading
}

dailyRashiphala(date: Date, loc: GeoLocation): Rashiphala[]   // all twelve
```

Composition follows classical priority, not graha order:

1. **Candra gochara** leads — it is the day's mover and what makes the reading daily
2. **Śani state**, if any — the standing weight
3. **Guru** transit
4. Remaining grahas **only where the factor is decisive** — emitting all nine every day
   produces a list nobody reads
5. Day-common pañcāṅga tail (vāra, Rāhu Kāla), identical across all twelve

Obstructed factors are **stated, not dropped**: *"Guru's eleventh-house passage promises
gain, but Śani's vedha from the third withholds it."* Silence would misrepresent the
classical position, which is that the transit occurred and the result did not follow.

## 8. Validation

The honest split — what can be tested, and what cannot:

**Falsifiable, real tests:**
- Graha rāśi occupancy against the Swiss Ephemeris, reusing the existing
  `scripts/ephemeris-audit.mjs` harness
- House arithmetic: exhaustive over 12 janma rāśis × 12 graha rāśis
- Vedha pairing: list lengths equal per graha; both exemptions asserted by name
- Rāhu/Ketu excluded from the obstructor scan
- **Sāḍe Sātī windows per rāśi, 2020–2040, against published tables** — genuine external
  conformance, not self-agreement
- `validUntil` equals the next Moon rāśi ingress from `elements.ts`
- Cross-check assertions: each `goodHouses` list matches its Bṛhat Saṁhitā counterpart,
  each `vedhaHouses` list matches Raman, with the Maṅgala-10th divergence pinned as an
  expected mismatch

**Not falsifiable:**
- The prose. Snapshot tests pin the text so changes are conscious. They prove
  determinism, not correctness. **No test in this suite will ever establish that a
  reading is true.**

## 9. What this tier cannot claim

Both primary sources subordinate the plain gochara result to a factor a 12-rāśi tier
structurally cannot compute:

> **Phaladīpikā 26.41** — "Planets passing through Rāśis containing more benefic dots in
> the Aṣṭakavarga produce good effect always. Even when such Rāśis happen to be the
> 12th, 6th or 8th, the effect will be good and beneficial."

> **Bṛhat Saṁhitā 104.46** — a planet "produces benefic effects only according to the
> nature of the Daśā periods."

Aṣṭakavarga needs natal positions. Vimśottarī daśā needs janma nakṣatra. A reader who
supplies only a Moon sign can furnish neither. So the shipped output is not merely a
simplified horoscope — **by both sources' own rules, the factors that would override it
are exactly the ones being omitted.**

This must be stated in the reader-facing disclaimer *in the sources' terms*, not as an
authorial hedge. It extends the README's existing stance ("treat guṇa-milan output as
one classical input among many, never a verdict") to a domain where the caveat is
sharper, and it is the reason the engine's genuine astronomical rigour must not be
allowed to imply predictive authority it does not have.

## 10. HTTP API

Following the conventions in `api/_lib.ts`:

```
GET /api/rashiphala?date=YYYY-MM-DD&place=calgary        → all twelve
GET /api/rashiphala?date=…&rashi=mesha&place=…           → one
                                        &detail=full     → + factor record
```

`Cache-Control` derives from the minimum `validUntil` across the twelve — a computed
max-age, unlike the long fixed ones the deterministic endpoints use.

Library exports added to `src/index.ts` as a new layer: `dailyRashiphala`,
`gocharaFactors`, `GOCHARA_PHALA`, and the types above.

## 11. Out of scope

- Personalised readings (needs birth data, storage, privacy decisions)
- Aṣṭakavarga (needs natal chart)
- Daśā-at-date (needs janma nakṣatra)
- Tārā bala (counts from janma nakṣatra, not janma rāśi)
- Any LLM-generated prose

A later personalised tier would reuse `gochara.ts` unchanged and add the above as
modifiers; nothing in this design forecloses it.

## 12. Risks

1. **Table transcription** (§6) is the highest-risk item and the least code-shaped. It
   is research work and should be done against print sources, not rushed.
2. **Vedha pairings are single-witness against Raman.** Bṛhat Saṁhitā cannot corroborate
   them. A shared error between Phaladīpikā's rendering and Raman's would go undetected.
3. **Prose quality is unverifiable by test** and will need human reading before ship.
4. **Reception risk**: a temple-branded horoscope carries institutional weight the
   engine's disclaimers may not offset. Worth a decision from HSNA before publishing,
   independent of whether the code is correct.
