export const PANCHANGA_VERSION = "0.0.0" as const;

export {
  ayanamsha,
  siderealLongitude,
  siderealSunRashi,
  normalize360,
  LAHIRI_ANCHOR_J2000_DEG,
  type AyanamshaOptions,
} from "./ayanamsha.js";

export {
  localDayString,
  startOfLocalDayUTC,
  nextLocalDayStartUTC,
  riseSet,
  moonrise,
  sunset,
  sunriseWindow,
  pratahkala,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  sankrantiPunyaKala,
  type GeoLocation,
  type TimeWindow,
} from "./time.js";

export {
  elongation,
  tithiAt,
  tithiBoundaries,
  nakshatraAt,
  nakshatraBoundaries,
  karanaIndexAt,
  karanaAt,
  karanaName,
  bhadraIntervals,
  newMoons,
  solarIngress,
  lunarMonth,
  TITHI_NAMES,
  NAKSHATRA_NAMES,
  MOVABLE_KARANAS,
  LUNAR_MONTH_NAMES,
  type TithiBoundaries,
  type NakshatraBoundaries,
  type KaranaInterval,
  type MonthSystem,
  type LunarMonth,
} from "./elements.js";

// ── Observance-rule grammar (the keystone) ──────────────────────────────────
export type {
  Kala,
  TithiRef,
  Paksha,
  Observance,
  FestivalRule,
  FestivalResult,
} from "./types.js";

// ── Observance-rule evaluator ───────────────────────────────────────────────
export {
  selectDayByPervasion,
  computeFestival,
  computeFestivals,
  type PervasionCandidate,
  type Precedence,
  type SelectOptions,
  type SelectResult,
  type ComputeOptions,
} from "./festivals.js";

// ── Per-festival rule data (§4 core + §4b extended generators) ──────────────
export {
  CORE_RULES,
  ekadashiRules,
  sankashtiRules,
  CHHATH_RULE,
  allRules,
} from "./rules.js";
