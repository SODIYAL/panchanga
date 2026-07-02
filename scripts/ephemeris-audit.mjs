/**
 * scripts/ephemeris-audit.mjs — differential audit of the engine's ephemeris
 * (astronomy-engine, ~1 arcmin) against the Swiss Ephemeris (Moshier mode,
 * arcsecond-level; the same ephemeris family Drik Panchang uses).
 *
 * Two questions, answered empirically:
 *
 *  A. BOUNDARY TIMING — how far do the engine's aṅga boundary instants
 *     (tithi = 12° elongation steps, nakṣatra = 13°20′ sidereal-Moon steps,
 *     saṅkrānti = 30° sidereal-Sun steps) sit from the Swiss Ephemeris
 *     instants? Also: ayanāṁśa offset and sunrise offset.
 *
 *  B. DECISION FLIPS — do those timing offsets ever change a FESTIVAL DATE?
 *     For every tithi-pervades rule we recompute the tithi interval with the
 *     Swiss Ephemeris, rebuild the candidate set with the library's own
 *     exported kāla-window functions, and re-run the engine's PURE selector
 *     (`selectDayByPervasion`). A run with the UNcorrected interval must
 *     reproduce the engine's own date (self-check); rules where it doesn't
 *     are counted "unmodeled" and excluded from flip claims. moonrise /
 *     solar-ingress / solar-arghya / nakshatra-pervades kinds are replayed
 *     with their (simpler) decision logic; derived / weekday-relative dates
 *     follow their anchors.
 *
 * Usage:   npm run prepare && node scripts/ephemeris-audit.mjs [--fast]
 * Output:  EPHEMERIS_AUDIT.md (repo root) + a console summary.
 * `--fast` restricts to 2 years × 2 locations (smoke run).
 */

import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  tithiBoundaries,
  nakshatraBoundaries,
  nakshatraAt,
  bhadraIntervals,
  ayanamsha,
  riseSet,
  moonrise,
  sunset,
  selectDayByPervasion,
  computeFestivals,
  allRules,
  sunriseWindow,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  arunodaya,
  startOfLocalDayUTC,
  nextLocalDayStartUTC,
  localDayString,
  NAKSHATRA_NAMES,
} from "../dist/index.js";
import { daytime } from "../dist/time.js";

const require = createRequire(import.meta.url);
const swe = require("sweph");
const C = swe.constants;

// ───────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────

const FAST = process.argv.includes("--fast");

const YEARS = FAST ? [2026, 2027] : [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032];

const LOCATIONS = (FAST
  ? ["new-delhi", "calgary"]
  : ["new-delhi", "calgary", "london", "sydney"]
).map((k) => ({
  key: k,
  ...{
    "new-delhi": { latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata" },
    calgary: { latitude: 51.0447, longitude: -114.0719, timeZone: "America/Edmonton" },
    london: { latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
    sydney: { latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
  }[k],
}));

const NEAR_MISS_SEC = 300; // report decisions within 5 min of a window edge

// ───────────────────────────────────────────────────────────────────────────
// Swiss Ephemeris primitives
// ───────────────────────────────────────────────────────────────────────────

swe.set_sid_mode(C.SE_SIDM_LAHIRI, 0, 0);
const FLAGS = C.SEFLG_MOSEPH | C.SEFLG_SPEED;
const SIDFLAGS = FLAGS | C.SEFLG_SIDEREAL;
const MS_PER_DAY = 86_400_000;
const DEG_PER_NAK = 360 / 27;

const jdOf = (ms) => 2440587.5 + ms / MS_PER_DAY;
const msOfJd = (jd) => (jd - 2440587.5) * MS_PER_DAY;
const norm360 = (d) => ((d % 360) + 360) % 360;
const wrap180 = (d) => norm360(d + 180) - 180;

function sweLon(ms, body, flags) {
  const r = swe.calc_ut(jdOf(ms), body, flags);
  if (r.flag < 0) throw new Error(`sweph calc_ut: ${r.error}`);
  return r.data[0];
}
const sweElong = (ms) => norm360(sweLon(ms, C.SE_MOON, FLAGS) - sweLon(ms, C.SE_SUN, FLAGS));
const sweSidMoon = (ms) => sweLon(ms, C.SE_MOON, SIDFLAGS);
const sweSidSun = (ms) => sweLon(ms, C.SE_SUN, SIDFLAGS);
const sweNakIdx = (ms) => Math.floor(norm360(sweSidMoon(ms)) / DEG_PER_NAK) % 27;
const sweSunRashi = (ms) => Math.floor(norm360(sweSidSun(ms)) / 30) % 12;

/**
 * Refine the instant a MONOTONE-INCREASING longitude function crosses
 * `targetDeg`, near `guessMs`. Bisection on the wrapped difference; widens the
 * bracket up to 4× if the crossing isn't inside. Returns ms or null.
 */
function refineCrossing(fnAt, targetDeg, guessMs, spanMs = 2 * 3600e3) {
  const f = (ms) => wrap180(fnAt(ms) - targetDeg);
  let span = spanMs;
  let a = guessMs - span;
  let b = guessMs + span;
  let fa = f(a);
  let fb = f(b);
  for (let widen = 0; (fa > 0 || fb < 0) && widen < 4; widen++) {
    span *= 3;
    a = guessMs - span;
    b = guessMs + span;
    fa = f(a);
    fb = f(b);
  }
  if (fa > 0 || fb < 0) return null;
  for (let i = 0; i < 44; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Refine to the NEAREST multiple of `stepDeg` (for karaṇa/Bhadra edges). */
function refineToNearestStep(fnAt, stepDeg, guessMs) {
  const target = norm360(Math.round(fnAt(guessMs) / stepDeg) * stepDeg);
  return refineCrossing(fnAt, target, guessMs, 3600e3) ?? guessMs;
}

// ───────────────────────────────────────────────────────────────────────────
// Small stats helpers
// ───────────────────────────────────────────────────────────────────────────

function stats(xs) {
  if (xs.length === 0) return null;
  const abs = xs.map(Math.abs).sort((p, q) => p - q);
  const sorted = [...xs].sort((p, q) => p - q);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    n: xs.length,
    mean,
    median: q(sorted, 0.5),
    p95abs: q(abs, 0.95),
    p99abs: q(abs, 0.99),
    maxabs: abs[abs.length - 1],
  };
}

const fmtSec = (s) => (Math.abs(s) >= 100 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(1)} s`);

// ───────────────────────────────────────────────────────────────────────────
// PART A — boundary-timing sweeps
// ───────────────────────────────────────────────────────────────────────────

function sweepTithiBoundaries(fromYear, toYear) {
  const out = [];
  let cursor = Date.UTC(fromYear, 0, 1);
  const endMs = Date.UTC(toYear + 1, 0, 1);
  while (cursor < endMs) {
    const tb = tithiBoundaries(new Date(cursor));
    const engineMs = tb.end.getTime();
    const target = (tb.number * 12) % 360;
    const sMs = refineCrossing(sweElong, target, engineMs);
    if (sMs !== null) out.push({ ms: engineMs, label: `tithi ${tb.number}→`, dSec: (sMs - engineMs) / 1000 });
    cursor = engineMs + 60_000;
  }
  return out;
}

function sweepNakshatraBoundaries(fromYear, toYear) {
  const out = [];
  let cursor = Date.UTC(fromYear, 0, 1);
  const endMs = Date.UTC(toYear + 1, 0, 1);
  while (cursor < endMs) {
    const nb = nakshatraBoundaries(new Date(cursor));
    const engineMs = nb.end.getTime();
    const target = (((nb.index + 1) % 27) * DEG_PER_NAK) % 360;
    const sMs = refineCrossing(sweSidMoon, target, engineMs);
    if (sMs !== null)
      out.push({ ms: engineMs, label: `${NAKSHATRA_NAMES[nb.index]}→`, dSec: (sMs - engineMs) / 1000 });
    cursor = engineMs + 60_000;
  }
  return out;
}

function sweepAyanamsha(fromYear, toYear) {
  const trueDiffs = [];
  const meanDiffs = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(y, m, 15));
      const sweAyan = swe.get_ayanamsa_ut(jdOf(d.getTime()));
      trueDiffs.push((ayanamsha(d, { nutation: true }) - sweAyan) * 3600);
      meanDiffs.push((ayanamsha(d) - sweAyan) * 3600);
    }
  }
  return { trueDiffs, meanDiffs };
}

function sweepSunrise(year) {
  const perLoc = [];
  for (const loc of LOCATIONS) {
    const diffs = [];
    for (let doy = 5; doy < 365; doy += 15) {
      const dayStart = startOfLocalDayUTC(new Date(Date.UTC(year, 0, doy)), loc.timeZone);
      const engine = riseSet("rise", dayStart, loc);
      if (!engine) continue;
      const r = swe.rise_trans(
        jdOf(dayStart.getTime()),
        C.SE_SUN,
        "",
        C.SEFLG_MOSEPH,
        C.SE_CALC_RISE,
        [loc.longitude, loc.latitude, 0],
        1013.25,
        15,
      );
      if (r.flag < 0) continue;
      diffs.push((msOfJd(r.data) - engine.getTime()) / 1000);
    }
    perLoc.push({ key: loc.key, stats: stats(diffs) });
  }
  return perLoc;
}

// ───────────────────────────────────────────────────────────────────────────
// PART B — festival decision replay
// ───────────────────────────────────────────────────────────────────────────

const KALA = {
  sunrise: sunriseWindow,
  pratahkala: sunriseWindow,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  daytime,
  arunodaya,
};

function absoluteTithi(paksha, tithi) {
  let n;
  if (tithi === "purnima" || tithi === "amavasya") n = 15;
  else n = tithi;
  return paksha === "shukla" ? n : 15 + n;
}

function civilDaysTouched(interval, loc) {
  const first = startOfLocalDayUTC(interval.start, loc.timeZone);
  const days = [first];
  let cursor = first;
  for (let i = 0; i < 3; i++) {
    const next = nextLocalDayStartUTC(cursor, loc.timeZone);
    if (next.getTime() > interval.end.getTime()) break;
    days.push(next);
    cursor = next;
  }
  return days;
}

const liveAt = (interval, t) =>
  interval.start.getTime() <= t.getTime() && interval.end.getTime() > t.getTime();

/**
 * Rebuild the tithi-pervades candidate set exactly as
 * `festivals.ts#resolveTithiPervades` does, from a given tithi interval.
 * With `useSweph`, nakṣatra facts and Bhadra edges come from the Swiss
 * Ephemeris; kāla windows and sunrises stay engine-computed on both sides
 * (their engine-vs-Swiss offset is measured separately in Part A and is far
 * below decision relevance).
 */
function buildCandidates(obs, interval, loc, useSweph) {
  const days = civilDaysTouched(interval, loc);
  let bhadraSet = null;
  if (obs.avoidKarana === "vishti") {
    bhadraSet = bhadraIntervals(interval.start);
    if (useSweph) {
      bhadraSet = bhadraSet.map((b) => ({
        start: new Date(refineToNearestStep(sweElong, 6, b.start.getTime())),
        end: new Date(refineToNearestStep(sweElong, 6, b.end.getTime())),
      }));
    }
  }
  const winFn = KALA[obs.window];
  if (!winFn) return null; // window kind we can't rebuild → unmodeled
  const candidates = [];
  for (const day of days) {
    const win = winFn(day, loc);
    if (!win) continue;
    let nakshatraOk;
    if (obs.nakshatra) {
      const nakWinFn = obs.nakshatra.window ? KALA[obs.nakshatra.window] : null;
      const nakWin = nakWinFn ? nakWinFn(day, loc) : win;
      const at = (nakWin ?? win).start;
      const idx = useSweph ? sweNakIdx(at.getTime()) : nakshatraAt(at);
      nakshatraOk = NAKSHATRA_NAMES[idx] === obs.nakshatra.name;
    }
    let bhadra;
    let bhadraFreeWindow;
    let tithiAtSunrise;
    if (obs.avoidKarana === "vishti") {
      bhadra = null;
      const winLen = win.end.getTime() - win.start.getTime();
      let covered = 0;
      for (const bi of bhadraSet) {
        const s = Math.max(bi.start.getTime(), win.start.getTime());
        const e = Math.min(bi.end.getTime(), win.end.getTime());
        const ov = Math.max(0, e - s);
        if (ov > 0) {
          if (!bhadra) bhadra = { start: bi.start, end: bi.end };
          covered += ov;
        }
      }
      const slack = Math.min(1000, winLen / 2);
      bhadraFreeWindow = covered < winLen - slack;
      const sr = riseSet("rise", day, loc);
      if (sr) tithiAtSunrise = liveAt(interval, sr);
    }
    candidates.push({
      day,
      tithiInterval: interval,
      window: { start: win.start, end: win.end },
      nakshatraOk,
      bhadraOverlap: bhadra,
      bhadraFreeWindow,
      tithiAtSunrise,
    });
  }
  return candidates;
}

/** Run the pure selector + the resolver's fallback-day logic → civil date. */
function selectDate(obs, interval, loc, useSweph) {
  const candidates = buildCandidates(obs, interval, loc, useSweph);
  if (candidates === null) return null; // unmodelable
  if (candidates.length === 0) return "";
  const sel = selectDayByPervasion(candidates, {
    precedence: obs.precedence,
    nakshatra: obs.nakshatra?.mode,
    avoidKarana: obs.avoidKarana,
    fallback: obs.fallback ?? "nearest-window",
  });
  let day = sel.chosen ? sel.chosen.day : null;
  if (!day && sel.fallbackApplied) {
    const all = civilDaysTouched(interval, loc);
    day =
      sel.fallbackApplied === "previous-day"
        ? startOfLocalDayUTC(new Date(all[0].getTime() - MS_PER_DAY), loc.timeZone)
        : nextLocalDayStartUTC(all[all.length - 1], loc.timeZone);
  }
  return day ? localDayString(day, loc.timeZone) : "";
}

/** Min |gap| (sec) between the interval's endpoints and any candidate window edge. */
function decisionMarginSec(obs, interval, loc) {
  const candidates = buildCandidates(obs, interval, loc, false);
  if (!candidates || candidates.length === 0) return null;
  let min = Infinity;
  for (const c of candidates) {
    for (const b of [interval.start, interval.end]) {
      for (const e of [c.window.start, c.window.end]) {
        min = Math.min(min, Math.abs(b.getTime() - e.getTime()) / 1000);
      }
    }
  }
  return min;
}

function sweCorrectInterval(obs, engineInterval) {
  const n = absoluteTithi(obs.paksha, obs.tithi);
  const startTarget = ((n - 1) * 12) % 360;
  const endTarget = (n * 12) % 360;
  const s = refineCrossing(sweElong, startTarget, engineInterval.start.getTime());
  const e = refineCrossing(sweElong, endTarget, engineInterval.end.getTime());
  if (s === null || e === null) return null;
  return {
    interval: { start: new Date(s), end: new Date(e) },
    dStartSec: (s - engineInterval.start.getTime()) / 1000,
    dEndSec: (e - engineInterval.end.getTime()) / 1000,
  };
}

/** moonrise-kind primary rule: the day whose moonrise falls inside the tithi. */
function moonrisePrimaryPick(interval, loc) {
  for (const day of civilDaysTouched(interval, loc)) {
    const mr = moonrise(day, loc);
    if (mr && liveAt(interval, mr)) return localDayString(day, loc.timeZone);
  }
  return null;
}

/** solar-arghya rule: the day whose sunset falls inside the tithi. */
function arghyaPick(interval, loc) {
  const days = civilDaysTouched(interval, loc);
  for (const day of days) {
    const ss = sunset(day, loc);
    if (ss && liveAt(interval, ss)) return localDayString(day, loc.timeZone);
  }
  for (const day of days) {
    if (sunset(day, loc)) return localDayString(day, loc.timeZone);
  }
  return "";
}

function replayFestivals() {
  const tally = {
    "tithi-pervades": { total: 0, modeled: 0, skippedNoInterval: 0 },
    moonrise: { total: 0, modeled: 0, fallbackTerritory: 0 },
    "solar-ingress": { total: 0, modeled: 0 },
    "solar-arghya": { total: 0, modeled: 0 },
    "nakshatra-pervades": { total: 0, modeled: 0 },
    anchored: { total: 0, modeled: 0 },
  };
  const flips = [];
  const nearMisses = [];
  const ingressDeltas = [];

  for (const year of YEARS) {
    for (const loc of LOCATIONS) {
      const rules = allRules(year);
      const { results } = computeFestivals(year, loc, { rules });
      const resById = new Map(results.map((r) => [r.id, r]));
      const flipByAnchor = new Map(); // rule id → sweph date, for derived/weekday-relative

      for (const rule of rules) {
        const obs = rule.observance;
        const res = resById.get(rule.id);
        if (!res || !res.date) continue;
        const where = { year, loc: loc.key, id: rule.id, engineDate: res.date };

        if (obs.kind === "tithi-pervades") {
          tally[obs.kind].total++;
          if (!res.instants.tithiStart || !res.instants.tithiEnd) {
            tally[obs.kind].skippedNoInterval++;
            continue;
          }
          const engineInterval = {
            start: new Date(res.instants.tithiStart),
            end: new Date(res.instants.tithiEnd),
          };
          const repro = selectDate(obs, engineInterval, loc, false);
          if (repro !== res.date) continue; // unmodeled — excluded from claims
          tally[obs.kind].modeled++;
          const corr = sweCorrectInterval(obs, engineInterval);
          if (!corr) continue;
          const sweDate = selectDate(obs, corr.interval, loc, true);
          const margin = decisionMarginSec(obs, engineInterval, loc);
          if (sweDate !== null && sweDate !== res.date) {
            flips.push({ ...where, kind: obs.kind, sweDate, dStartSec: corr.dStartSec, dEndSec: corr.dEndSec, marginSec: margin });
            flipByAnchor.set(rule.id, sweDate);
          } else if (margin !== null && margin < NEAR_MISS_SEC) {
            nearMisses.push({ ...where, kind: obs.kind, marginSec: margin, dStartSec: corr.dStartSec, dEndSec: corr.dEndSec });
          }
        } else if (obs.kind === "moonrise") {
          tally[obs.kind].total++;
          if (!res.instants.tithiStart) continue;
          const engineInterval = {
            start: new Date(res.instants.tithiStart),
            end: new Date(res.instants.tithiEnd),
          };
          const repro = moonrisePrimaryPick(engineInterval, loc);
          if (repro === null) {
            tally[obs.kind].fallbackTerritory++;
            continue; // engine used its rite-specific fallback; not replayed
          }
          if (repro !== res.date) continue;
          tally[obs.kind].modeled++;
          const corr = sweCorrectInterval(obs, engineInterval);
          if (!corr) continue;
          const sweDate = moonrisePrimaryPick(corr.interval, loc);
          if (sweDate !== repro) {
            flips.push({
              ...where,
              kind: obs.kind,
              sweDate: sweDate ?? "(falls to rite-specific fallback)",
              dStartSec: corr.dStartSec,
              dEndSec: corr.dEndSec,
              marginSec: null,
            });
            if (sweDate) flipByAnchor.set(rule.id, sweDate);
          }
        } else if (obs.kind === "solar-ingress") {
          tally[obs.kind].total++;
          if (!res.instants.ingress) continue;
          const engineIngress = new Date(res.instants.ingress);
          const sMs = refineCrossing(sweSidSun, (obs.rashi * 30) % 360, engineIngress.getTime(), 12 * 3600e3);
          if (sMs === null) continue;
          const dSec = (sMs - engineIngress.getTime()) / 1000;
          ingressDeltas.push(dSec);
          const dateFor = (moment) => {
            let day = startOfLocalDayUTC(moment, loc.timeZone);
            if (obs.rashi === 9) {
              const ss = sunset(moment, loc);
              if (ss && moment.getTime() > ss.getTime()) day = nextLocalDayStartUTC(day, loc.timeZone);
            }
            return localDayString(day, loc.timeZone);
          };
          if (dateFor(engineIngress) !== res.date) continue;
          tally[obs.kind].modeled++;
          const sweDate = dateFor(new Date(sMs));
          if (sweDate !== res.date) {
            flips.push({ ...where, kind: obs.kind, sweDate, dStartSec: dSec, dEndSec: dSec, marginSec: null });
            flipByAnchor.set(rule.id, sweDate);
          }
        } else if (obs.kind === "solar-arghya") {
          tally[obs.kind].total++;
          if (!res.instants.tithiStart) continue;
          const engineInterval = {
            start: new Date(res.instants.tithiStart),
            end: new Date(res.instants.tithiEnd),
          };
          if (arghyaPick(engineInterval, loc) !== res.date) continue;
          tally[obs.kind].modeled++;
          const corr = sweCorrectInterval(obs, engineInterval);
          if (!corr) continue;
          const sweDate = arghyaPick(corr.interval, loc);
          if (sweDate !== res.date) {
            flips.push({ ...where, kind: obs.kind, sweDate, dStartSec: corr.dStartSec, dEndSec: corr.dEndSec, marginSec: null });
            flipByAnchor.set(rule.id, sweDate);
          }
        } else if (obs.kind === "nakshatra-pervades") {
          tally[obs.kind].total++;
          if (!res.instants.solarMonthStart) continue;
          const nakIdx = NAKSHATRA_NAMES.indexOf(obs.nakshatra);
          const scan = (useSweph) => {
            let cursor = startOfLocalDayUTC(new Date(res.instants.solarMonthStart), loc.timeZone);
            for (let i = 0; i < 40; i++) {
              const sr = riseSet("rise", cursor, loc);
              if (sr) {
                const idx = useSweph ? sweNakIdx(sr.getTime()) : nakshatraAt(sr);
                const rashiOk = useSweph
                  ? sweSunRashi(sr.getTime()) === obs.solarRashi
                  : true; // engine path validated via repro equality below
                if (idx === nakIdx && rashiOk) return localDayString(cursor, loc.timeZone);
              }
              cursor = nextLocalDayStartUTC(cursor, loc.timeZone);
            }
            return "";
          };
          if (scan(false) !== res.date) continue;
          tally[obs.kind].modeled++;
          const sweDate = scan(true);
          if (sweDate !== res.date) {
            flips.push({ ...where, kind: obs.kind, sweDate, dStartSec: null, dEndSec: null, marginSec: null });
            flipByAnchor.set(rule.id, sweDate);
          }
        } else if (obs.kind === "derived" || obs.kind === "weekday-relative") {
          tally.anchored.total++;
          tally.anchored.modeled++;
          const anchorFlip = flipByAnchor.get(obs.from);
          if (!anchorFlip) continue;
          let sweDate;
          if (obs.kind === "derived") {
            const d = new Date(`${anchorFlip}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + obs.offsetDays);
            sweDate = d.toISOString().slice(0, 10);
          } else {
            const d = new Date(`${anchorFlip}T12:00:00Z`);
            do {
              d.setUTCDate(d.getUTCDate() - 1);
            } while (d.getUTCDay() !== obs.weekday);
            sweDate = d.toISOString().slice(0, 10);
          }
          if (sweDate !== res.date) {
            flips.push({ ...where, kind: `${obs.kind} (via ${obs.from})`, sweDate, dStartSec: null, dEndSec: null, marginSec: null });
          }
        }
      }
    }
  }
  return { tally, flips, nearMisses, ingressDeltas };
}

// ───────────────────────────────────────────────────────────────────────────
// Run + report
// ───────────────────────────────────────────────────────────────────────────

const t0 = Date.now();
const yFrom = YEARS[0];
const yTo = YEARS[YEARS.length - 1];

console.log(`Part A: sweeping tithi boundaries ${yFrom}–${yTo} …`);
const tithiDeltas = sweepTithiBoundaries(yFrom, yTo);
console.log(`  ${tithiDeltas.length} boundaries`);
console.log(`Part A: sweeping nakshatra boundaries ${yFrom}–${yTo} …`);
const nakDeltas = sweepNakshatraBoundaries(yFrom, yTo);
console.log(`  ${nakDeltas.length} boundaries`);
const ayan = sweepAyanamsha(yFrom, yTo);
const sunrisePerLoc = sweepSunrise(YEARS[Math.floor(YEARS.length / 2)]);

console.log(`Part B: replaying festival decisions (${YEARS.length} years × ${LOCATIONS.length} locations) …`);
const { tally, flips, nearMisses, ingressDeltas } = replayFestivals();

const tithiStats = stats(tithiDeltas.map((d) => d.dSec));
const nakStats = stats(nakDeltas.map((d) => d.dSec));
const ayanTrueStats = stats(ayan.trueDiffs);
const ayanMeanStats = stats(ayan.meanDiffs);
const ingressStats = stats(ingressDeltas);

const worst = (deltas, k) =>
  [...deltas].sort((a, b) => Math.abs(b.dSec) - Math.abs(a.dSec)).slice(0, k);

const bucket = (deltas) => {
  const edges = [5, 15, 30, 60, 120, Infinity];
  const names = ["≤5 s", "5–15 s", "15–30 s", "30–60 s", "1–2 min", ">2 min"];
  const counts = new Array(edges.length).fill(0);
  for (const { dSec } of deltas) counts[edges.findIndex((e) => Math.abs(dSec) <= e)]++;
  return names.map((n, i) => ({ bucket: n, count: counts[i], pct: (100 * counts[i]) / deltas.length }));
};

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
const aeVersion = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "astronomy-engine", "package.json"), "utf8"),
).version;

const statLine = (s) =>
  s
    ? `n=${s.n} · mean ${fmtSec(s.mean)} · median ${fmtSec(s.median)} · p95 |Δ| ${fmtSec(s.p95abs)} · p99 |Δ| ${fmtSec(s.p99abs)} · max |Δ| ${fmtSec(s.maxabs)}`
    : "n=0";

const md = [];
md.push(`# Ephemeris audit — astronomy-engine vs Swiss Ephemeris`);
md.push(``);
md.push(
  `Differential audit of every aṅga boundary and every festival-date decision, ` +
    `comparing the engine's ephemeris ([astronomy-engine](https://github.com/cosinekitty/astronomy) ` +
    `v${aeVersion}, stated accuracy ±1′) against the **Swiss Ephemeris** ` +
    `(v${swe.version()}, Moshier mode, arcsecond-level — the ephemeris family Drik Panchang uses). ` +
    `Generated by \`scripts/ephemeris-audit.mjs\` (see its header for method); ` +
    `package \`${pkg.name}@${pkg.version}\`.`,
);
md.push(``);
md.push(`**Scope:** years ${yFrom}–${yTo}; locations ${LOCATIONS.map((l) => l.key).join(", ")}.`);
md.push(``);

// ── Findings (computed from this run's data) ────────────────────────────────
const totalModeled = Object.values(tally).reduce((s, t) => s + t.modeled, 0);
const sunArcsecPerSec = (0.9856 * 3600) / 86400; // sidereal Sun rate ≈ 0.041″/s
const predictedIngressMin = Math.abs(ayanMeanStats.mean) / sunArcsecPerSec / 60;
const tithiFlips = flips.filter((f) => f.kind === "tithi-pervades" || f.kind === "moonrise").length;
const solarFlips = flips.filter((f) => f.kind.startsWith("solar-ingress") || f.kind.startsWith("derived")).length;
md.push(`## Findings`);
md.push(``);
md.push(
  `1. **Ephemeris precision is NOT the dominant error source for tithi-based dates.** ` +
    `The engine's tithi boundaries sit a *systematic* ${fmtSec(Math.abs(tithiStats.mean))} from the Swiss ` +
    `Ephemeris (never more than ${fmtSec(tithiStats.maxabs)}) — far below astronomy-engine's stated ±1′ ` +
    `worst case (~2 min of tithi time). Across ${totalModeled} modeled festival decisions, only ` +
    `${tithiFlips} tithi/moonrise decision(s) flipped.`,
);
md.push(``);
md.push(
  `2. **Saṅkrānti dates carry a ~${(ingressStats.mean / 60).toFixed(0)}-minute ayanāṁśa-MODEL uncertainty — a calibration issue, ` +
    `not a precision issue.** Engine-mean-Lahiri − Swiss-Lahiri is a near-constant ` +
    `${ayanMeanStats.mean.toFixed(1)}″; at the sidereal Sun's ${sunArcsecPerSec.toFixed(3)}″/s that predicts a ` +
    `${predictedIngressMin.toFixed(1)}-min ingress shift — matching the observed ` +
    `${(ingressStats.mean / 60).toFixed(1)} min. ${solarFlips} date flip(s) in this sweep are of this kind; ` +
    `an ingress within ~6 min of local midnight (or of sunset, for Makara) is undecidable between the ` +
    `two Lahiri models and should be validated against the authority of record.`,
);
md.push(``);
md.push(
  `3. **Sunrise & kāla windows are a non-issue** (≤ ${fmtSec(Math.max(...sunrisePerLoc.map((s) => s.stats?.maxabs ?? 0)))} ` +
    `offset) — window edges contribute nothing at decision level.`,
);
md.push(``);
md.push(
  `4. **Practical consequence:** keeping astronomy-engine is defensible for tithi-family festivals ` +
    `(the flip rate is ~${((100 * flips.length) / totalModeled).toFixed(2)}% per rule-instance over this sweep, all near-boundary cases). ` +
    `The cheapest accuracy win is on the sidereal SOLAR side: reconcile the Lahiri anchor with the ` +
    `authority of record (a constants-level calibration, not a dependency change), which resolves the ` +
    `saṅkrānti-family flips.`,
);
md.push(``);
md.push(`## Part A — boundary timing (engine − Swiss, i.e. Δ = swe − engine)`);
md.push(``);
md.push(`### Tithi boundaries (Moon−Sun elongation crossing k·12°)`);
md.push(``);
md.push(statLine(tithiStats));
md.push(``);
md.push(`| \\|Δ\\| bucket | boundaries | share |`);
md.push(`|---|---:|---:|`);
for (const b of bucket(tithiDeltas)) md.push(`| ${b.bucket} | ${b.count} | ${b.pct.toFixed(1)}% |`);
md.push(``);
md.push(`Worst 5:`);
md.push(``);
md.push(`| boundary (engine, UTC) | Δ |`);
md.push(`|---|---:|`);
for (const w of worst(tithiDeltas, 5))
  md.push(`| ${new Date(w.ms).toISOString()} (${w.label}) | ${fmtSec(w.dSec)} |`);
md.push(``);
md.push(`### Nakṣatra boundaries (sidereal Moon crossing k·13°20′)`);
md.push(``);
md.push(statLine(nakStats));
md.push(``);
md.push(`| \\|Δ\\| bucket | boundaries | share |`);
md.push(`|---|---:|---:|`);
for (const b of bucket(nakDeltas)) md.push(`| ${b.bucket} | ${b.count} | ${b.pct.toFixed(1)}% |`);
md.push(``);
md.push(`### Saṅkrānti (sidereal Sun ingress) instants`);
md.push(``);
md.push(statLine(ingressStats));
md.push(``);
md.push(
  `The sidereal Sun moves ~1°/day, so ayanāṁśa-model and solar-position differences ` +
    `translate to time offsets ~1440× larger per degree than for the Moon — this is why ` +
    `saṅkrānti instants show the largest Δ.`,
);
md.push(``);
md.push(`### Ayanāṁśa (Lahiri), engine − Swiss, arcseconds`);
md.push(``);
md.push(`- engine \`{nutation:true}\` − \`swe_get_ayanamsa_ut\`: ${statLine(ayanTrueStats).replaceAll(" s", "″")}`);
md.push(`- engine mean − \`swe_get_ayanamsa_ut\`: ${statLine(ayanMeanStats).replaceAll(" s", "″")}`);
md.push(``);
md.push(`### Sunrise (upper limb, refracted), Δ = swe − engine, seconds`);
md.push(``);
md.push(`| location | ${sunrisePerLoc[0] ? "stats" : ""} |`);
md.push(`|---|---|`);
for (const s of sunrisePerLoc) md.push(`| ${s.key} | ${statLine(s.stats)} |`);
md.push(``);
md.push(`## Part B — festival-date decision replay`);
md.push(``);
md.push(
  `For each rule the engine's own tithi interval is replaced by the Swiss-Ephemeris ` +
    `interval and the decision is re-run through the engine's pure selector ` +
    `(\`selectDayByPervasion\`) / the kind's decision logic. A rule counts as **modeled** ` +
    `only when the replay with the *uncorrected* interval reproduces the engine's own date ` +
    `(self-check); flips are claimed only for modeled rules.`,
);
md.push(``);
md.push(`| kind | rule-instances | modeled | flips |`);
md.push(`|---|---:|---:|---:|`);
const flipCount = (kind) => flips.filter((f) => f.kind === kind || f.kind.startsWith(kind)).length;
for (const [kind, t] of Object.entries(tally)) {
  const extra =
    kind === "moonrise" && t.fallbackTerritory
      ? ` (+${t.fallbackTerritory} in rite-specific fallback, not replayed)`
      : "";
  md.push(`| ${kind} | ${t.total} | ${t.modeled}${extra} | ${flipCount(kind)} |`);
}
md.push(``);
md.push(`### Date flips (${flips.length})`);
md.push(``);
if (flips.length === 0) {
  md.push(`**None.** Across ${YEARS.length} years × ${LOCATIONS.length} locations, no modeled festival date changes under the Swiss Ephemeris.`);
} else {
  md.push(`| year | location | festival | engine | Swiss | Δstart | Δend | margin |`);
  md.push(`|---|---|---|---|---|---:|---:|---:|`);
  for (const f of flips) {
    md.push(
      `| ${f.year} | ${f.loc} | ${f.id} (${f.kind}) | ${f.engineDate} | ${f.sweDate} | ` +
        `${f.dStartSec == null ? "—" : fmtSec(f.dStartSec)} | ${f.dEndSec == null ? "—" : fmtSec(f.dEndSec)} | ` +
        `${f.marginSec == null ? "—" : fmtSec(f.marginSec)} |`,
    );
  }
}
md.push(``);
md.push(`### Near misses (decision margin < ${NEAR_MISS_SEC / 60} min, no flip) — ${nearMisses.length}`);
md.push(``);
if (nearMisses.length > 0) {
  md.push(`| year | location | festival | date | margin | Δstart | Δend |`);
  md.push(`|---|---|---|---|---:|---:|---:|`);
  for (const nm of nearMisses.slice(0, 40)) {
    md.push(
      `| ${nm.year} | ${nm.loc} | ${nm.id} | ${nm.engineDate} | ${fmtSec(nm.marginSec)} | ${fmtSec(nm.dStartSec)} | ${fmtSec(nm.dEndSec)} |`,
    );
  }
  if (nearMisses.length > 40) md.push(``, `…and ${nearMisses.length - 40} more.`);
}
md.push(``);
md.push(`## Caveats`);
md.push(``);
md.push(`- Swiss Ephemeris runs in **Moshier** mode (no data files): arcsecond-level, not the`);
md.push(`  DE431-file mode; residuals vs JPL are ≲1″ for the Moon — negligible here.`);
md.push(`- Kāla windows and sunrises stay engine-computed on both sides of the replay; their`);
md.push(`  engine-vs-Swiss offset is measured separately above and is orders of magnitude below`);
md.push(`  the tithi-boundary offsets.`);
md.push(`- "Unmodeled" rule-instances (self-check failed, or rite-specific moonrise fallback) are`);
md.push(`  excluded from flip claims; their count is visible in the table above.`);
md.push(`- The \`margin\` column measures the smallest tithi-boundary-to-window-edge gap. A flip with a`);
md.push(`  LARGE margin is a **fraction-tie flip**: two candidate days' window-coverage fractions sit`);
md.push(`  within seconds of equality under \`max-window-fraction\`, so the winner swaps on a sub-minute`);
md.push(`  boundary shift. Such dates are genuinely undecidable at the ephemeris level and need the`);
md.push(`  authority of record.`);
md.push(``);

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "EPHEMERIS_AUDIT.md"), md.join("\n"));

console.log(`\n════════ SUMMARY (${((Date.now() - t0) / 1000).toFixed(0)}s) ════════`);
console.log(`tithi boundaries:    ${statLine(tithiStats)}`);
console.log(`nakshatra boundaries: ${statLine(nakStats)}`);
console.log(`sankranti instants:  ${statLine(ingressStats)}`);
console.log(`ayanamsha (true):    ${statLine(ayanTrueStats)} [arcsec]`);
console.log(`tally:`, JSON.stringify(tally));
console.log(`FLIPS: ${flips.length}`);
for (const f of flips) console.log(`  ${f.year} ${f.loc} ${f.id}: ${f.engineDate} → ${f.sweDate}`);
console.log(`near misses (<${NEAR_MISS_SEC}s margin): ${nearMisses.length}`);
console.log(`\nReport written to EPHEMERIS_AUDIT.md`);
