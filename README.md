# panchanga

Drik Panchanga (Smārta, pūrṇimānta) engine for the [HSNA](https://hsna.ca) website.

A dependency-light TypeScript library that computes the Hindu lunisolar calendar —
the **five aṅgas** (vāra, tithi, nakṣatra, yoga, karaṇa), the lunar month, and
sidereal / ayanāṁśa values — and resolves **Hindu festival dates**, all from
astronomical first principles via
[astronomy-engine](https://github.com/cosinekitty/astronomy). No lookup tables, no
remote API.

> **Status:** pre-1.0 (`0.1.0`), under active development. The grammar and public API
> may still change.

## Features

- **The five aṅgas** — vāra (sunrise-to-sunrise weekday), tithi, nakṣatra, yoga, and
  karaṇa (including Viṣṭi / Bhadra, with its Mukha/Pucchā split and Vāsa), plus the
  pūrṇimānta / amānta lunar month with adhika (leap) and kṣaya (lost) month detection.
- **Daily pañcāṅga** — `dailyPanchanga(date, loc)` bundles all five aṅgas (each resolved
  at sunrise, with its end-time) and the day's sun/moon instants into one record.
- **Grahaṇa (eclipses)** — solar & lunar eclipse type, contact timings, local visibility,
  and sūtak windows (9h lunar / 12h solar) for any year and place.
- **Astronomy primitives** — Lahiri ayanāṁśa (IAU 1976 precession), sidereal longitudes
  and Sun rāśi, new moons, solar ingress (saṅkrānti).
- **Time & kāla windows** — timezone/DST-safe sunrise, sunset and moonrise, the muhūrta
  windows (pūrvāhna, madhyāhna, aparāhna, pradoṣa, niśīta, brahma-muhūrta, …), and the
  weekday day-part periods **Rāhu Kāla, Yamaganda, Gulika, and Abhijit**.
- **Festival engine** — a compact rule grammar (`Observance`) and a **pure, testable**
  pervasion-day selector that resolves ~195 observances to civil dates and **never
  silently drops**: every miss is explained in `diagnostics`. Selection conventions are
  first-class — `udaya` vs window-fraction precedence, a `nearest-window` fallback, an
  `adhika:"prefer-adhika"` leap-month policy, Bhadra exclusion, and nakṣatra- and
  weekday-anchored festivals (Onam, Varalakṣmī).
- **Validated at two well-separated longitudes** against Drik Panchang fixtures (2026):
  **New Delhi** and **Calgary** (the HSNA temple's city). All 24 core festivals and all
  24 in-year Ekādaśīs match Drik's Calgary calendar exactly, including the −1-day
  localisation shifts; the handful of remaining differences are convention edges, pinned
  and documented in the tests.

## Requirements

- **ESM only** (`"type": "module"`) — use `import`, not `require`.
- **Node.js ≥ 18** to consume (the build targets ES2022). Building/testing from source
  needs **Node ≥ 22.12** (Vitest 4).

## Install

```sh
npm install panchanga
```

## Quick start

### The full pañcāṅga for a day

```ts
import { dailyPanchanga } from "panchanga";
import type { GeoLocation } from "panchanga";

const newDelhi: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata", // IANA tz id
};

const p = dailyPanchanga(new Date("2026-01-23"), newDelhi);

console.log(p.date, p.vara.name);            // 2026-01-23 Shukravara
console.log(p.tithi.paksha, p.tithi.name);   // shukla Panchami
console.log(p.nakshatra.name);               // Purva Bhadrapada
console.log(p.yoga.name);                    // Parigha
console.log(p.karana.name);                  // Bava
console.log(p.month.purnimanta);             // Magha
console.log(p.muhurta.rahuKala);             // { start: "...Z", end: "...Z" } — Rāhu Kāla
```

Each running aṅga (tithi, nakṣatra, yoga, karaṇa) is the one **prevailing at sunrise**
and carries an `endsAt` (ISO-UTC) marking when it gives way to the next; the record also
includes `sunrise`, `sunset`, `moonrise`, and the day's `muhurta` windows (Rāhu Kāla,
Yamaganda, Gulika, Abhijit).

### Compute festival dates for a year and location

```ts
import { computeFestivals, allRules } from "panchanga";
import type { GeoLocation } from "panchanga";

const newDelhi: GeoLocation = {
  latitude: 28.6139,
  longitude: 77.209,
  timeZone: "Asia/Kolkata", // IANA tz id
};

const { results, diagnostics } = computeFestivals(2026, newDelhi, {
  rules: allRules(2026),
});

for (const f of results) {
  if (f.date) console.log(f.date, f.id, "—", f.monthLabel.purnimanta);
}
// 2026-01-14 makar-sankranti — Magha
// 2026-03-04 holi            — Chaitra
// 2026-04-02 hanuman-jayanti — Vaishakha
// …

// Anything that could not be resolved is explained, never dropped:
diagnostics.forEach((d) => console.warn(d));
```

Each [`FestivalResult`](src/types.ts) carries the civil `date` (`YYYY-MM-DD` in `loc`'s
timezone), a map of key `instants` (tithi start/end, window start/end, …) as ISO-UTC
strings, both month labels, and per-rule `diagnostics`.

### Read raw calendar elements at an instant

```ts
import {
  tithiBoundaries, nakshatraAt, NAKSHATRA_NAMES, karanaAt, lunarMonth,
} from "panchanga";

const when = new Date("2026-01-23T12:00:00Z");

const tithi = tithiBoundaries(when);          // { number: 1..30, start: Date, end: Date }
const nak   = NAKSHATRA_NAMES[nakshatraAt(when)];
const kar   = karanaAt(when);                 // karaṇa name
const month = lunarMonth(when, { system: "purnimanta" });

console.log(tithi.number, nak, kar, month.purnimantaLabel, month.adhika);
```

### Sidereal / ayanāṁśa

```ts
import { ayanamsha, siderealSunRashi } from "panchanga";

const t = new Date("2026-06-24T00:00:00Z");
ayanamsha(t);        // Lahiri ayanāṁśa in degrees (≈ 24.2° in 2026)
siderealSunRashi(t); // sidereal rāśi index of the Sun: 0 = Mesha … 11 = Mīna
```

## HTTP API (serverless)

For consumers that aren't JavaScript — other backends, mobile apps, no-code tools,
plain `curl` — the repo ships a tiny JSON API in [`api/`](api) that wraps the engine.
It's a set of Vercel serverless functions over a pure, unit-tested core
([`api/_lib.ts`](api/_lib.ts)), with open CORS and long `Cache-Control` headers (the
engine is deterministic, so responses cache hard at the edge).

```
GET /api/panchanga?date=YYYY-MM-DD&place=calgary      → the day's pañcāṅga
GET /api/festivals?year=2026&place=calgary            → the year's festival dates
GET /api/eclipses?year=2026&place=calgary             → grahaṇas (eclipses)
GET /api/calendar.ics?place=calgary                  → subscribable iCalendar feed
GET /api/places?q=austin                             → search the supported cities
GET /api                                              → usage + example places
```

The **`.ics` feed** is the zero-code path for end users: add the URL to Google/Apple
Calendar once and the festivals appear (and stay current — the feed defaults to a rolling
*current + next year* window). `?set=major` (default, the named festivals a temple shows),
`?set=all` (every vrata too), or `?set=core` (the 24 §4 festivals).

**Provenance & profile.** Every festival the API emits explains itself: each JSON entry
carries a one-line `basis` (the rule that decided the date — tithi, kāla window,
precedence, vedha/Bhadra clauses) and its `sampradaya`; add `detail=full` for the raw
observance rule, the key `instants` (tithi start/end, window, ingress, …) and the
engine's per-rule `notes`. Each `.ics` VEVENT carries a `DESCRIPTION` with the basis, the
local-time tithi interval, and a verify-with-your-authority note. `sampradaya=vaishnava`
(on `/api/festivals` and `/api/calendar.ics?set=all`) switches the Ekādaśī convention to
the Vaiṣṇava nirṇaya (aruṇodaya daśamī-vedha / Gauṇa shift).

**Location** is a `place` slug or explicit `lat`, `lng` & `tz`. Every **US & Canada city
of ≥10,000 people (~4,800 places)** is a slug — `calgary-ab`, `austin-tx`, `jersey-city-nj`
— generated offline from GeoNames data with [`scripts/gen-places.mjs`](scripts/gen-places.mjs)
(timezone resolved per-coordinate, so Arizona/Indiana edge cases are correct) into
[`api/places.generated.ts`](api/places.generated.ts). A **bare city name** resolves to its
largest bearer (`vancouver` → Vancouver, BC), and a few non-US/CA cities (`new-delhi`,
`mumbai`, `london`) are kept as slugs. Don't know the slug? Hit `/api/places?q=<name>`.

```sh
curl "https://<deployment>/api/festivals?year=2026&place=calgary-ab"
curl "https://<deployment>/api/places?q=springfield&country=US"   # disambiguate by state
curl "https://<deployment>/api/panchanga?date=2026-11-08&lat=51.04&lng=-114.07&tz=America/Edmonton"
```

**Deploy:** import the repo into [Vercel](https://vercel.com) (zero config — `vercel.json`
sets the build, `api/*.ts` become functions, `public/` is the landing page). Bad input
returns `400` with an `{ error }`; everything else is `200`. The handler core is
platform-agnostic, so it ports to Cloudflare Workers or any runtime with a thin adapter.

## API overview

The public surface (see [`src/index.ts`](src/index.ts)) is layered:

**1. Ayanāṁśa & sidereal** — `ayanamsha`, `siderealLongitude`, `siderealSunRashi`,
`normalize360`, `LAHIRI_ANCHOR_J2000_DEG`.

**2. Time, vāra & kāla windows** — `riseSet`, `moonrise`, `sunset`, `varaAt`,
`sunriseWindow` / `pratahkala`, `purvahna`, `madhyahna`, `aparahna`, `pradosha`,
`nishita`, `brahmaMuhurta`, `arunodaya`, `rahuKala`, `yamaganda`, `gulikaKala`,
`abhijitMuhurta`, `sankrantiPunyaKala`, plus timezone helpers (`localDayString`,
`startOfLocalDayUTC`, `nextLocalDayStartUTC`) and `VARA_NAMES`. Types: `GeoLocation`,
`TimeWindow`, `Vara`.

**3. Calendar elements** — `tithiAt`, `tithiBoundaries`, `nakshatraAt`,
`nakshatraBoundaries`, `yogaAt`, `yogaBoundaries`, `karanaAt`, `karanaIndexAt`,
`karanaName`, `karanaBoundaries`, `bhadraIntervals`, `bhadraSplit`, `elongation`,
`newMoons`, `solarIngress`, `lunarMonth`. Name tables: `TITHI_NAMES`, `NAKSHATRA_NAMES`,
`YOGA_NAMES`, `MOVABLE_KARANAS`, `LUNAR_MONTH_NAMES`.

**4. Daily aggregator** — `dailyPanchanga(date, loc)` → `DailyPanchanga` (the five aṅgas
at sunrise + sun/moon instants + month label + the day's Rāhu/Yama/Gulika/Abhijit
muhūrtas).

**4b. Grahaṇa (eclipses)** — `lunarEclipses(year, loc?)`, `solarEclipses(year, loc?)` →
eclipse type, contact phases (ISO-UTC `IsoWindow`s), local visibility, and sūtak.
Types: `LunarEclipse`, `SolarEclipse`, `GrahanKind`.

**5. Festival engine** — `computeFestivals`, `computeFestival`, `selectDayByPervasion`
(the pure selector), and the rule data: `CORE_RULES` plus the generators
`ekadashiRules`, `sankashtiRules`, `pradoshRules`, `masikShivaratriRules`,
`purnimaVratRules`, `purnimaSnanaRules`, `amavasyaRules`, `sankrantiRules`, `oneOffFestivalRules`,
`regionalFestivalRules` (each
`(year)`), `CHHATH_RULE`, and `allRules(year)`. Grammar types: `Observance`,
`FestivalRule`, `FestivalResult`, `Kala`, `TithiRef`, `Paksha`. Observance kinds
include `tithi-pervades` (with `udaya` / `max-window-fraction` precedence, an
`adhika:"prefer-adhika"` leap-month policy, and a `nearest-window` fallback),
`solar-ingress`, `moonrise`, `solar-arghya`, `derived`, `nakshatra-pervades`
(Onam), and `weekday-relative` (Varalakṣmī).

`allRules(year)` covers ~195 observances: the 24 major festivals, every Ekādaśī,
Sankaṣṭī Caturthī, Pradoṣa Vrata, Masik Śivarātri, Pūrṇimā Vrata (vrat) and Pūrṇimā
snāna-dāna, Amāvāsyā, all 12 Sankrāntis, Chhath, the HSNA one-offs (Ugadi, the Teej
trio, Nag Panchami, Rath Yatra, Tulsi Vivah, Anant Chaturdashi, …), and ~21 further
regional festivals & jayantis (Ratha Saptamī, Narasimha/Paraśurāma/Sītā/Gaṅgā jayantis,
Vat Sāvitrī, Vishwakarma, Kālī Chaudas, Onam, Varalakṣmī, …) — validated against Drik
Panchang's New Delhi and Calgary calendars (residual cases are ±1-day convention edges,
pinned in the tests).

## The rule grammar

A festival is authored as a [`FestivalRule`](src/types.ts) whose `observance.kind`
declares how its civil date is resolved:

| `kind` | Resolves by | Examples |
|---|---|---|
| `tithi-pervades` | A tithi pervading a kāla window on the chosen day, picked by a `precedence` policy (`max-window-fraction`, `udaya`, `first`, `second`). Optional `nakshatra` filter, `avoidKarana: "vishti"` (Bhadra), `adhika: "prefer-adhika"` (leap-month policy), and a `fallback` (`previous-day` / `next-day` / `nearest-window`) | most lunar festivals |
| `solar-ingress` | The Sun's sidereal ingress into a rāśi | Makar Saṅkrānti, Vishwakarma |
| `moonrise` | Tithi live at moonrise | Karva Chauth, Sankaṣṭī |
| `solar-arghya` | Tithi at sunset and the next sunrise | Chhath |
| `derived` | An offset from another festival | Holi = Holikā + 1 |
| `nakshatra-pervades` | The day a named nakṣatra is at sunrise while the Sun is in a given rāśi | Onam (Śravaṇa in Siṃha) |
| `weekday-relative` | The latest weekday before another festival's date | Varalakṣmī (Friday before Śrāvaṇa Pūrṇimā) |

`allRules(year)` returns `CORE_RULES` plus every recurring and regional observance
generated for that year (see the generators listed under **API overview → 5**).

## Scope of validation

This package computes panchanga values via `astronomy-engine` and is validated for
conformance to Drik Panchang (Smārta, pūrṇimānta) for the locations and years covered by
`test/fixtures`. It has **not** been independently verified by a traditional pandit or
Jyotisha authority — verify computed values against your local authority before ritual
use.

## Development

```sh
npm install              # install dependencies
npm test                 # vitest run — unit suites + Drik-Panchang conformance
npm run build            # tsc → dist/ (ESM .js + .d.ts + source/declaration maps)
npm run audit:ephemeris  # differential audit vs the Swiss Ephemeris → EPHEMERIS_AUDIT.md
```

The **ephemeris audit** measures every aṅga boundary and replays every festival-date
decision (2024–2032 × 4 cities) against the Swiss Ephemeris (see
[`EPHEMERIS_AUDIT.md`](EPHEMERIS_AUDIT.md)): tithi boundaries agree within 45 s and only
~0.07% of festival decisions are ephemeris-sensitive; saṅkrānti instants carry a ~6-min
Lahiri-model offset (`KNOWN_ISSUES.md` O4).

Tests live in `test/` (~370 cases): per-module unit suites plus the Drik-Panchang
conformance checks — `conformance.test.ts` (2026 New Delhi) and **five Calgary suites**
(the HSNA temple's city) whose EXPECTED dates are transcribed from Drik Panchang's Calgary
calendar (geoname-id 5913490): `conformance-calgary.test.ts` (24 core festivals),
`-vratas` (Ekādaśī, Saṅkaṣṭī, Pūrṇimā vrat & snāna, Amāvāsyā, minor Saṅkrāntis), `-oneoff`
(HSNA regional festivals) and `-regional` (21 further festivals/jayantis incl. Onam &
Varalakṣmī). All 24 core festivals and all 24 in-year Ekādaśīs match Drik Calgary exactly;
the few remaining ±1 convention edges and definitional differences are pinned and
documented. The suites also assert the **localisation invariant** — every Calgary date is
within ±1 day of New Delhi — which is what catches a wrong convention (a single locale
can't, since many conventions agree there).

## Known convention edges

Most differences from Drik Panchang are not errors — they are points where the tradition
itself admits more than one reckoning, or where the engine intentionally follows HSNA. The
ones to be aware of:

- **Pūrṇimā / Amāvāsyā — vrat vs snāna.** `purnima-vrat-*` is the *moonrise* vrat day;
  `purnima-snana-*` is the next-morning *snāna-dāna* day Drik lists as "X Purnima". At
  far-western longitudes these are usually one civil day apart — both are correct, for
  different observances.
- **Gauṇa (Vaiṣṇava) Ekādaśī — emitted via the sampradāya profile.** When an Ekādaśī is
  Daśamī-viddha at aruṇodaya, Vaiṣṇavas fast the next day ("Gauṇa"). The default (Smārta)
  listing keeps the udaya day; `allRules(year, { sampradaya: "vaishnava" })` (or
  `ekadashiRules(year, "vaishnava")`) applies the Vaiṣṇava nirṇaya — aruṇodaya
  daśamī-vedha next-day shift, later day on vṛddhi — with the same rule ids and
  "Vaishnava "-prefixed names. Two 2026 divergences (Yogini Jul 10→11, Prabodhini
  Nov 20→21 at New Delhi) are pinned against published Vaiṣṇava listings.
- **Ganga Dussehra, Balram Jayanti — definitional, follow HSNA.** Ganga Dussehra uses the
  adhika Jyeṣṭha when present (matching Drik); Balram Jayanti follows HSNA's Kṛṣṇa-Ṣaṣṭhī
  rather than Drik's Śukla-Ṣaṣṭhī.
- **Maha Navami (Durga) — Sandhi rule, +1 known diff.** Drik can place Navamī on the
  Aṣṭamī-udaya day via the Sandhi-Pūjā convention, which the generic tithi grammar does
  not express.
- **Pinned ±1 edges:** Kārtika Pūrṇimā snāna, Sarva-Pitṛ Amāvāsyā, Mithuna Saṅkrānti,
  Phulera Dooj, Hariyali Teej / Nag Panchami / Kansh Vadh (New Delhi). Each is a two-day
  tithi straddling sunrise where the day-attribution convention is genuinely borderline;
  the tests pin the produced date so any change is surfaced consciously.

## Tech stack

- **Language:** TypeScript 6 (`strict`), ES2022 target, NodeNext modules, ESM-only.
- **Runtime dependency:** [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  — the only one; provides ephemeris (Sun/Moon position, rise/set, moon-phase search,
  precession).
- **Tooling:** `tsc` for the build, [Vitest](https://vitest.dev) 4 for tests. No bundler,
  linter, or CI.

## License

MIT © 2026 Hindu Society of North America
