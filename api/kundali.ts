import { serve } from "./_vercel.js";
// GET /api/kundali
export default function handler(req: any, res: any): void {
  serve("kundali", req, res);
}
