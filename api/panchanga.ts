import { serve } from "./_vercel.js";
// GET /api/panchanga
export default function handler(req: any, res: any): void {
  serve("panchanga", req, res);
}
