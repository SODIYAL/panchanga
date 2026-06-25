export const PANCHANGA_VERSION = "0.1.0" as const;

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
  varaAt,
  VARA_NAMES,
  sunriseWindow,
  pratahkala,
  purvahna,
  madhyahna,
  aparahna,
  pradosha,
  nishita,
  brahmaMuhurta,
  arunodaya,
  rahuKala,
  yamaganda,
  gulikaKala,
  abhijitMuhurta,
  sankrantiPunyaKala,
  type GeoLocation,
  type TimeWindow,
  type Vara,
} from "./time.js";

export {
  elongation,
  tithiAt,
  tithiBoundaries,
  nakshatraAt,
  nakshatraBoundaries,
  yogaAt,
  yogaBoundaries,
  karanaIndexAt,
  karanaAt,
  karanaName,
  karanaBoundaries,
  bhadraIntervals,
  bhadraSplit,
  newMoons,
  solarIngress,
  lunarMonth,
  TITHI_NAMES,
  NAKSHATRA_NAMES,
  YOGA_NAMES,
  MOVABLE_KARANAS,
  LUNAR_MONTH_NAMES,
  type TithiBoundaries,
  type NakshatraBoundaries,
  type YogaBoundaries,
  type KaranaBoundaries,
  type KaranaInterval,
  type BhadraVasa,
  type BhadraDetails,
  type MonthSystem,
  type LunarMonth,
} from "./elements.js";

// ── Daily pañcāṅga aggregator ───────────────────────────────────────────────
export {
  dailyPanchanga,
  type DailyPanchanga,
  type RunningElement,
  type IsoWindow,
  type DayMuhurtas,
} from "./panchanga.js";

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

// ── Per-festival rule data (§4 core + §4b/§4c extended generators) ──────────
export {
  CORE_RULES,
  ekadashiRules,
  sankashtiRules,
  pradoshRules,
  masikShivaratriRules,
  purnimaVratRules,
  amavasyaRules,
  sankrantiRules,
  CHHATH_RULE,
  allRules,
} from "./rules.js";
