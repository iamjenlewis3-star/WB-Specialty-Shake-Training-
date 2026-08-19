import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMediaFile } from "@/lib/uploads/image";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
};

/**
 * Serves an uploaded image from private storage.
 *
 * Profile photos, course artwork and skill-check evidence are all people-related
 * pictures, so they require a session — they are never reachable anonymously and
 * never live in `public/`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { file } = await ctx.params;
  const abs = resolveMediaFile(file);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  const body = fs.readFileSync(abs);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(abs)] ?? "application/octet-stream",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
