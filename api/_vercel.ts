/**
 * api/_vercel.ts — the only HTTP-framework glue. Translates a Vercel
 * (req, res) into a call to the pure `handle()` core and writes the JSON,
 * with CORS (open GET API) and a deterministic Cache-Control header so the
 * Vercel/CDN edge can cache responses.
 */
import { handle, type Query } from "./_lib.js";

interface VercelReq {
  query?: Query;
  url?: string;
}
interface VercelRes {
  setHeader(name: string, value: string): void;
  status(code: number): VercelRes;
  send(body: string): void;
}

export function serve(route: string, req: VercelReq, res: VercelRes): void {
  const now = new Date();
  const ctx = { today: now.toISOString().slice(0, 10), year: now.getUTCFullYear() };
  const { status, body, cacheSeconds, contentType } = handle(route, req.query ?? {}, ctx);

  res.setHeader("content-type", contentType ?? "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "cache-control",
    cacheSeconds > 0 ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` : "no-store",
  );
  // A string body (e.g. an .ics document) is sent verbatim; objects → JSON.
  res.status(status).send(typeof body === "string" ? body : JSON.stringify(body, null, 2));
}
