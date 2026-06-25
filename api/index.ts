import { serve } from "./_vercel.js";
// GET /api  (usage)
export default function handler(req: any, res: any): void {
  serve("api", req, res);
}
