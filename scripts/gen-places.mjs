/**
 * scripts/gen-places.mjs — regenerates api/places.generated.ts: the list of
 * US + Canada cities/towns the HTTP API accepts via `?place=<slug>`.
 *
 * The output is COMMITTED, so day-to-day contributors never run this. Run it
 * only to refresh the city list or change the population cutoff.
 *
 *   # one-off: these two packages are NOT project dependencies (data tooling)
 *   npm install --no-save all-the-cities tz-lookup
 *   node scripts/gen-places.mjs            # writes api/places.generated.ts
 *
 * Data: `all-the-cities` (GeoNames extract). Timezone: `tz-lookup` (offline,
 * coordinate → IANA zone — this is the hard part, so we look it up per city
 * rather than guessing a state→zone mapping, which is wrong for AZ/IN/etc).
 *
 * Slug: "<name>-<state>" (e.g. "austin-tx"), diacritics stripped, collisions
 * suffixed -2/-3 in descending-population order so the larger city keeps the
 * bare slug. Bare-name lookups (?place=austin) resolve to the most-populous
 * match at runtime (see api/_lib.ts).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const POP_MIN = Number(process.env.POP_MIN ?? 10_000);
const POP_MIN_IN = Number(process.env.POP_MIN_IN ?? 15_000);
const OUT = process.argv[2] ?? fileURLToPath(new URL("../api/places.generated.ts", import.meta.url));

let cities, tzLookup;
try {
  cities = (await import("all-the-cities")).default;
  tzLookup = (await import("tz-lookup")).default;
} catch {
  console.error(
    "Missing data tooling. Run:\n  npm install --no-save all-the-cities tz-lookup\nthen re-run this script.",
  );
  process.exit(1);
}

// GeoNames admin1 codes for Canada → province/territory 2-letter codes.
// (US admin codes are already USPS 2-letter, so they pass through.)
const CA_PROV = {
  "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL",
  "07": "NS", "08": "ON", "09": "PE", "10": "QC", "11": "SK",
  "12": "YT", "13": "NT", "14": "NU",
};

// ISO 3166-2:IN abbreviations, keyed by GeoNames admin1 name.
const IN_ABBR = {
  "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", "Assam": "AS", "Bihar": "BR",
  "Chhattisgarh": "CT", "Goa": "GA", "Gujarat": "GJ", "Haryana": "HR",
  "Himachal Pradesh": "HP", "Jammu and Kashmir": "JK", "Jharkhand": "JH",
  "Karnataka": "KA", "Kerala": "KL", "Madhya Pradesh": "MP", "Maharashtra": "MH",
  "Manipur": "MN", "Meghalaya": "ML", "Mizoram": "MZ", "Nagaland": "NL",
  "Odisha": "OR", "Punjab": "PB", "Rajasthan": "RJ", "Sikkim": "SK",
  "Tamil Nadu": "TN", "Telangana": "TG", "Tripura": "TR", "Uttar Pradesh": "UP",
  "Uttarakhand": "UT", "West Bengal": "WB", "Andaman and Nicobar Islands": "AN",
  "Chandigarh": "CH", "Dadra and Nagar Haveli and Daman and Diu": "DH",
  "Delhi": "DL", "Ladakh": "LA", "Lakshadweep": "LD", "Puducherry": "PY",
};

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics: Montréal → Montreal
    .toLowerCase()
    .replace(/['’.]/g, "") // drop apostrophes/periods: St. → st, O'Fallon → ofallon
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// GeoNames numeric admin1 code → abbreviation for India, fetched once.
async function indiaAdmin1() {
  const res = await fetch("https://download.geonames.org/export/dump/admin1CodesASCII.txt");
  if (!res.ok) throw new Error(`admin1CodesASCII download failed: HTTP ${res.status}`);
  const map = {};
  for (const line of (await res.text()).split("\n")) {
    const [key, name] = line.split("\t"); // e.g. "IN.16\tMaharashtra\t…"
    if (!key?.startsWith("IN.") || !name) continue;
    const clean = name
      .replace(/^(State of|Union Territory of|National Capital Territory of)\s+/i, "")
      .trim();
    map[key.slice(3)] = IN_ABBR[clean] ?? slugify(clean); // fallback: full slugified name
  }
  // Pre-2020 GeoNames admin1 codes: 06 (Dadra and Nagar Haveli) and 32 (Daman
  // and Diu) no longer appear in today's admin1CodesASCII.txt now that both
  // territories were merged into "Dadra and Nagar Haveli and Daman and Diu",
  // but `all-the-cities` still tags some city records with the old codes.
  map["06"] ??= "DH";
  map["32"] ??= "DH";
  return map;
}
const IN_ADMIN = await indiaAdmin1();

const picked = cities
  .filter(
    (c) =>
      ((c.country === "US" || c.country === "CA") && c.population >= POP_MIN) ||
      (c.country === "IN" && c.population >= POP_MIN_IN),
  )
  .map((c) => {
    const [longitude, latitude] = c.loc.coordinates;
    const admin =
      c.country === "CA" ? CA_PROV[c.adminCode] ?? c.adminCode
      : c.country === "IN" ? IN_ADMIN[c.adminCode] ?? c.adminCode
      : c.adminCode;
    return {
      name: c.name,
      admin,
      country: c.country,
      latitude: Math.round(latitude * 1e5) / 1e5,
      longitude: Math.round(longitude * 1e5) / 1e5,
      timeZone: tzLookup(latitude, longitude),
      population: c.population,
    };
  })
  .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));

// Assign slugs, suffixing collisions -2/-3… (largest population keeps bare slug).
const used = new Map();
let collisions = 0;
for (const p of picked) {
  const base = `${slugify(p.name)}-${p.admin.toLowerCase()}`;
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  if (n > 1) collisions++;
  p.slug = n === 1 ? base : `${base}-${n}`;
}

const rows = picked
  .map(
    (p) =>
      `  { slug: ${JSON.stringify(p.slug)}, name: ${JSON.stringify(p.name)}, admin: ${JSON.stringify(
        p.admin,
      )}, country: ${JSON.stringify(p.country)}, latitude: ${p.latitude}, longitude: ${p.longitude}, timeZone: ${JSON.stringify(
        p.timeZone,
      )}, population: ${p.population} },`,
  )
  .join("\n");

const out = `// AUTO-GENERATED by scripts/gen-places.mjs — DO NOT EDIT BY HAND.
// Scope: US + Canada (pop >= ${POP_MIN.toLocaleString("en-US")}) + India (pop >= ${POP_MIN_IN.toLocaleString("en-US")}).
// Timezone resolved offline via tz-lookup. Regenerate: see the script header.
export interface PlaceRecord {
  /** URL slug, e.g. "austin-tx" or "jaipur-rj". Unique; collisions suffixed -2/-3. */
  slug: string;
  /** Display name (with diacritics), e.g. "Montréal". */
  name: string;
  /** State (USPS) or province/territory 2-letter code. */
  admin: string;
  country: "US" | "CA" | "IN";
  latitude: number;
  longitude: number;
  /** IANA timezone, e.g. "America/Edmonton". */
  timeZone: string;
  population: number;
}

/** ${picked.length.toLocaleString("en-US")} US, Canada & India cities/towns, sorted by descending population. */
export const PLACES: readonly PlaceRecord[] = [
${rows}
];
`;

writeFileSync(OUT, out);
console.error(
  `Wrote ${picked.length} places (pop >= ${POP_MIN} US/CA, >= ${POP_MIN_IN} IN, ${collisions} slug collisions suffixed) → ${OUT}`,
);
