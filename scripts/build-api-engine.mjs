/**
 * Bundles the engine (src/index.ts) into a single self-contained ESM file for
 * the serverless API, with astronomy-engine INLINED. This sidesteps the Vercel
 * ESM lambda resolving astronomy-engine to its CommonJS build (whose `Body`
 * enum defeats Node's CJS named-export detector). esbuild resolves the CJS↔ESM
 * interop at bundle time — the same way Vitest does, so it matches the tests.
 *
 * Output (gitignored, NOT in the npm package): api-engine/index.js + a .d.ts
 * that re-exports the real library types so the api/ code stays fully typed.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "api-engine/index.js",
  logLevel: "info",
});

mkdirSync("api-engine", { recursive: true });
writeFileSync("api-engine/index.d.ts", 'export * from "../dist/index.js";\n');
