# panchanga

Drik Panchanga (Smārta, pūrṇimānta) engine for the [HSNA](https://hsna.ca) website.

A dependency-light TypeScript library that computes the Hindu lunisolar calendar —
**tithi, nakshatra, karaṇa, the lunar month, and sidereal / ayanāṁśa values** — and
resolves **Hindu festival dates**, all from astronomical first principles via
[astronomy-engine](https://github.com/cosinekitty/astronomy). No lookup tables, no
remote API.

> **Status:** pre-1.0 (`0.0.0`), under active development. The grammar and public API
> may still change.

## Features

- **Calendar elements** — tithi, nakshatra, karaṇa (including Viṣṭi / Bhadra), and the
  pūrṇimānta / amānta lunar month with adhika (leap) and kṣaya (lost) month detection.
- **Astronomy primitives** — Lahiri ayanāṁśa (IAU 1976 precession), sidereal longitudes
  and Sun rāśi, new moons, solar ingress (saṅkrānti).
- **Time & kāla windows** — timezone/DST-safe sunrise, sunset and moonrise, plus the
  muhūrta windows (pūrvāhna, madhyāhna, aparāhna, pradoṣa, niśīta, brahma-muhūrta, …).
- **Festival engine** — a compact rule grammar (`Observance`) and a **pure, testable**
  pervasion-day selector that resolves each festival to a civil date and **never silently
  drops**: every miss is explained in `diagnostics`.
- **Validated** against Drik Panchang fixtures (2026, New Delhi).

## Requirements

- **ESM only** (`"type": "module"`) — use `import`, not `require`.
- **Node.js ≥ 18** to consume (the build targets ES2022). Building/testing from source
  needs **Node ≥ 22.12** (Vitest 4).

## Install

```sh
npm install panchanga
```

## Quick start

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

**2. Time & kāla windows** — `riseSet`, `moonrise`, `sunset`, `sunriseWindow` /
`pratahkala`, `purvahna`, `madhyahna`, `aparahna`, `pradosha`, `nishita`,
`brahmaMuhurta`, `sankrantiPunyaKala`, plus timezone helpers (`localDayString`,
`startOfLocalDayUTC`, `nextLocalDayStartUTC`). Types: `GeoLocation`, `TimeWindow`.

**3. Calendar elements** — `tithiAt`, `tithiBoundaries`, `nakshatraAt`,
`nakshatraBoundaries`, `karanaAt`, `karanaIndexAt`, `karanaName`, `bhadraIntervals`,
`elongation`, `newMoons`, `solarIngress`, `lunarMonth`. Name tables: `TITHI_NAMES`,
`NAKSHATRA_NAMES`, `MOVABLE_KARANAS`, `LUNAR_MONTH_NAMES`.

**4. Festival engine** — `computeFestivals`, `computeFestival`, `selectDayByPervasion`
(the pure selector), and the rule data `CORE_RULES`, `ekadashiRules(year)`,
`sankashtiRules(year)`, `CHHATH_RULE`, `allRules(year)`. Grammar types: `Observance`,
`FestivalRule`, `FestivalResult`, `Kala`, `TithiRef`, `Paksha`.

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

Tests live in `test/` (~150 cases): per-module unit suites plus `conformance.test.ts`,
which checks the 2026 New Delhi festival set against Drik Panchang fixtures.

## Tech stack

- **Language:** TypeScript 6 (`strict`), ES2022 target, NodeNext modules, ESM-only.
- **Runtime dependency:** [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  — the only one; provides ephemeris (Sun/Moon position, rise/set, moon-phase search,
  precession).
- **Tooling:** `tsc` for the build, [Vitest](https://vitest.dev) 4 for tests. No bundler,
  linter, or CI.

## License

MIT © 2026 Hindu Society of North America
