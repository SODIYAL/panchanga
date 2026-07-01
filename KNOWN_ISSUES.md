# Known Issues & Deferred Nirṇaya Decisions

This file tracks the festival-date (`tithi`-nirṇaya) edge cases that are **known,
deliberately not "fixed"**, and the reasons why. They fall into three buckets:

1. **Deferred decisions** — require a maintainer choice (sampradāya / convention)
   before a correct implementation is possible.
2. **Unconfirmed conventions** — the engine currently matches Drik Panchang for
   every tested year, but the underlying *definition* is convention-dependent and
   an authoritative source could not be confirmed; changing it risks regressions.
3. **Documented limitations** — genuinely rare or low-impact cases left for later.

Everything here was surfaced by the nirṇaya conformance audit. The clear-cut bugs
found in that audit have already been fixed (see the git history); this file is
only the residue that needs judgement, confirmation, or scope expansion.

**Validation baseline:** the engine reproduces Drik Panchang exactly for 2026 at
New Delhi and Calgary (139 conformance assertions), and — after the audit fixes —
drops **zero** festivals across 2024–2030 at New Delhi, Calgary, New York and
Sydney. The items below do **not** affect that baseline.

---

## 1. Deferred decisions (need a maintainer choice)

### 1.1 Ekādaśī *vṛddhi* — daśamī-vedha vs plain udaya (Smārta ↔ Vaiṣṇava)

- **What.** When an Ekādaśī is live at **two** consecutive sunrises (*vṛddhi*),
  the engine takes the **earlier** day (`precedence: "udaya"` in
  `src/rules.ts` `ekadashiRules`, whose udaya tie-break keeps the earlier day).
- **The contested rule.** The classical *daśamī-vedha* rule rejects an Ekādaśī
  whose dawn (aruṇodaya, ~96 min before sunrise) is still occupied by Daśamī and
  moves the observance to the **later** day. Whether this applies is
  **sampradāya-dependent**: a Smārta householder may *accept* daśamī-vedha and
  keep the first udaya day, while Vaiṣṇavas insist on the śuddhā (later) day.
- **Evidence.** Confirmed true-vṛddhi divergences vs some published dates:
  Nirjala 2024 New Delhi (engine Jun 17 vs some sources Jun 18), Rāma Ekādaśī
  2024 New Delhi (Oct 27↔28), Kāmadā 2024 Calgary (Apr 18↔19), Pārśva/
  Parivartinī 2027 Calgary (Sep 10↔11). One independent verifier **rejected**
  the "must take the later day" framing as not-Smārta; another confirmed the
  underlying gap. The engine matches Drik 2026 exactly with the current rule.
- **Why deferred.** The *direction* of the fix depends entirely on which
  sampradāya column the engine targets. Shipping the aruṇodaya daśamī-vedha test
  blindly could make the engine *less* correct for its stated Smārta target.
- **Path to fix.** Decide the target: (a) **Smārta-strict** (keep current), (b)
  **apply daśamī-vedha** (aruṇodaya test → later day) validated against Drik's
  Smārta column, or (c) add a **Vaiṣṇava mode** flag and implement both. The
  aruṇodaya window already exists (`src/time.ts` `arunodaya`), so option (b)/(c)
  is mechanically small once the policy is chosen.
- **Note.** *Kṣaya* (no-sunrise) Ekādaśī is already handled correctly — Yoginī
  2026 (skips both sunrises) resolves to Jul 10 via the nearest-window fallback,
  matching Drik.

### 1.2 Durga Aṣṭamī precedence (Sandhi convention)

- **What.** `durga-ashtami` uses `precedence: "max-window-fraction"` while the
  adjacent `maha-navami` uses `"udaya"` (`src/rules.ts`). The two agree
  2024–2027 but diverge in 2028 (Sep 25 vs Sep 26 at New Delhi).
- **Why deferred.** Durga Aṣṭamī / Mahā Navamī day-assignment is entangled with
  the **Durga-Pūjā Sandhi** convention (Navamī observed conjoined with the
  Aṣṭamī-udaya day when the Sandhi junction falls that morning), which is not
  expressible in the generic tithi-pervasion grammar. A blind flip to udaya is
  not obviously correct, and the 2028 divergence is unverified against Drik.
- **Path to fix.** Model the Sandhi rule explicitly (a Durga-Pūjā-specific
  selector), then unify the Aṣṭamī/Navamī precedence and re-validate multi-year.
  A related documented +1 already exists for `maha-navami` in 2026 (Drik's
  Navamī-conjoined-with-Aṣṭamī day), noted in `src/rules.ts`.

---

## 2. Unconfirmed conventions (matches Drik today; definition uncertain)

### 2.1 Holika Dahan when Bhadra covers the entire pradoṣa

- **What.** When the Phālguna-Pūrṇimā pradoṣa is **wholly** covered by Bhadra
  (Viṣṭi karaṇa), `selectDayByPervasion` shifts the festival to the next
  Bhadra-free udaya-Pūrṇimā day. In 2027 New Delhi this yields Holika Mar 22 /
  Holi Mar 23.
- **The classical rule.** Nirṇaya-Sindhu / Dharma-Sindhu keep Holika Dahan on the
  **same Pūrṇimā night**, performed during Bhadra **Pucchā** (tail) or after
  Bhadra ends, deferring to the next day only if no valid Pūrṇimā+pradoṣa slot
  exists. The engine already *computes* the Mukha/Pucchā split (`bhadraSplit`)
  but does not use Pucchā to retain the day; and its shift target (Mar 22) is
  Pratipadā by pradoṣa, so it loses the Pūrṇimā requirement.
- **Why deferred.** Published 2027 dates are **split** (Mar 21 with "Bhadra after
  midnight, evening muhūrta valid" vs Mar 22), and Drik Panchang itself could not
  be fetched (HTTP 403) to settle it. The engine's Bhadra computation is
  astronomically correct; only the *day-retention policy* is in question.
- **Path to fix.** Implement Bhadra-Pucchā / post-Bhadra retention on the Pūrṇimā
  night, deferring only when no Pūrṇimā-bearing pradoṣa/Pucchā slot exists;
  validate against Drik for a Bhadra-heavy year.

### 2.2 Pradoṣa window length (seasonal vs fixed)

- **What.** `pradosha` = `[sunset, sunset + 3·(D/15)]` in `src/time.ts` — three
  **seasonal** day-muhūrtas, so the window breathes 134–148 min with day length.
- **The question.** Several sources define Pradoṣa Kāl as a **fixed ~144 min**
  (3 × 48-min muhūrtas); the two agree only near the equinox. On a short winter
  day a tithi ending in the boundary band could tip Pradoṣa Vrat / Holika /
  Dhanteras by a day.
- **Status.** Matches Drik for all tested 2026 dates (sunset is exact; no
  boundary case landed in the gap). The other kāla windows were audited and are
  definitionally correct to the minute (madhyāhna = 3rd of 5 day-parts, aparāhṇa
  = 4th, niśīta = middle night-muhūrta). Drik's exact pradoṣa method is
  convention-dependent and unconfirmed, so this is left unchanged.
- **Path to fix.** Confirm Drik's published pradoṣa definition; if fixed-144-min,
  switch and re-validate the pradoṣa-family conformance.

### 2.3 Pūrvāhna window end (3·D/5 vs D/2)

- **What.** `purvahna` ends at `sunrise + 3·D/5` (`src/time.ts`), a value the code
  comment admits was calibrated to make Akṣaya Tṛtīyā 2026 land on Drik's day,
  rather than Drik's stated "sunrise → midday" (= D/2).
- **Status.** Empirically matches Drik across 2024–2028 (Akṣaya Tṛtīyā, Vasant
  Pañcamī), so low risk, but it is a fitted value, not a definition — a latent
  risk near the noon boundary in untested years.
- **Path to fix.** Confirm Drik's pūrvāhna definition; if D/2, switch and
  re-validate the pūrvāhna-family (Akṣaya Tṛtīyā, Vasant Pañcamī, Ghaṭasthāpana).

---

## 3. Documented limitations

### 3.1 Vat Sāvitrī / Shani Jayanti daytime-vyāpti

- **What.** These fall on Jyeṣṭha Amāvāsyā but are **not** pitṛ rites (unlike
  Sarva-Pitṛ, which was correctly moved to aparāhṇa). Their true nirṇaya —
  "Amāvāsyā, joined to the preceding Caturdaśī, prevailing through the daytime" —
  is not captured cleanly by either a sunrise or an aparāhṇa window at all
  longitudes (aparāhṇa mis-selects at far-western longitudes, where the
  late-afternoon window clips only the *start* of an evening-beginning Amāvāsyā).
- **Status.** Kept on the **sunrise** reckoning, which matches Drik Calgary. The
  residual is a New Delhi ±1 in years where Amāvāsyā begins mid-morning (2025:
  engine May 27 vs May 26). Documented in `src/rules.ts` (the `A()` helper).
- **Path to fix.** Add a dedicated "tithi prevails through the daytime" selector
  (e.g. present at aparāhṇa **or** at midday of the day it begins), validated at
  both an eastern and a far-western longitude.

### 3.2 Kṣaya-māsa (lost month) not consumed

- **What.** `lunarMonth` (`src/elements.ts`) detects and flags a kṣaya month (a
  lunation containing two saṅkrāntis, ~1 per 140 years), but no festival
  generator special-cases it — the dropped month name is not redistributed.
- **Status.** Very rare; the never-silently-drop fallbacks mean festivals still
  resolve in a kṣaya year, possibly with edge-case month labels. `adhikaMonthLabel`
  now handles the common **adhika** (leap) case dynamically for any year.
- **Path to fix.** Consume the `kshaya` flag in the generators (source the
  redistribution convention first) and add a kṣaya-year regression test.

### 3.3 Nakṣatra clause is latent for the Smārta ruleset

- **What.** The nakṣatra criterion (Janmāṣṭamī's Rohiṇī) is `mode: "preferred"`,
  whose tie-break fires only on a near-exact window-fraction tie between two days
  whose niśīta is covered — practically never (only one night's niśīta is ever
  covered). So Rohiṇī never changes the Smārta date.
- **Status.** Correct for the Smārta target (Rohiṇī is auspicious, not a date
  determinant). The mechanism was cleaned up so `nakshatra.window` is honored, but
  it remains latent by design. It cannot currently express **Jayantī** yoga
  (Aṣṭamī + Rohiṇī at niśīta) or a Vaiṣṇava Rohiṇī-required rule.
- **Path to fix.** Add a `mode: "required"` nakṣatra rule (already supported by
  the grammar and evaluator) if/when a Vaiṣṇava mode or a Jayantī flag is wanted.

---

## 4. Scope (by design, not a bug)

- **Sampradāya:** Smārta (Drik Panchang default). No Vaiṣṇava / ISKCON mode — the
  grammar (`required` nakṣatra, aruṇodaya window) can support one, but no
  Vaiṣṇava rule set is authored. Ekādaśī and Janmāṣṭamī are the festivals where a
  Vaiṣṇava mode would most differ (see §1.1, §3.3).
- **Month system:** Pūrṇimānta primary; the amānta label is derived. Amānta-first
  regional calendars are not separately published.
- **Two genuinely disputed festivals** (real textual, not engine, divergence):
  Vat Sāvitrī (Amāvāsyā north vs Pūrṇimā west — both are modelled as separate
  rules) and Hanumān Jayantī (multiple regional dates). These are handled as a
  legitimate *vyavasthā*, not resolved to a single "correct" date.

---

*Generated from the tithi-nirṇaya conformance audit. When an item here is
resolved, remove it and add a regression test to `test/multiyear-regression.test.ts`
(cross-year / cross-longitude) so the fix cannot silently regress.*
