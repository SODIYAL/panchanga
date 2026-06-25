import { serve } from "./_vercel.js";
// GET /api/calendar  (also reachable as /calendar.ics and /api/calendar.ics via rewrites)
export default function handler(req: any, res: any): void {
  serve("calendar", req, res);
}
