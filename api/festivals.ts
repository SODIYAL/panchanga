import { serve } from "./_vercel.js";
// GET /api/festivals
export default function handler(req: any, res: any): void {
  serve("festivals", req, res);
}
