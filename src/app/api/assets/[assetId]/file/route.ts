import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/client";
import { mimeTypeFor } from "@/lib/scorm/package";
import { isUuid } from "@/lib/rbac/scope";

/**
 * Serves an asset.
 *
 * Uploaded files are streamed from private storage (never from `public/`).
 * Demo library assets that have no stored binary are rendered as a real,
 * readable HTML document built from the metadata the Academy holds for them —
 * the viewer, the download and the acknowledgment flow are all live.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { assetId } = await ctx.params;
  if (!isUuid(assetId)) return new NextResponse("Not found", { status: 404 });

  const asset = await queryOne<{
    id: string; name: string; description: string | null; asset_type: string; category: string | null;
    tags: string[]; version: number; file_path: string | null; file_name: string | null; mime_type: string | null;
    updated_at: string; external_url: string | null;
  }>(`select id, name, description, asset_type, category, tags, version, file_path, file_name, mime_type,
             updated_at, external_url from assets where id = $1 and status <> 'deleted'`, [assetId]);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  if (asset.external_url) return NextResponse.redirect(asset.external_url);

  if (asset.file_path) {
    const abs = path.isAbsolute(asset.file_path) ? asset.file_path : path.join(process.cwd(), asset.file_path);
    const storageRoot = path.join(process.cwd(), "storage");
    if (!path.resolve(abs).startsWith(storageRoot) || !fs.existsSync(abs)) {
      return new NextResponse("File unavailable", { status: 404 });
    }
    const body = fs.readFileSync(abs);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": asset.mime_type ?? mimeTypeFor(abs),
        "Content-Disposition": `inline; filename="${(asset.file_name ?? "asset").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(asset.name)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font: 15px/1.6 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; background:#f4f6fa; color:#0d1526; }
  @media (prefers-color-scheme: dark) { body { background:#070c16; color:#e9eef7; } .sheet { background:#0e1725 !important; border-color:#22314a !important; } }
  .sheet { max-width: 820px; margin: 32px auto; padding: 40px; background:#fff; border:1px solid #dfe5ee; border-radius:14px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-.01em; }
  .brand span { color:#c8102e; text-transform:uppercase; letter-spacing:.18em; font-size:11px; }
  h1 { font-size: 26px; margin: 22px 0 6px; letter-spacing:-.02em; }
  .meta { color:#5b6779; font-size:13px; }
  h2 { font-size: 16px; margin: 26px 0 8px; }
  ul { padding-left: 20px; }
  .tag { display:inline-block; background:#eef2f7; color:#5b6779; border-radius:99px; padding:2px 10px; font-size:11.5px; margin-right:6px; }
  footer { margin-top: 34px; border-top:1px solid #dfe5ee; padding-top:14px; color:#8492a6; font-size:12px; }
</style></head>
<body><article class="sheet">
  <div class="brand">Wahlburgers <span>Academy</span></div>
  <h1>${escapeHtml(asset.name)}</h1>
  <p class="meta">${escapeHtml(asset.category ?? "Training resource")} · Version ${asset.version} · Updated ${new Date(asset.updated_at).toLocaleDateString("en-US")}</p>
  <p>${escapeHtml(asset.description ?? "Reference material maintained by Corporate Training.")}</p>
  <h2>How to use this document</h2>
  <ul>
    <li>Review before your shift and keep a copy at your station.</li>
    <li>Managers: use this in pre-shift and during on-floor coaching.</li>
    <li>Questions go to your General Manager or Corporate Training.</li>
  </ul>
  <h2>Standards covered</h2>
  <ul>${(asset.tags ?? []).map((t) => `<li>${escapeHtml(String(t))}</li>`).join("") || "<li>Wahlburgers brand standards</li>"}</ul>
  <p>${(asset.tags ?? []).map((t) => `<span class="tag">${escapeHtml(String(t))}</span>`).join("")}</p>
  <footer>
    Wahlburgers Academy · ${escapeHtml(asset.asset_type.toUpperCase())} asset ${escapeHtml(asset.id)} ·
    This demonstration environment renders the document content the Academy stores for this asset.
  </footer>
</article></body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=120" } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
