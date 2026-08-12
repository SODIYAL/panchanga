/**
 * scripts/rp-parse.mjs — parse the Government of India *Rashtriya Panchang*
 * (Positional Astronomy Centre, IMD) into a machine-readable daily fixture.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every conformance suite in this repo so far checks the engine against either
 * itself or Drik Panchang. The Rashtriya Panchang is a third, independent,
 * governmental authority computed from the Indian Astronomical Ephemeris — so a
 * diff against it is genuine external conformance, not self-agreement.
 *
 * WHAT THE SOURCE SAYS ABOUT ITSELF (Explanation, pp. v–vi) — all of this is
 * load-bearing for anyone comparing against the output:
 *
 *   • CENTRAL STATION. Every timing is for the adopted Central Station of India:
 *     82° 30′ E, 23° 11′ N (Ujjain's latitude). Its local mean time is exactly
 *     I.S.T. (UT+5:30). These are NOT timings for any particular city.
 *   • SUNRISE-RECKONED DAY. "Tithis etc. which start after this time of sunrise
 *     and end before the time of next sunrise have been shown under that day" —
 *     the same udaya convention as `dailyPanchanga`.
 *   • HOURS PAST 24. "Timings that continue beyond 24h … have been indicated as
 *     25h, 26h etc., meaning 1AM, 2AM etc of the next day." So `h. 27-26` is
 *     03:26 IST on the FOLLOWING Gregorian date. Handled in `parseIst`.
 *   • AYANAMSA. Nakshatra/yoga use the "increasing ayanamsa" whose initial point
 *     is the vernal equinox of 285 A.D., pinned as tropical 23° 15′ 00″ at 0h on
 *     21 March 1956 — i.e. Chitrapaksha/Lahiri, the same family as
 *     `src/ayanamsha.ts`, but NOT bit-identical (see KNOWN OFFSETS below).
 *   • AHORATRA. A tithi/nakshatra/yoga running from before sunrise to past the
 *     next sunrise is printed as "ahoratra" with no ending time. Recorded here
 *     as `{ endsAt: null, ahoratra: true }`.
 *
 * KNOWN OFFSETS (do not treat as engine bugs without re-deriving):
 *   • The RP states ayanamsa 24° 13′ 30″ on 1 Chaitra 1948 S.E. (22 Mar 2026);
 *     `ayanamsha()` gives 24° 13′ 24″ there — ~6″, consistent with a mean-vs-true
 *     (nutation) difference rather than an error. 6″ of Moon motion ≈ 11 s.
 *   • Printed times are rounded to the whole minute, so a ±30 s quantisation
 *     floor is baked into every boundary comparison.
 *
 * COVERAGE. 13 national-calendar months, Chaitra 1948 S.E. → Chaitra 1949 S.E.
 * (~22 Mar 2026 – Apr 2027): 395 day entries, one Saka year plus a repeated
 * Chaitra so a full nirayana year is available.
 *
 * USAGE
 *   node scripts/rp-parse.mjs "RP 1948 SE Final.pdf" [--out test/fixtures/rp-1948.json]
 *   node scripts/rp-parse.mjs extracted.txt --out ...
 *
 * A .pdf input is run through `pdftotext -layout` (poppler); a .txt input is
 * read directly, so the fixture can be regenerated without poppler installed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ───────────────────────────────────────────────────────────────────────────
// The source's own vocabulary
//
// Mapped BY INDEX, never by fuzzy string similarity: the RP's transliteration
// differs from the engine's in ways no normaliser gets right by rule (Mrigasiras
// / Mrigashira, Satabhisaj / Shatabhisha, Viskumbha / Vishkambha). Every string
// below was harvested from the document itself — the name tables on p. xiv plus
// the spelling variants that actually occur in the daily body.
// ───────────────────────────────────────────────────────────────────────────

/** RP tithi name → 1-based ordinal WITHIN a paksha (1..15). */
const RP_TITHI = {
  Pratipad: 1, Dvitiya: 2, Tritiya: 3, Chaturthi: 4, Panchami: 5,
  Shashthi: 6, Saptami: 7, Ashtami: 8, Navami: 9, Dasami: 10,
  Ekadasi: 11, Dvadasi: 12, Trayodasi: 13, Chaturdasi: 14,
  Purnima: 15, Amavasya: 15,
};

/** RP nakshatra name → 0-based index matching `NAKSHATRA_NAMES`. */
const RP_NAKSHATRA = {
  Asvini: 0, Bharani: 1, Krittika: 2, Rohini: 3, Mrigasiras: 4, Ardra: 5,
  Punarvasu: 6, Pushya: 7, Aslesha: 8, Magha: 9, "Purva Phalguni": 10,
  "Uttara Phalguni": 11, Hasta: 12, Chitra: 13, Svati: 14, Visakha: 15,
  Anuradha: 16, Jyestha: 17, Mula: 18,
  // The body prints Purva/Uttara Ashadha three ways; all three occur.
  PurvAshadha: 19, Purvashadha: 19, "Purv Ashadha": 19, "Purva Ashadha": 19,
  UttarAshadha: 20, Uttarashadha: 20, "Uttara Ashadha": 20,
  Sravana: 21, Dhanistha: 22, Satabhisaj: 23,
  "Purva Bhadrapada": 24, "Uttara Bhadrapada": 25, Revati: 26,
};

/** RP yoga name → 0-based index matching `YOGA_NAMES`. */
const RP_YOGA = {
  Viskumbha: 0, Priti: 1, Ayusman: 2, Saubhagya: 3, Sobhana: 4, Atiganda: 5,
  Sukarma: 6, Dhriti: 7, Sula: 8, Ganda: 9, Vriddhi: 10, Dhruva: 11,
  Vyaghata: 12, Harshana: 13, Vajra: 14, Siddhi: 15, Vyatipata: 16,
  Variyan: 17, Parigha: 18, Siva: 19, Siddha: 20, Sadhya: 21, Subha: 22,
  Sukla: 23, Brahma: 24, Indra: 25, Vaidhriti: 26,
};

/** RP karana name → the engine's spelling from `karanaName()`. */
const RP_KARANA = {
  Bava: "Bava", Balava: "Balava", Kaulava: "Kaulava", Taitila: "Taitila",
  Gara: "Gara", Vanij: "Vanij", Vishti: "Vishti",
  Sakuni: "Shakuni", Chatuspada: "Chatushpada", Naga: "Naga",
  Kinstughna: "Kimstughna",
};

/**
 * RP rasi name → 0-based index matching `RASHI_NAMES`.
 *
 * `Karkara` is a TYPOGRAPHICAL ERROR in the source for Karkata (Cancer) — it
 * occurs in the daily body where the surrounding days are unambiguously Karkata.
 * Mapped rather than rejected, and counted so the parse report surfaces it.
 */
const RP_RASHI = {
  Mesha: 0, Vrisha: 1, Mithuna: 2, Karkata: 3, Simha: 4, Kanya: 5,
  Tula: 6, Vrischika: 7, Dhanus: 8, Makara: 9, Kumbha: 10, Mina: 11,
  Karkara: 3,
};
const RP_RASHI_TYPOS = new Set(["Karkara"]);

/** RP paksha word → the engine's `Paksha`. */
const RP_PAKSHA = { Sukla: "shukla", Krishna: "krishna" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ───────────────────────────────────────────────────────────────────────────
// Primitives
// ───────────────────────────────────────────────────────────────────────────

/**
 * Julian Day at 0h UT → civil date. The RP prints a `.5` JD on every entry,
 * which is midnight UT of that Gregorian date; deriving the date from it rather
 * than from the printed "31 May" avoids having to infer the year across the
 * 2026→2027 boundary, and gives a free cross-check against the printed date.
 */
function jdToGregorian(jd) {
  const z = Math.floor(jd + 0.5);
  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  const a = z + 1 + alpha - Math.floor(alpha / 4);
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return { year, month, day };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const isoDate = ({ year, month, day }) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/**
 * An RP clock reading ("h. 27-26") on a given civil date → ISO-UTC instant.
 * Hours ≥ 24 roll into the next Gregorian day by construction, which is exactly
 * the source's stated convention — no special-casing needed.
 */
function parseIst(dateParts, hours, minutes) {
  const base = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day);
  const IST_OFFSET_MS = 5.5 * 3600_000;
  return new Date(base - IST_OFFSET_MS + hours * 3600_000 + minutes * 60_000).toISOString();
}

/** Collapse the extracted text's wrapping so field regexes see one flat line. */
const flatten = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Repair defects in the PDF's TEXT LAYER — glyph-ordering artifacts that are not
 * present on the printed page, so repairing them loses no information.
 *
 * 1 Nov 2026: the leading "S" of "Sunrise" is emitted at the end of the previous
 * line, giving "Julian Day: 2461345.5S / unrise: h. 6-05".
 */
const repairTextLayer = (s) => s.replace(/(\d)\s*S\s+unrise:/g, "$1 Sunrise:");

// ───────────────────────────────────────────────────────────────────────────
// Field parsing
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parse a sequence like
 *   "(Mala Jyaishtha Sukla) Shashthi h. 6-25 then Saptami h. 29-05"
 *   "(Ashadha Sukla) Navami ahoratra"
 * into `{ entries: [{ name, endsAt, ahoratra }], parenthetical }`.
 *
 * A day can carry two entries (aṅga kṣaya — two of them end between one sunrise
 * and the next). The FIRST entry is the one running at sunrise, which is what
 * `dailyPanchanga` reports; later entries are kept so the fixture can support a
 * stricter comparison later.
 */
function parseAngaField(raw, dateParts) {
  const parentheticals = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => flatten(m[1]));
  const stripped = flatten(raw.replace(/\([^)]*\)/g, " "));
  if (!stripped) return { entries: [], parenthetical: parentheticals[0] ?? null };

  const entries = [];
  for (const segment of stripped.split(/\bthen\b/)) {
    const seg = flatten(segment);
    if (!seg) continue;
    // The period after "h" is dropped in a few places in the source (e.g. the
    // karaṇa on 13 Jan 2027 prints "Balava h 13-02"), so it is optional here.
    const timed = seg.match(/^(.+?)\s+h\.?\s*(\d{1,2})-(\d{2})\b/);
    if (timed) {
      entries.push({
        name: flatten(timed[1]),
        endsAt: parseIst(dateParts, Number(timed[2]), Number(timed[3])),
        ahoratra: false,
      });
      continue;
    }
    const whole = seg.match(/^(.+?)\s+ahoratra\b/);
    if (whole) {
      entries.push({ name: flatten(whole[1]), endsAt: null, ahoratra: true });
      continue;
    }
    // Anything else is an unrecognised shape; surface it rather than silently
    // dropping a day's data.
    entries.push({ name: seg, endsAt: null, ahoratra: false, unparsed: true });
  }
  return { entries, parenthetical: parentheticals[0] ?? null };
}

/** `Sunrise: h. 5-14` → ISO-UTC, or null when the field is absent. */
function parseClockField(blob, label, dateParts) {
  const m = blob.match(new RegExp(`${label}:\\s*h\\.?\\s*(\\d{1,2})-(\\d{2})`));
  return m ? parseIst(dateParts, Number(m[1]), Number(m[2])) : null;
}

/** Extract the text between `label:` and the next known field label. */
function slice(blob, label, nextLabel) {
  const m = blob.match(new RegExp(`${label}:(.*?)${nextLabel}`));
  return m ? m[1] : null;
}

/**
 * `Moon: in Vrischika, enters Dhanus h. 19-09` — the rasi occupied at sunrise
 * plus, when it happens that day, the ingress instant. The ingress is the
 * external check for the rashiphala design's `validUntil`, which is defined as
 * the next Moon rasi ingress.
 */
function parseMoonField(raw, dateParts, warn) {
  const flat = flatten(raw);
  const inMatch = flat.match(/\bin\s+([A-Za-z]+)/);
  const entersMatch = flat.match(/enters\s+([A-Za-z]+)\s+h\.\s*(\d{1,2})-(\d{2})/);
  const nameAt = (name) => {
    if (!(name in RP_RASHI)) { warn(`unknown rasi "${name}"`); return null; }
    if (RP_RASHI_TYPOS.has(name)) warn(`source typo "${name}" → Karkata`, "typo");
    return RP_RASHI[name];
  };
  return {
    rashi: inMatch ? nameAt(inMatch[1]) : null,
    entersRashi: entersMatch ? nameAt(entersMatch[1]) : null,
    entersAt: entersMatch ? parseIst(dateParts, Number(entersMatch[2]), Number(entersMatch[3])) : null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Day parsing
// ───────────────────────────────────────────────────────────────────────────

function parseDay(blobRaw, warnings) {
  const blob = repairTextLayer(flatten(blobRaw));
  const warn = (msg, kind = "warning") => warnings.push({ kind, msg, blob: blob.slice(0, 90) });

  const jdMatch = blob.match(/Julian Day:\s*([\d.]+)/);
  if (!jdMatch) { warn("no Julian Day"); return null; }
  const julianDay = Number(jdMatch[1]);
  const dateParts = jdToGregorian(julianDay);
  const date = isoDate(dateParts);

  const header = blob.match(
    /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*(\d+)\s+([A-Za-z]+),\s*\(ni\)\s*(\d+)\s+([A-Za-z]+),\s*(\d+)\s+([A-Za-z]+)/
  );
  if (!header) { warn("unparsed header"); return null; }

  // Cross-check the printed Gregorian day/weekday against the Julian Day. These
  // are independent fields in the source, so disagreement means a bad parse.
  const weekdayFromJd = (Math.floor(julianDay + 1.5) + 7) % 7;
  if (WEEKDAYS[weekdayFromJd] !== header[1]) {
    warn(`weekday "${header[1]}" ≠ JD weekday "${WEEKDAYS[weekdayFromJd]}"`, "inconsistency");
  }
  if (Number(header[6]) !== dateParts.day) {
    warn(`printed day ${header[6]} ≠ JD day ${dateParts.day}`, "inconsistency");
  }

  const aharganaMatch = blob.match(/Kali Ahargana:\s*(\d+)/);

  const fields = {
    tithi: slice(blob, "Tithi", "Nakshatra:"),
    nakshatra: slice(blob, "Nakshatra", "Yoga:"),
    yoga: slice(blob, "Yoga", "Karana:"),
    karana: slice(blob, "Karana", "Moon:"),
    moon: slice(blob, "Moon", "Age of moon"),
  };
  for (const [k, v] of Object.entries(fields)) if (v === null) warn(`missing field ${k}`);

  const tithi = fields.tithi ? parseAngaField(fields.tithi, dateParts) : { entries: [], parenthetical: null };
  const nakshatra = fields.nakshatra ? parseAngaField(fields.nakshatra, dateParts) : { entries: [] };
  const yoga = fields.yoga ? parseAngaField(fields.yoga, dateParts) : { entries: [] };
  const karana = fields.karana ? parseAngaField(fields.karana, dateParts) : { entries: [] };

  // The tithi parenthetical carries the lunar month, its adhika/nija status and
  // the paksha: "(Mala Jyaishtha Sukla)" / "(Shuddha Jyaishtha Sukla)".
  let lunarMonth = null, paksha = null, monthQualifier = null;
  if (tithi.parenthetical) {
    const words = tithi.parenthetical.split(/\s+/).filter(Boolean);
    const last = words.at(-1);
    paksha = RP_PAKSHA[last] ?? null;
    if (!paksha) warn(`unknown paksha "${last}"`);
    const rest = words.slice(0, -1);
    if (rest.length === 2) { monthQualifier = rest[0]; lunarMonth = rest[1]; }
    else if (rest.length === 1) { lunarMonth = rest[0]; }
    else warn(`unexpected tithi parenthetical "${tithi.parenthetical}"`);
  }

  /** Resolve one aṅga entry's name through the index maps above. */
  const resolve = (entry, table, label) => {
    const idx = table[entry.name];
    if (idx === undefined) { warn(`unknown ${label} "${entry.name}"`); return null; }
    return idx;
  };

  // The RP prints ONE parenthetical per day, but a day can carry two tithis
  // (aṅga kṣaya). When the first of them is Pūrṇimā or Amāvāsyā the second one
  // OPENS THE NEXT PAKṢA, so the day's printed pakṣa does not apply to it —
  // numbering it from the day's pakṣa puts it 15 out (2026-06-15 Amāvāsyā then
  // śukla Pratipad = 30 then 1, not 30 then 16; 2026-12-24 Pūrṇimā then kṛṣṇa
  // Pratipad = 15 then 16, not 15 then 1). Carry the pakṣa across entries and
  // flip it at each fortnight end.
  let entryPaksha = paksha;
  const tithiEntries = tithi.entries.map((e) => {
    const within = resolve(e, RP_TITHI, "tithi");
    // Amavasya is printed under the krishna paksha and is tithi 30; Purnima is
    // shukla 15. Every other name takes +15 in the krishna paksha.
    const number = within === null ? null
      : entryPaksha === "krishna" ? within + 15
      : within;
    const thisPaksha = entryPaksha;
    if (number === 15 || number === 30) {
      entryPaksha = entryPaksha === "shukla" ? "krishna" : "shukla";
    }
    return { ...e, number, paksha: thisPaksha, rpName: e.name };
  });

  const day = {
    date,
    julianDay,
    kaliAhargana: aharganaMatch ? Number(aharganaMatch[1]) : null,
    weekday: header[1],
    saka: { day: Number(header[2]), month: header[3] },
    nirayana: { day: Number(header[4]), month: header[5] },
    sunrise: parseClockField(blob, "Sunrise", dateParts),
    sunset: parseClockField(blob, "Sunset", dateParts),
    moonrise: parseClockField(blob, "Moonrise", dateParts),
    moonset: parseClockField(blob, "Moonset", dateParts),
    lunarMonth,
    monthQualifier,
    paksha,
    tithi: tithiEntries,
    nakshatra: nakshatra.entries.map((e) => ({ ...e, index: resolve(e, RP_NAKSHATRA, "nakshatra"), rpName: e.name })),
    yoga: yoga.entries.map((e) => ({ ...e, index: resolve(e, RP_YOGA, "yoga"), rpName: e.name })),
    karana: karana.entries.map((e) => ({ ...e, name: RP_KARANA[e.name] ?? null, rpName: e.name })),
    moon: fields.moon ? parseMoonField(fields.moon, dateParts, warn) : null,
  };
  for (const e of day.karana) if (e.name === null) warn(`unknown karana "${e.rpName}"`);
  return day;
}

// ───────────────────────────────────────────────────────────────────────────
// Driver
// ───────────────────────────────────────────────────────────────────────────

function extractText(inputPath) {
  if (extname(inputPath).toLowerCase() !== ".pdf") return readFileSync(inputPath, "utf8");
  const out = join(mkdtempSync(join(tmpdir(), "rp-")), "rp.txt");
  try {
    execFileSync("pdftotext", ["-layout", inputPath, out], { stdio: "pipe" });
  } catch (err) {
    throw new Error(
      `pdftotext failed (${err.message}). Install poppler-utils, or pass an ` +
      `already-extracted .txt: pdftotext -layout "<pdf>" out.txt`
    );
  }
  return readFileSync(out, "utf8");
}

function main() {
  const argv = process.argv.slice(2);
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error('usage: node scripts/rp-parse.mjs <RP.pdf|RP.txt> [--out <path>]');
    process.exit(2);
  }
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : join(ROOT, "test/fixtures/rp-1948.json");

  const text = extractText(input);

  // Day entries begin at a weekday name followed by the Saka day-of-month.
  const blobs = text
    .split(/(?=(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*\d)/)
    .slice(1);

  const warnings = [];
  const days = [];
  for (const blob of blobs) {
    const day = parseDay(blob, warnings);
    if (day) days.push(day);
  }

  days.sort((a, b) => a.julianDay - b.julianDay);

  // Continuity check: consecutive entries must advance exactly one day. The
  // source covers 13 national months (Chaitra 1948 → Chaitra 1949 S.E.) as one
  // unbroken run of civil days, so both gaps and duplicates indicate a bad parse.
  const gaps = [];
  const duplicates = [];
  for (let i = 1; i < days.length; i++) {
    const delta = days[i].julianDay - days[i - 1].julianDay;
    if (delta === 0) duplicates.push(days[i].date);
    else if (delta !== 1) gaps.push(`${days[i - 1].date} → ${days[i].date} (${delta}d)`);
  }

  const fixture = {
    source: {
      title: "Rashtriya Panchang (English), Saka Era 1948 / 2026-27 A.D.",
      publisher: "Positional Astronomy Centre, India Meteorological Department, Government of India",
      station: { name: "Central Station of India", latitude: 23 + 11 / 60, longitude: 82.5, timeZone: "Asia/Kolkata" },
      conventions: {
        timesAre: "I.S.T. (UT+5:30), local mean time of the Central Station, rounded to the minute",
        dayReckoning: "sunrise (udaya) at the Central Station",
        hoursPast24: "25h/26h/… mean 01:00/02:00 of the next Gregorian day",
        ayanamsa: "increasing (Chitrapaksha/Lahiri): tropical 23°15'00\" at 0h 21 Mar 1956",
      },
    },
    generated: { from: input, dayCount: days.length },
    days,
  };
  writeFileSync(outPath, JSON.stringify(fixture, null, 2));

  const byKind = warnings.reduce((acc, w) => ((acc[w.kind] = (acc[w.kind] ?? 0) + 1), acc), {});
  console.log(`parsed ${days.length} day entries → ${outPath}`);
  console.log(`  range          ${days[0]?.date} … ${days.at(-1)?.date}`);
  console.log(`  duplicate days ${duplicates.length}${duplicates.length ? ` (repeated Chaitra: ${duplicates[0]} …)` : ""}`);
  console.log(`  gaps           ${gaps.length}${gaps.length ? ` — ${gaps.join(", ")}` : ""}`);
  console.log(`  warnings       ${warnings.length}${Object.keys(byKind).length ? ` ${JSON.stringify(byKind)}` : ""}`);
  for (const w of warnings.slice(0, 20)) console.log(`    [${w.kind}] ${w.msg}  ·  ${w.blob}`);
  if (warnings.length > 20) console.log(`    … ${warnings.length - 20} more`);
}

main();
