import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/client";
import { mimeTypeFor, resolvePackageFile } from "@/lib/scorm/package";
import { isUuid } from "@/lib/rbac/scope";

/**
 * Serves files from an extracted SCORM package.
 *
 * Packages are untrusted uploads, so they are stored outside `public/` and only
 * ever served through this authenticated handler, which re-checks the resolved
 * path stays inside the package directory.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ packageId: string; path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { packageId, path: segments } = await ctx.params;
  if (!isUuid(packageId)) return new NextResponse("Not found", { status: 404 });

  const pkg = await queryOne<{ extract_path: string }>(
    `select extract_path from scorm_packages where id = $1 and status <> 'deleted'`, [packageId]);
  if (!pkg) return new NextResponse("Not found", { status: 404 });

  const filePath = resolvePackageFile(pkg.extract_path, segments);
  if (!filePath) return new NextResponse("Not found", { status: 404 });

  const stat = fs.statSync(filePath);
  const body = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeTypeFor(filePath),
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
      // The package renders inside a sandboxed iframe on the same origin so the
      // SCORM API adapter on the parent window is reachable.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
