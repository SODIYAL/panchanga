import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * WHY THIS FILE EXISTS: `testTimeout`.
 *
 * Vitest's default per-test timeout is 5 000 ms. That default assumes tests are
 * cheap — but the slowest tests here are not doing I/O or waiting on anything;
 * they are computing a FULL YEAR of festivals, which means iterative root-finding
 * over the ephemeris for every tithi/nakshatra boundary in that year. The first
 * such call in a file legitimately costs ~5 s on a 12-core dev machine:
 *
 *     api-provenance  every festival carries a basis and sampradaya    5308 ms
 *     rules           every rule produces a FestivalResult             5178 ms
 *     multiyear       Apara Ekadashi 2027 → Jun 1                      5157 ms
 *     moonrise        Karva Chauth 2025 New Delhi → Oct 10             5010 ms
 *     api             returns the year's festivals for a place         4762 ms
 *
 * Those five sat astride the 5 000 ms line, so the suite failed
 * NON-DETERMINISTICALLY — a different subset timed out on each run (11 tests,
 * then 5) depending on how the 28 test files happened to contend for cores. The
 * failures were always `Test timed out in 5000ms`, never an assertion: with the
 * timeout raised, all 532 tests pass.
 *
 * So the timeout is the bug, not the engine. 30 s gives ~6× headroom over the
 * observed worst case, which matters because CI runners have far fewer cores
 * than a dev machine and these numbers are wall-clock under contention. It is
 * still short enough that a genuinely hung test fails the run rather than
 * hanging it.
 *
 * If a test ever needs longer than this, that is a signal to make the test
 * cheaper — not to raise the number again.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
