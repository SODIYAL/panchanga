/**
 * scripts/rp-diff.mjs — diff this engine against the Government of India
 * *Rashtriya Panchang* fixture produced by `scripts/rp-parse.mjs`.
 *
 * WHAT IS BEING COMPARED, AND WHY IT IS A FAIR TEST
 * ─────────────────────────────────────────────────
 * The RP prints, for each civil day at the Central Station of India, the aṅgas
 * running at sunrise together with the instants at which they end. That is
 * exactly `dailyPanchanga`'s contract, so the two are directly comparable with
 * no reinterpretation:
 *
 *   • CATEGORICAL — tithi number, nakṣatra index, yoga index, karaṇa name,
 *     pakṣa, and the Moon's rāśi at sunrise. A mismatch here is a real
 *     disagreement about what day it is, not a rounding artifact.
 *   • TIMING — the boundary instants (aṅga end times) and sunrise/sunset/
 *     moonrise/moonset, reported as signed minutes (engine − RP).
 *
 * NOISE FLOORS — subtract these before calling anything a bug:
 *   • The RP prints to the whole minute, so every timing carries ±30 s of
 *     quantisation on the source side alone.
 *   • RP ayanāṁśa runs ~6″ ahead of `ayanamsha()` (mean-vs-true nutation); on
 *     the Moon that is ~11 s of boundary timing, on the Sun ~6 min. Yoga, whose
 *     rate is the SUM of both, sits in between.
 *   • The engine's ephemeris (astronomy-engine) is ~1′ class; the RP derives
 *     from the Indian Astronomical Ephemeris. A residual of a minute or two on
 *     lunar boundaries is expected and is not evidence of an error.
 *
 * Categorical mismatches are the signal worth chasing. A tithi that differs by
 * one when its boundary sits within a minute of sunrise is a boundary-adjacency
 * artifact, and the report marks those separately (`near-sunrise`) so they are
 * not mistaken for systematic disagreement.
 *
 * USAGE
 *   npm run prepare
 *   node scripts/rp-diff.mjs --month 2026-05
 *   node scripts/rp-diff.mjs --from 2026-03-22 --to 2027-04-20   # whole fixture
 *   node scripts/rp-diff.mjs --month 2026-05 --verbose           # per-day table
 *
 * Options: --fixture <path>  (default test/fixtures/rp-1948.json)
 *          --json <path>     also write the full per-day diff as JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dailyPanchanga,
  grahaPositions,
  NAKSHATRA_NAMES,
  YOGA_NAMES,
  TITHI_NAMES,
  RASHI_NAMES,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The RP's adopted Central Station: 82° 30′ E, 23° 11′ N (Ujjain's latitude),
 * whose local mean time IS I.S.T. Comparing against any other location would be
 * comparing against a different book.
 */
const CENTRAL_STATION = {
  latitude: 23 + 11 / 60,
  longitude: 82.5,
  timeZone: "Asia/Kolkata",
};

/**
 * How close to sunrise a boundary must sit before a categorical mismatch is
 * written off as an adjacency artifact. ONE minute, not five: the measured
 * boundary residual across the whole fixture never exceeds 0.7 min, so anything
 * further out is several times the noise floor and deserves to be read as a
 * real disagreement.
 */
const NEAR_SUNRISE_MIN = 1;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Moonrise or moonset under the RP's own day convention.
 *
 * `dailyPanchanga.moonrise`/`.moonset` are the events inside the CIVIL day
 * (midnight → midnight); the RP prints the ones inside the SUNRISE-reckoned day
 * (sunrise D → sunrise D+1), which is why it renders a 00:07 rise as "h. 24-07"
 * under the previous date. The two agree except when the event falls between
 * midnight and sunrise — roughly a third of the month — where the RP's entry for
 * day D is the engine's entry for day D+1, and the engine reports `null` for the
 * civil day that contains no such event at all.
 *
 * Neither is wrong; they anchor the day differently. Comparing the civil-day
 * value straight against the RP therefore measures the convention gap, not
 * accuracy, so this re-buckets the engine's events into the RP's window.
 */
function lunarEventInSunriseDay(isoDate, which) {
  const dayMs = 86_400_000;
  const dayAt = (offset) => {
    const t = new Date(noonIstOf(isoDate).getTime() + offset * dayMs);
    return dailyPanchanga(t, CENTRAL_STATION);
  };
  const today = dayAt(0);
  const tomorrow = dayAt(1);
  if (!today.sunrise) return null;
  const lo = new Date(today.sunrise).getTime();
  const hi = tomorrow.sunrise ? new Date(tomorrow.sunrise).getTime() : lo + dayMs;

  const candidates = [today[which], tomorrow[which]]
    .filter(Boolean)
    .map((iso) => new Date(iso).getTime())
    .filter((t) => t >= lo && t < hi)
    .sort((a, b) => a - b);
  return candidates.length ? new Date(candidates[0]).toISOString() : null;
}

/** Signed minutes, engine − source. `null` when either side is absent. */
function deltaMinutes(engineIso, rpIso) {
  if (!engineIso || !rpIso) return null;
  return (new Date(engineIso).getTime() - new Date(rpIso).getTime()) / 60_000;
}

const fmt = (m, digits = 1) => (m === null ? "  —  " : (m >= 0 ? "+" : "") + m.toFixed(digits));

function stats(values) {
  const v = values.filter((x) => x !== null);
  if (!v.length) return null;
  const abs = v.map(Math.abs);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sorted = [...abs].sort((a, b) => a - b);
  return {
    n: v.length,
    meanSigned: mean,
    medianAbs: sorted[Math.floor(sorted.length / 2)],
    maxAbs: sorted.at(-1),
    p95Abs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
  };
}

/** Noon IST of an ISO date — a safe interior instant for naming the local day. */
const noonIstOf = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12 - 5, -30));
};

// ───────────────────────────────────────────────────────────────────────────
// Per-day comparison
// ───────────────────────────────────────────────────────────────────────────

function compareDay(rp) {
  const engine = dailyPanchanga(noonIstOf(rp.date), CENTRAL_STATION);

  const rpTithi = rp.tithi[0] ?? null;
  const rpNak = rp.nakshatra[0] ?? null;
  const rpYoga = rp.yoga[0] ?? null;
  const rpKarana = rp.karana[0] ?? null;

  // Moon's rāśi at the engine's own sunrise — the RP's "Moon: in X" is likewise
  // stated for sunrise.
  let moonRashi = null;
  if (engine.sunrise) {
    const moon = grahaPositions(new Date(engine.sunrise)).find((g) => g.graha === "Moon");
    moonRashi = moon ? moon.rashi : null;
  }

  const mismatches = [];
  const check = (field, engineVal, rpVal, label) => {
    if (rpVal === null || rpVal === undefined) return;
    if (engineVal !== rpVal) mismatches.push({ field, engine: engineVal, rp: rpVal, label });
  };

  check("tithi", engine.tithi.number, rpTithi?.number ?? null,
    `${TITHI_NAMES[engine.tithi.number - 1]}(${engine.tithi.number}) vs ${rpTithi?.rpName}(${rpTithi?.number})`);
  check("paksha", engine.month.paksha, rp.paksha,
    `${engine.month.paksha} vs ${rp.paksha}`);
  check("nakshatra", engine.nakshatra.index, rpNak?.index ?? null,
    `${NAKSHATRA_NAMES[engine.nakshatra.index]} vs ${rpNak?.rpName}`);
  check("yoga", engine.yoga.index, rpYoga?.index ?? null,
    `${YOGA_NAMES[engine.yoga.index]} vs ${rpYoga?.rpName}`);
  check("karana", engine.karana.name, rpKarana?.name ?? null,
    `${engine.karana.name} vs ${rpKarana?.rpName}`);
  check("moonRashi", moonRashi, rp.moon?.rashi ?? null,
    `${moonRashi === null ? "—" : RASHI_NAMES[moonRashi]} vs ${rp.moon?.rashi === null || rp.moon?.rashi === undefined ? "—" : RASHI_NAMES[rp.moon.rashi]}`);

  // A categorical mismatch whose boundary sits ON sunrise is an adjacency
  // artifact: both sides agree about the boundary instant and merely land on
  // opposite sides of it. See NEAR_SUNRISE_MIN for why the window is tight.
  const sunriseMs = engine.sunrise ? new Date(engine.sunrise).getTime() : null;
  const nearSunrise = (endsAt) =>
    endsAt && sunriseMs !== null
      ? Math.abs(new Date(endsAt).getTime() - sunriseMs) / 60_000 <= NEAR_SUNRISE_MIN
      : false;
  for (const m of mismatches) {
    const rpEnd = { tithi: rpTithi, nakshatra: rpNak, yoga: rpYoga, karana: rpKarana }[m.field];
    const engEnd = { tithi: engine.tithi, nakshatra: engine.nakshatra, yoga: engine.yoga, karana: engine.karana }[m.field];
    m.nearSunrise = nearSunrise(rpEnd?.endsAt) || nearSunrise(engEnd?.endsAt);
  }

  // Timing deltas are only meaningful when both sides name the same aṅga, and
  // when the RP actually printed an ending time (an "ahoratra" aṅga runs past
  // the next sunrise and carries none).
  const sameTithi = rpTithi && engine.tithi.number === rpTithi.number;
  const sameNak = rpNak && engine.nakshatra.index === rpNak.index;
  const sameYoga = rpYoga && engine.yoga.index === rpYoga.index;
  const sameKarana = rpKarana && engine.karana.name === rpKarana.name;

  return {
    date: rp.date,
    mismatches,
    delta: {
      sunrise: deltaMinutes(engine.sunrise, rp.sunrise),
      sunset: deltaMinutes(engine.sunset, rp.sunset),
      moonrise: deltaMinutes(lunarEventInSunriseDay(rp.date, "moonrise"), rp.moonrise),
      moonset: deltaMinutes(lunarEventInSunriseDay(rp.date, "moonset"), rp.moonset),
      moonriseCivilDay: deltaMinutes(engine.moonrise, rp.moonrise),
      tithiEnd: sameTithi && !rpTithi.ahoratra ? deltaMinutes(engine.tithi.endsAt, rpTithi.endsAt) : null,
      nakshatraEnd: sameNak && !rpNak.ahoratra ? deltaMinutes(engine.nakshatra.endsAt, rpNak.endsAt) : null,
      yogaEnd: sameYoga && !rpYoga.ahoratra ? deltaMinutes(engine.yoga.endsAt, rpYoga.endsAt) : null,
      karanaEnd: sameKarana && !rpKarana.ahoratra ? deltaMinutes(engine.karana.endsAt, rpKarana.endsAt) : null,
      moonIngress: rp.moon?.entersAt ? deltaMinutes(nextMoonIngressIso(engine, rp), rp.moon.entersAt) : null,
    },
    engine: {
      tithi: `${TITHI_NAMES[engine.tithi.number - 1]}(${engine.tithi.number})`,
      nakshatra: NAKSHATRA_NAMES[engine.nakshatra.index],
      yoga: YOGA_NAMES[engine.yoga.index],
      karana: engine.karana.name,
    },
    rp: {
      tithi: rpTithi ? `${rpTithi.rpName}(${rpTithi.number})` : "—",
      nakshatra: rpNak?.rpName ?? "—",
      yoga: rpYoga?.rpName ?? "—",
      karana: rpKarana?.rpName ?? "—",
    },
  };
}

/**
 * The engine has no public "next Moon rāśi ingress" yet — that is precisely what
 * the rāśiphala design's `validUntil` will need. Until it exists, bisect the
 * sidereal Moon longitude for the rāśi change, so the RP's printed ingress
 * instants can already serve as the conformance target for it.
 */
function nextMoonIngressIso(engine, rp) {
  if (!engine.sunrise) return null;
  const start = new Date(engine.sunrise).getTime();
  const moonRashiAt = (ms) => {
    const m = grahaPositions(new Date(ms)).find((g) => g.graha === "Moon");
    return m ? m.rashi : null;
  };
  const r0 = moonRashiAt(start);
  if (r0 === null) return null;
  // The RP printed an ingress on this day, so it lies within ~30 h of sunrise.
  let lo = start, hi = start + 40 * 3600_000;
  if (moonRashiAt(hi) === r0) return null;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (moonRashiAt(mid) === r0) lo = mid; else hi = mid;
  }
  return new Date(Math.round(hi)).toISOString();
}

// ───────────────────────────────────────────────────────────────────────────
// Driver
// ───────────────────────────────────────────────────────────────────────────

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function main() {
  const fixturePath = arg("fixture", join(ROOT, "test/fixtures/rp-1948.json"));
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  const month = arg("month");
  let from = arg("from"), to = arg("to");
  if (month) { from = `${month}-01`; to = `${month}-31`; }
  if (!from && !to) {
    // Default to the first whole civil month the fixture covers.
    const first = fixture.days[0].date.slice(0, 7);
    from = `${first}-01`; to = `${first}-31`;
  }

  const selected = fixture.days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  if (!selected.length) {
    console.error(`no fixture days in range ${from}…${to} (fixture covers ${fixture.days[0].date}…${fixture.days.at(-1).date})`);
    process.exit(1);
  }

  const results = selected.map(compareDay);

  console.log(`\nRashtriya Panchang 1948 S.E.  vs  panchanga engine`);
  console.log(`range   ${selected[0].date} … ${selected.at(-1).date}   (${results.length} days)`);
  console.log(`station ${CENTRAL_STATION.latitude.toFixed(4)}°N ${CENTRAL_STATION.longitude}°E  (RP Central Station, IST)\n`);

  if (flag("verbose")) {
    console.log("date        tithi                    naksh                yoga                 sunrise sunset  tEnd    nEnd    yEnd");
    console.log("─".repeat(122));
    for (const r of results) {
      const mark = r.mismatches.length ? (r.mismatches.every((m) => m.nearSunrise) ? "~" : "!") : " ";
      console.log(
        `${mark}${r.date}  ${(r.engine.tithi + " / " + r.rp.tithi).padEnd(24)} ` +
        `${(r.engine.nakshatra + " / " + r.rp.nakshatra).slice(0, 19).padEnd(20)} ` +
        `${(r.engine.yoga + " / " + r.rp.yoga).slice(0, 19).padEnd(20)} ` +
        `${fmt(r.delta.sunrise).padStart(6)} ${fmt(r.delta.sunset).padStart(6)} ` +
        `${fmt(r.delta.tithiEnd).padStart(7)} ${fmt(r.delta.nakshatraEnd).padStart(7)} ${fmt(r.delta.yogaEnd).padStart(7)}`
      );
    }
    console.log();
  }

  // ── categorical agreement ────────────────────────────────────────────────
  const FIELDS = ["tithi", "paksha", "nakshatra", "yoga", "karana", "moonRashi"];
  console.log("CATEGORICAL AGREEMENT (what day it is)");
  console.log("  field        agree   mismatch   of which near-sunrise");
  for (const f of FIELDS) {
    const ms = results.flatMap((r) => r.mismatches.filter((m) => m.field === f));
    const near = ms.filter((m) => m.nearSunrise).length;
    const agree = results.length - ms.length;
    console.log(
      `  ${f.padEnd(11)}${String(agree).padStart(5)}/${results.length}` +
      `${String(ms.length).padStart(10)}${String(near).padStart(23)}`
    );
  }

  // ── timing ───────────────────────────────────────────────────────────────
  console.log("\nBOUNDARY & RISE/SET TIMING  (minutes, engine − RP; RP is minute-rounded, so ±0.5 is floor)");
  console.log("  quantity        n   mean    median|Δ|   p95|Δ|   max|Δ|");
  const QUANTITIES = [
    ["sunrise", "sunrise"], ["sunset", "sunset"],
    ["moonrise", "moonrise"], ["moonset", "moonset"],
    ["moonrise (civil)", "moonriseCivilDay"],
    ["tithi end", "tithiEnd"], ["nakshatra end", "nakshatraEnd"],
    ["yoga end", "yogaEnd"], ["karana end", "karanaEnd"],
    ["moon ingress", "moonIngress"],
  ];
  for (const [label, key] of QUANTITIES) {
    const s = stats(results.map((r) => r.delta[key]));
    if (!s) { console.log(`  ${label.padEnd(14)}  (no comparable days)`); continue; }
    console.log(
      `  ${label.padEnd(14)}${String(s.n).padStart(4)}  ${fmt(s.meanSigned, 2).padStart(6)}` +
      `${s.medianAbs.toFixed(2).padStart(11)}${s.p95Abs.toFixed(2).padStart(9)}${s.maxAbs.toFixed(2).padStart(9)}`
    );
  }

  // ── every categorical mismatch, named ────────────────────────────────────
  const flagged = results.filter((r) => r.mismatches.length);
  if (flagged.length) {
    console.log(`\nCATEGORICAL MISMATCHES (${flagged.length} day(s))`);
    for (const r of flagged) {
      for (const m of r.mismatches) {
        console.log(`  ${r.date}  ${m.field.padEnd(10)} ${m.label}${m.nearSunrise ? `   [near-sunrise: boundary within ${NEAR_SUNRISE_MIN} min of sunrise]` : ""}`);
      }
    }
  } else {
    console.log("\nCATEGORICAL MISMATCHES: none.");
  }

  const jsonOut = arg("json");
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ station: CENTRAL_STATION, range: { from, to }, results }, null, 2));
    console.log(`\nfull per-day diff → ${jsonOut}`);
  }
  console.log();
}

main();
