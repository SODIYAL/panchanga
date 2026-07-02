import { serve } from "./_vercel.js";
// GET /api/guna-milan
export default function handler(req: any, res: any): void {
  serve("guna-milan", req, res);
}
