import { serve } from "./_vercel.js";
// GET /api/eclipses
export default function handler(req: any, res: any): void {
  serve("eclipses", req, res);
}
