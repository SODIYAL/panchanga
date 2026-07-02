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

### R9. Holika Dahan / Rakhi Bhadra day-retention *(was O2)*

Implemented the classical retention rule with a rite-specific deadline, fit to
and verified against Drik: a wholly-Bhadra-covered window keeps its own day
when Bhadra clears before the deadline (`"midnight"` for the Holika night
fire, `"pradosha-end"` for daytime Rakhi — the new `bhadraDeadline` grammar
field), and shifts to the Bhadra-free udaya day only when Bhadra outlasts it.
Verified: Holika 2023 Mar 7 / 2024 Mar 24 / 2025 Mar 13 / 2026 Mar 3 and Rakhi
2023 Aug 30 / 2026 Aug 28 all match Drik — the 2026 pins discriminate the rule
(Rakhi 2026: Bhadra 21:33 vs pradoṣa-end 21:22, an 11-minute margin, shifts;
Rakhi 2023: 21:02 vs 21:18 retains). Fixed three silently wrong dates outside
the old validation envelope: Holika 2024 (Mar 25→24), Holika 2025 (Mar 14→13),
Rakhi 2023 (Aug 31→30). Regression-pinned through 2032 in
`test/multiyear-regression.test.ts`. The retained-day diagnostics point to the
`bhadra*` instants (Mukha/Pucchā split) for the muhūrta within the night.

### R8. Durga Aṣṭamī precedence unified to udaya *(was O1)*

`durga-ashtami` now uses `precedence: "udaya"`, matching `maha-navami`. The
two policies diverge only in 2028, where published India dates give Aṣṭamī
**Sep 26** + Navamī **Sep 27** — the udaya reading (`max-window-fraction`
gave Sep 25). 2024–2027 dates are unchanged by the unification and pinned.
The Sandhi-Pūjā display convention (Navamī pūjā performed at the
Aṣṭamī/Navamī junction) remains a muhūrta-level nuance, not a date selector.


### R7. Aṣṭakūṭa tables & parihāra semantics pinned to Drik *(jyotiṣa plan D3)*

Six-run end-to-end fixture campaign against Drik Panchang's Kundali Match
(`test/drik-guna-milan.test.ts`; inputs engineered mid-pada so positions could
not contaminate the table comparison — Drik's displayed Moons matched the
engine in every run, including one real-birth pair). Four corrections found,
all invisible to total-only checking:

- **Yoni** Aśva×Mūṣaka 2→**3**, Gaja×Sarpa 3→**2** (Run 1's error even
  *cancelled* against the gaṇa error in the total).
- **Gaṇa** Deva-groom×Rākṣasa-bride 1→**0** (and Manuṣya×Rākṣasa = 0,
  Rākṣasa×Deva = 1 confirmed — the published "2-point" variants are not Drik's).
- **Nāḍī parihāra restores the 8 points** (same-nakṣatra-different-pada pair
  scores 36/36 on Drik with no doṣa verdict), while the **bhakūṭa
  friendly-lords rule is advisory only** (a mutual-friends 5-9 pair still
  scores 0 with a Bhakūṭa-doṣa verdict) — the asymmetry is now encoded and
  documented in the scorer.

Also observed: Drik's tārā *labels* contradicted their own awarded points in
three runs while our count arithmetic matched the points every time — points,
not labels, are the conformance target.

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
