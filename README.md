# panchanga

Drik Panchanga (Smārta, pūrṇimānta) engine for the [HSNA](https://hsna.ca) site.

Computes the five limbs of the Hindu calendar — tithi, vara, nakshatra, yoga, and karana — from astronomical first principles via [astronomy-engine](https://github.com/cosinekitty/astronomy).

## Scope of validation

This package computes panchanga values via `astronomy-engine` and is validated for conformance to Drik Panchang (Smārta, pūrṇimānta) for the locations and years covered by `test/fixtures`. It has **not** been independently verified by a traditional pandit or Jyotisha authority — verify computed values against your local authority before ritual use.

## Usage

```ts
import { PANCHANGA_VERSION } from "panchanga";
```

(Full API will be added in Phase 1 — astronomy primitives.)

## License

MIT © 2026 Hindu Society of North America
