# Jyotiṣa extension — Kundalī, Janampatrī & Guṇa Milan

*Plan of record, 2026-07-02. Status: approved for implementation, not started.*

Extends the engine from calendar (pañcāṅga + festivals) to natal computation:
**janampatrī** (birth chart), **Vimśottarī daśā**, and **aṣṭakūṭa guṇa milan**
(marriage matching), plus the doṣa checks that matching consumes (Mangal doṣa).

## Principles (inherited from the festival engine)

1. **Deterministic computation only.** Charts, positions, scores, periods,
   doṣa flags — never interpretive/predictive prose. If HSNA wants
   significations text later, it is editorial data layered on top, not engine
   output.
2. **Provenance on every output.** Each position carries its longitude, rāśi,
   nakṣatra-pada, and a **boundary-margin** (arcmin to the nearest rāśi /
   nakṣatra edge) so a chart can say "Moon is 0.4′ from the Rohiṇī boundary —
   birth-time precision matters here" instead of silently committing.
   Every score carries its per-kūṭa breakdown; never a bare verdict.
3. **Conventions are parameters, not constants.** Node type (mean/true), like
   `sampradaya` and `nutation` before it. Defaults match Drik Panchang's
   defaults, established empirically.
4. **Authority validation, same method as festivals.** Drik Panchang is the
   authority of record; published calculators and transit listings are the
   web-verifiable fixtures; the Swiss Ephemeris differential harness
   (`scripts/ephemeris-audit.mjs`, sweph already a devDependency) validates the
   new astronomical primitives to arcseconds. The Lahiri realization is already
   calibrated to Drik (KNOWN_ISSUES R6) — natal positions inherit that.

## What already exists (why this is cheap)

| Needed for | Already in the engine |
|---|---|
| All graha longitudes | `siderealLongitude(date, body)` is generic over any `Body` (Mercury–Saturn work today) |
| Janma nakṣatra / rāśi / pada | `nakshatraAt`, `NAKSHATRA_NAMES`, calibrated ayanāṁśa |
| Pañcāṅga at birth | `tithiAt`, `yogaAt`, `karanaAt`, `varaAt` (sunrise-anchored) |
| Birth-place resolution | ~4,800 place slugs + `lat/lng/tz` in the API layer |
| Timezone-safe local time | `time.ts` helpers |
| Validation harness | sweph differential audit (has `SE_MEAN_NODE` / `SE_TRUE_NODE`) |

## Scripture-first policy (go-by-the-text)

The śāstra supplies two different things, and the policy differs by layer:

- **Positions (gaṇita)**: the Siddhāntic tradition's own directive is
  **dṛk-tulya** — computation must agree with the observed sky (bīja
  corrections exist precisely to keep tables true to observation). Using an
  accurate modern ephemeris is therefore the scripture-compliant choice, not a
  departure; it is what "Drik" in this project's name already means. The
  reference implementations (Jagannatha Hora, Parashara's Light, Drik
  Panchang) all do the same: Swiss-Ephemeris-grade positions under classical
  rules.
- **Rules (the horā layer)**: implemented from the texts, cited per rule —
  **Bṛhat Parāśara Horā Śāstra** (chart construction, bhāvas, ṣoḍaśavarga
  definitions, Vimśottarī daśā), cross-referenced with Phaladīpikā / Sārāvalī
  where BPHS is ambiguous; **Muhūrta-Cintāmaṇi lineage** for the aṣṭakūṭa
  tables. Every table and rule carries its source citation in a code comment
  (same discipline as the festival rules). Where popular software deviates
  from the text, the TEXT is the default and the deviation is an exposed
  option, documented.
- **Dual conformance**: positions validated against the Swiss Ephemeris via
  the existing differential audit (dṛk fidelity); rules validated against
  BPHS worked examples and cross-checked against Jagannatha Hora as the
  reference implementation (śāstra fidelity).

## Decision points

- **D1 — Rāhu/Ketu node type: default MEAN (scriptural), "true" as option.**
  Parāśara-era gaṇita computes the mean node; the true (osculating) node is a
  modern refinement. Drik offers both as settings, so both are implemented;
  `node?: "mean" | "true"` defaults to `"mean"`. Mean−true oscillates up to
  ±1.75°, which flips rāśi near boundaries — outputs near a boundary carry the
  usual margin provenance so the choice is visible when it matters.
- **D2 — House system: whole-sign (BPHS).** Rāśi = bhāva from lagna — the
  Parāśari convention and Drik's kundalī default. Bhāva-chalit / KP are out of
  v1 scope (documented as deviations available later).
- **D3 — Kūṭa table variants.** A few kūṭas have minor regional variants
  (vaśya groupings, yoni pair tables). Default to the Muhūrta-Cintāmaṇi
  reading, cross-checked by reproducing Drik guṇa-milan scores; any place the
  two disagree is pinned in a test and documented (festival-engine
  "convention edge" discipline).

---

## Phase 1 — Graha positions + janma facts (foundation)

New module `src/grahas.ts`:

- `GRAHAS`: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn (real bodies),
  Rāhu, Ketu (nodes; Ketu = Rāhu + 180°).
- **Mean node**: standard polynomial (Meeus ch. 47 Ω series), sidereal via the
  calibrated ayanāṁśa. **True node**: osculating node from the Moon's
  instantaneous state vector (astronomy-engine `GeoVector` + velocity), or a
  root-find on the Moon's ecliptic latitude crossing — choose by which matches
  sweph `SE_TRUE_NODE` cleanly.
- `grahaPositions(date, { node })` → per graha: sidereal longitude, rāśi,
  degree-in-rāśi, nakṣatra + pada, retrograde flag (longitude rate < 0),
  **boundaryMarginArcmin**.
- `janmaFacts(datetime, loc)` → Moon-centric facts every downstream feature
  keys on: janma rāśi, janma nakṣatra + pada, nakṣatra fraction elapsed (for
  daśā), plus tithi / yoga / karaṇa / vāra at birth (reuse).

**Validation:** extend `scripts/ephemeris-audit.mjs` with a graha section —
every graha + both node types vs sweph across 1900–2100 (target: <1′ for
planets, exact-model agreement for nodes); pin 2–3 published Rāhu/Guru transit
dates (web-verifiable, e.g. "Rahu enters Kumbha <date>"); property tests
(pada arithmetic, Ketu ≡ Rāhu+180°, rāśi = ⌊lon/30⌋).

## Phase 2 — Aṣṭakūṭa Guṇa Milan (matching MVP — ships first)

New module `src/kootas.ts` (pure lookup tables + scorer; **needs only the two
Moons**, no lagna):

| Kūṭa | Max | Basis |
|---|---|---|
| Varṇa | 1 | janma rāśi class |
| Vaśya | 2 | rāśi group compatibility |
| Tārā | 3 | nakṣatra count distance mod 9, both directions |
| Yoni | 4 | nakṣatra → 14 yoni pairs, compatibility matrix |
| Graha Maitrī | 5 | rāśi-lord friendship matrix |
| Gaṇa | 6 | nakṣatra → deva / manuṣya / rākṣasa |
| Bhakūṭa | 7 | rāśi distance (6-8 / 5-9 / 2-12 doṣa pairs) |
| Nāḍī | 8 | nakṣatra → ādi / madhya / antya |

- `gunaMilan(janmaA, janmaB)` → `{ total: n/36, kootas: [{name, max, scored,
  reason}], doshas: { nadi, bhakoota, … , cancellations: [...] } }`. Classical
  cancellation rules (nāḍī/bhakūṭa exceptions) implemented and cited — a bare
  "0 in nāḍī" without the cancellation check is the most common calculator
  error.
- Each table's classical source cited in a comment (Muhūrta-Cintāmaṇi /
  Bṛhat-Saṁhitā lineage as applicable, pinned to Drik-compatible variants).

**Validation:** unit tests asserting the tables themselves (spot values from
the classical sources); 5–10 full matches cross-checked against published
calculator outputs (web search, the Vaiṣṇava-Ekādaśī method); symmetry checks
(total(A,B) = total(B,A) for symmetric kūṭas; Tārā/Vaśya are direction-aware).

## Phase 3 — Lagna & full kundalī

New module `src/kundali.ts`:

- **Sidereal time** via astronomy-engine `SiderealTime` (GAST) + longitude →
  local ST.
- **Ascendant**: standard obliquity/latitude formula → tropical lagna →
  sidereal. Output includes `lagnaWindow`: the UTC instants the lagna
  entered/leaves the current rāśi (~2 h wide) — the honest answer to
  birth-time uncertainty.
- **Chart assembly**: whole-sign bhāvas from lagna; graha → bhāva; chandra
  lagna (Moon-chart) alongside — and as the **fallback mode when birth time is
  unknown** (a real-world case matching must support: Moon-only chart, daśā
  from Moon, no lagna-dependent outputs, clearly flagged).
- **Navāṁśa (D9)** + a generic varga divider (D2–D12 are arithmetic; only D9
  ships validated in v1).
- Guards: reject |lat| > 66° for lagna (undefined episodes) with a clear
  error; document IANA-historical-timezone reliance for old birth dates.

**Validation:** lagna vs 3–5 published example charts (well-known birth data
with published sidereal lagnas); sweph differential for the ascendant
(sweph `houses()` provides it — free cross-check); navāṁśa arithmetic
property tests.

## Phase 4 — Vimśottarī daśā

New module `src/dashas.ts`:

- Balance of first mahādaśā from the Moon's elapsed fraction of its janma
  nakṣatra (`nakshatraBoundaries` already yields the interval); 120-year
  cycle; mahādaśā → antardaśā (→ pratyantara optional) as pure arithmetic.
- Provenance: daśā start dates carry an uncertainty note when the birth Moon
  sits within ~1′ of a nakṣatra boundary (1′ ≈ up to ~9 days at the far end of
  a 20-year daśā).
- Property tests: periods sum to 120y exactly; sub-period proportionality;
  cross-check 2–3 published daśā tables.

## Phase 5 — Doṣas

New module `src/doshas.ts`:

- **Mangal (Kuja) doṣa**: Mars in bhāva 1, 2, 4, 7, 8, 12 — evaluated from
  lagna, Moon, AND Venus (all three reference points reported separately),
  with the documented classical cancellations (own/exalted sign, aspects,
  age, mutual-manglik). Output is the full evaluation, not a boolean.
- **Kāla-sarpa** flag (all grahas within the Rāhu–Ketu axis) — informational.
- `gunaMilan` gains an optional manglik-comparison section when both parties
  supply full birth data.

## Phase 6 — API, docs, release

- `GET /api/kundali?dob=YYYY-MM-DD&tob=HH:MM&place=…|lat&lng&tz&node=mean|true`
  → positions (with boundary margins), lagna + lagnaWindow, bhāvas, navāṁśa,
  janma facts, daśā periods, doṣas, provenance block. Unknown `tob` →
  Moon-chart mode.
- `GET /api/guna-milan?dob1=&tob1=&place1=&dob2=…` (or direct
  `nakshatra1=&pada1=&rashi1=…` for users who know their janma facts) → full
  breakdown; optional manglik section; disclaimer string.
- README section + KNOWN_ISSUES entries for D1–D3 outcomes; version 0.2.0.
- ICS is not applicable here; the daily-pañcāṅga endpoint is unchanged.

## Explicitly out of scope (v1)

Interpretive/predictive text; bhāva-chalit & KP houses; aṣṭakavarga; gocara
(transit) reports; muhūrta election (the kāla windows exist but election logic
is its own project); South-Indian 10-poruttam matching (same table pattern —
natural v2 once the aṣṭakūṭa frame exists); Sarvatobhadra etc.

## Sequencing & estimates

| Step | Contents | Ships |
|---|---|---|
| 1 | Phase 1 + 2 | **Matching MVP**: `janmaFacts` + `gunaMilan` + `/api/guna-milan` |
| 2 | Phase 3 + 4 | **Full kundalī**: lagna, chart, navāṁśa, daśā + `/api/kundali` |
| 3 | Phase 5 + 6 | Doṣas, manglik comparison, docs, 0.2.0 |

Each step lands as its own PR with its validation suite; the graha/node
differential-audit extension lands with step 1 (it gates everything).

## Risks

- **True-node implementation** is the only genuinely fiddly astronomy; the
  sweph cross-check bounds the risk (we know the target to arcseconds).
- **Kūṭa table variants** can silently differ between published calculators;
  mitigated by pinning to Drik's own guṇa-milan outputs and citing sources
  per table.
- **Product sensitivity**: matching output influences real decisions.
  Mitigations are structural: breakdown-always, cancellations computed, the
  existing verify-with-your-authority disclaimer, and no verdict-only output
  shape anywhere in the API.
