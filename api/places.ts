import { serve } from "./_vercel.js";
// GET /api/places
export default function handler(req: any, res: any): void {
  serve("places", req, res);
}
