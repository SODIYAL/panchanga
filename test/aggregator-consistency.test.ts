/**
 * Raw-aṅga wiring check (review #15). The daily aggregator's running aṅgas were
 * previously only range-checked or self-checked. Here, across several days, the
 * aggregator's tithi/nakṣatra/yoga/karaṇa (index, name, and end-time) must
 * EXACTLY equal the standalone boundary functions evaluated at the resolved
 * sunrise. Those boundary functions are in turn validated against Drik Panchang
 * fixtures in elements.test.ts, so this transitively pins the aggregator's
 * aṅgas to an external reference and catches anchor / off-by-one / name-table
 * wiring bugs that a range-check would miss.
 *
 * (External yoga/karaṇa fixtures for arbitrary days would strengthen this
 * further, but require Drik Panchang data not reachable from this environment.)
 */

import { describe, it, expect } from "vitest";
import { dailyPanchanga } from "../src/panchanga.js";
import {
  tithiBoundaries,
  nakshatraBoundaries,
  yogaBoundaries,
  karanaBoundaries,
  TITHI_NAMES,
  NAKSHATRA_NAMES,
  YOGA_NAMES,
} from "../src/elements.js";
import type { GeoLocation } from "../src/types.js";

const NEW_DELHI: GeoLocation = { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" };

describe("dailyPanchanga ⟷ element functions (raw-aṅga consistency)", () => {
  // A spread of months so a season-dependent wiring bug can't hide.
  const days = ["2026-01-23", "2026-04-19", "2026-07-29", "2026-10-11", "2026-12-20"];

  for (const ymd of days) {
    it(`aṅgas match the boundary functions at sunrise on ${ymd}`, () => {
      const p = dailyPanchanga(new Date(`${ymd}T06:00:00Z`), NEW_DELHI);
      const sr = new Date(p.sunrise!);
      const tb = tithiBoundaries(sr);
      const nb = nakshatraBoundaries(sr);
      const yb = yogaBoundaries(sr);
      const kb = karanaBoundaries(sr);

      expect(p.tithi.number).toBe(tb.number);
      expect(p.tithi.name).toBe(TITHI_NAMES[tb.number - 1]);
      expect(p.tithi.endsAt).toBe(tb.end.toISOString());

      expect(p.nakshatra.index).toBe(nb.index);
      expect(p.nakshatra.name).toBe(NAKSHATRA_NAMES[nb.index]);
      expect(p.nakshatra.endsAt).toBe(nb.end.toISOString());

      expect(p.yoga.index).toBe(yb.index);
      expect(p.yoga.name).toBe(YOGA_NAMES[yb.index]);
      expect(p.yoga.endsAt).toBe(yb.end.toISOString());

      expect(p.karana.index).toBe(kb.index);
      expect(p.karana.name).toBe(kb.name);
      expect(p.karana.endsAt).toBe(kb.end.toISOString());
    });
  }
});
