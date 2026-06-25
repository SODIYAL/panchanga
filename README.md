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
  pervasion-day selector that resolves each festival to a civil date and **never silently
  drops**: every miss is explained in `diagnostics`.
- **Validated** against Drik Panchang fixtures (2026) for **New Delhi and Calgary** —
  the latter confirming the engine localises festival dates correctly (Calgary's
  sunrise/moonrise-driven −1-day shifts match Drik Panchang's Calgary calendar).

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

`allRules(year)` covers ~160 observances: the 24 major festivals, every Ekādaśī,
Sankaṣṭī Caturthī, Pradoṣa Vrata, Masik Śivarātri, Pūrṇimā Vrata, Amāvāsyā, all 12
Sankrāntis, Chhath, and ~22 regional festivals/jayantis (Ugadi, the Teej trio, Nag
Panchami, Rath Yatra, Tulsi Vivah, Anant Chaturdashi, …) — validated against the HSNA
2026 calendar (residual cases are ±1-day convention edges, pinned in the tests).

## The rule grammar

A festival is authored as a [`FestivalRule`](src/types.ts) whose `observance.kind`
declares how its civil date is resolved:

| `kind` | Resolves by | Examples |
|---|---|---|
| `tithi-pervades` | A tithi pervading a kāla window on the chosen day, picked by a `precedence` policy (`max-window-fraction`, `udaya`, `first`, `second`); optional `nakshatra` filter and `avoidKarana: "vishti"` (Bhadra) | most lunar festivals |
| `solar-ingress` | The Sun's sidereal ingress into a rāśi | Makar Saṅkrānti |
| `moonrise` | Tithi live at moonrise | Karva Chauth, Sankaṣṭī |
| `solar-arghya` | Tithi at sunset and the next sunrise | Chhath |
| `derived` | An offset from another festival | Holi = Holikā + 1 |

`allRules(year)` returns the `CORE_RULES` plus the recurring **Ekādaśī**, **Sankaṣṭī
Caturthī**, and **Chhath** observances generated for that year.

## Scope of validation

This package computes panchanga values via `astronomy-engine` and is validated for
conformance to Drik Panchang (Smārta, pūrṇimānta) for the locations and years covered by
`test/fixtures`. It has **not** been independently verified by a traditional pandit or
Jyotisha authority — verify computed values against your local authority before ritual
use.

## Development

```sh
npm install      # install dependencies
npm test         # vitest run — unit suites + Drik-Panchang conformance
npm run build    # tsc → dist/ (ESM .js + .d.ts + source/declaration maps)
```

Tests live in `test/` (~370 cases): per-module unit suites plus the Drik-Panchang
conformance checks — `conformance.test.ts` (2026 New Delhi) and, for Calgary (the HSNA
temple's city), three suites whose EXPECTED dates are transcribed from Drik Panchang's
Calgary calendar (geoname-id 5913490): `conformance-calgary.test.ts` (24 core festivals),
`conformance-calgary-vratas.test.ts` (Ekādaśī, Saṅkaṣṭī, Pūrṇimā, Amāvāsyā, minor
Saṅkrāntis) and `conformance-calgary-oneoff.test.ts` (regional festivals & jayantis). All
24 in-year Ekādaśīs and 23/24 core festivals match Drik Calgary exactly; the handful of
±1 localisation edges and definitional differences are pinned and documented. The suites
also assert the localisation invariant (every Calgary date within ±1 day of New Delhi).

## Tech stack

- **Language:** TypeScript 6 (`strict`), ES2022 target, NodeNext modules, ESM-only.
- **Runtime dependency:** [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  — the only one; provides ephemeris (Sun/Moon position, rise/set, moon-phase search,
  precession).
- **Tooling:** `tsc` for the build, [Vitest](https://vitest.dev) 4 for tests. No bundler,
  linter, or CI.

## License

MIT © 2026 Hindu Society of North America
