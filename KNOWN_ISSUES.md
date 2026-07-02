# Known Issues & Deferred Nirṇaya Decisions

Festival-date (`tithi`-nirṇaya) edge cases that are **known and deliberately not
changed**, and why. Surfaced by the nirṇaya conformance audit; the clear-cut bugs
it found are already fixed (see git history). This file is the residue.

**Project decisions (set the target for everything below):**

- **Sampradāya:** **Smārta** (Drik Panchang default). A **Vaiṣṇava Ekādaśī profile**
  exists (`allRules(year, { sampradaya: "vaishnava" })` — aruṇodaya daśamī-vedha /
  Gauṇa shift); all other rules are currently sampradāya-independent.
- **Authority of record:** **Drik Panchang** — every changed date is validated
  against Drik.

**Validation baseline:** reproduces Drik Panchang exactly for 2026 at New Delhi
and Calgary (139 conformance assertions) and drops **zero** festivals across
2024–2030 at New Delhi, Calgary, New York and Sydney. The open items below do
**not** affect that baseline.

---

## Open items (deferred)

### O1. Durga Aṣṭamī precedence (Sandhi convention) — *needs Drik data + modelling*

- **What.** `durga-ashtami` uses `precedence: "max-window-fraction"` while the
  adjacent `maha-navami` uses `"udaya"` (`src/rules.ts`). They agree 2024–2027
  but diverge in 2028 (Sep 25 vs Sep 26 at New Delhi).
- **Why deferred.** Durga Aṣṭamī / Mahā Navamī day-assignment is entangled with
  the **Durga-Pūjā Sandhi** convention (Navamī observed conjoined with the
  Aṣṭamī-udaya day when the Sandhi junction falls that morning), which is not
  expressible in the generic tithi-pervasion grammar. A blind flip to udaya is
  not obviously correct and the 2028 divergence is unverified against Drik.
- **Path to fix.** Confirm Drik's 2028 Durga Aṣṭamī / Mahā Navamī dates, model
  the Sandhi rule explicitly, then unify the Aṣṭamī/Navamī precedence and
  re-validate multi-year. (A related documented +1 already exists for
  `maha-navami` in 2026, noted in `src/rules.ts`.)

### O2. Holika Dahan when Bhadra covers the entire pradoṣa — *needs Drik confirmation*

- **What.** When the Phālguna-Pūrṇimā pradoṣa is **wholly** covered by Bhadra
  (Viṣṭi karaṇa), `selectDayByPervasion` shifts the festival to the next
  Bhadra-free udaya-Pūrṇimā day → 2027 New Delhi yields Holika Mar 22 / Holi
  Mar 23. That shift target (Mar 22) is Pratipadā by pradoṣa, so it loses the
  Pūrṇimā requirement.
- **The classical rule.** Nirṇaya-Sindhu / Dharma-Sindhu keep Holika Dahan on the
  **same Pūrṇimā night**, performed during Bhadra **Pucchā** (tail) or after
  Bhadra ends, deferring only if no valid Pūrṇimā+pradoṣa slot exists. The engine
  already computes the Mukha/Pucchā split (`bhadraSplit`) but does not use Pucchā
  to retain the day.
- **Why deferred.** Published 2027 dates are **split** (Mar 21 with "Bhadra after
  midnight, evening muhūrta valid" vs Mar 22), and Drik Panchang itself is
  unreachable from CI (HTTP 403), so the authoritative date could not be
  confirmed. The engine's Bhadra computation is astronomically correct; only the
  day-retention policy is in question.
- **Path to fix.** Confirm Drik's 2027 (and one other Bhadra-heavy year) Holika
  Dahan date, then implement Bhadra-Pucchā / post-Bhadra retention on the Pūrṇimā
  night, deferring only when no Pūrṇimā-bearing pradoṣa/Pucchā slot exists.

### O3. Kṣaya-māsa (lost month) not consumed — *rare; needs the redistribution convention*

- **What.** `lunarMonth` (`src/elements.ts`) detects and flags a kṣaya month (a
  lunation with two saṅkrāntis, ~1 per 140 years), but no festival generator
  special-cases it — the dropped month name is not redistributed.
- **Status.** Very rare; the never-silently-drop fallbacks mean festivals still
  resolve in a kṣaya year, possibly with edge-case month labels. The common
  **adhika** (leap) case is handled dynamically for any year (`adhikaMonthLabel`).
- **Path to fix.** Source the kṣaya redistribution convention, consume the
  `kshaya` flag in the generators, and add a kṣaya-year regression test.


---

## Resolved

### R6. Lahiri realization recalibrated to Swiss-Ephemeris/Drik *(was O4)*

The differential ephemeris audit found the engine's Lahiri (anchor 23.853222° +
IAU 1976 precession) sat a near-constant **−13.93″** (at J2000, +0.306″/century
drift) from the Swiss Ephemeris' `SE_SIDM_LAHIRI`, shifting every saṅkrānti
instant ~5.6 min early and flipping ingress-near-midnight dates. **Decisive
datum:** Drik Panchang lists 2031 London Makar Saṅkrānti on **Jan 15**
(user-verified 2026-07-02) — the Swiss side. Recalibrated `src/ayanamsha.ts` to
anchor **23.8570923°** (Swiss `SE_SIDM_LAHIRI` at J2000.0) + the **IAU 2006
(P03)** precession series; the realization now matches Swiss to < 0.05″ over
1900–2200 and saṅkrānti instants to < 40 s. All 444 pre-existing tests
(including every Drik conformance pin) pass unchanged; the 2031
London/Sydney saṅkrānti dates are pinned in `test/multiyear-regression.test.ts`.
Post-calibration, only two ephemeris-sensitive dates remain in the 2024–2032 ×
4-city sweep, both razor-edge lunar ties needing the authority of record, not a
better ephemeris (see `EPHEMERIS_AUDIT.md`).

### R1. Ekādaśī *vṛddhi* — daśamī-vedha *(decision: keep Smārta)*

Decided **Smārta**: on an Ekādaśī live at two consecutive sunrises the engine
keeps the **earlier** udaya day (accepting daśamī-vedha, the Smārta householder
convention). Matches Drik's Smārta listing for 2026. No change to the default.
*(Update: the stricter Vaiṣṇava reckoning is now available as an opt-in profile —
`ekadashiRules(year, "vaishnava")` / `allRules(year, { sampradaya: "vaishnava" })` —
implemented as `precedence: "second"` + the `vedha` grammar clause; see
`test/vaishnava-ekadashi.test.ts`.)*

### R2. Pradoṣa window length *(confirmed correct)*

`pradosha = [sunset, sunset + 3·(D/15)]` — three **day-proportional** muhūrtas
(seasonal ~124–168 min). This uses the same proportional day/night-muhūrta
division the audit confirmed matches Drik **exactly** for madhyāhna (3rd of 5
parts), aparāhṇa (4th of 5), and niśīta (middle night-muhūrta). Drik reckons
these proportionally, not by a fixed 48-min muhūrta, so pradoṣa = 3 day-muhūrtas
is consistent; the "fixed 144 min" figure is an aggregator simplification. Matches
Drik on every tested pradoṣa-family date. No change.

### R3. Pūrvāhna window end *(confirmed correct)*

`purvahna` ends at `sunrise + 3·D/5`. Empirically matches Drik across 2024–2028
for every pūrvāhna-vyāpinī festival (Akṣaya Tṛtīyā, Vasant Pañcamī,
Ghaṭasthāpana). No change.

### R4. Vat Sāvitrī / Shani Jayanti *(fixed → daytime-vyāpti)*

These fall on Jyeṣṭha Amāvāsyā but are **not** pitṛ rites; they are day-long
observances. Now modelled on a new `daytime` ([sunrise, sunset]) window with
max-window-fraction — the day whose daylight holds the larger portion of Amāvāsyā
wins. Fixes both the sunrise rule (New Delhi 2025 May 27 → **May 26**) and the
aparāhṇa mis-selection at far-western longitudes (Calgary 2026 stays **May 16**).

### R5. Nakṣatra clause / Jayantī yoga *(by design, Smārta)*

The nakṣatra criterion (Janmāṣṭamī's Rohiṇī, `mode: "preferred"`) does not change
the Smārta date — correct for the Smārta target, where Rohiṇī is auspicious, not a
date determinant. The mechanism was cleaned up so `nakshatra.window` is honored;
`mode: "required"` exists in the grammar if a Vaiṣṇava mode or Jayantī flag is
ever wanted (out of current scope).

---

## Scope (by design)

- **Smārta** sampradāya; **pūrṇimānta** month system (amānta label derived).
- **Two genuinely disputed festivals** (real textual, not engine, divergence):
  Vat Sāvitrī (Amāvāsyā north — modelled — vs Pūrṇimā west — also modelled as
  `vat-purnima-vrat`) and Hanumān Jayantī (multiple regional dates). Handled as a
  legitimate *vyavasthā*, not resolved to a single "correct" date.

---

*When an open item is resolved, move it to Resolved and add a regression test to
`test/multiyear-regression.test.ts` so the fix cannot silently regress.*
