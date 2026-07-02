export const PANCHANGA_VERSION = "0.2.0" as const;

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
  localCivilTimeToUTC,
  validateLocation,
  riseSet,
  moonrise,
  sunset,
  varaAt,
  weekdayOfLocalDay,
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
  dayMuhurtas,
  type DayMuhurtaWindows,
  sankrantiPunyaKala,
  type GeoLocation,
  type TimeWindow,
  type IsoWindow,
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

// ── Grahaṇa (eclipses) ──────────────────────────────────────────────────────
export {
  lunarEclipses,
  solarEclipses,
  type LunarEclipse,
  type SolarEclipse,
  type GrahanKind,
} from "./eclipses.js";

// ── Daily pañcāṅga aggregator ───────────────────────────────────────────────
export {
  dailyPanchanga,
  type DailyPanchanga,
  type RunningElement,
  type DayMuhurtas,
} from "./panchanga.js";

// ── Jyotiṣa: grahas, kuṇḍalī, daśā ──────────────────────────────────────────
export {
  GRAHA_NAMES,
  RASHI_NAMES,
  grahaLongitude,
  grahaPosition,
  grahaPositions,
  meanNodeSidereal,
  trueNodeSidereal,
  janmaFacts,
  type Graha,
  type GrahaOptions,
  type GrahaPosition,
  type JanmaFacts,
} from "./grahas.js";
export {
  tropicalAscendant,
  siderealLagna,
  lagnaWindow,
  navamsaRashi,
  kundali,
  moonKundali,
  type Kundali,
  type KundaliGraha,
  type LagnaWindow,
} from "./kundali.js";
export {
  VIMSHOTTARI_SEQUENCE,
  VIMSHOTTARI_TOTAL_YEARS,
  nakshatraLord,
  vimshottariDasha,
  type DashaPeriod,
} from "./dashas.js";
export { gunaMilan, type GunaMilanResult, type KootaScore } from "./kootas.js";
export { mangalDosha, kalaSarpa, type MangalDosha, type KalaSarpa } from "./doshas.js";

// ── Observance-rule grammar (the keystone) ──────────────────────────────────
export type {
  Kala,
  TithiRef,
  Paksha,
  Sampradaya,
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
  purnimaSnanaRules,
  amavasyaRules,
  sankrantiRules,
  oneOffFestivalRules,
  regionalFestivalRules,
  CHHATH_RULE,
  allRules,
  type RuleProfile,
} from "./rules.js";
