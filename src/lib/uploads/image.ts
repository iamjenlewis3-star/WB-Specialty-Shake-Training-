import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Validated image uploads (profile photos, course artwork, skill-check evidence).
 *
 * Images are written to private storage and served through `/api/media`, never
 * from `public/`, so the same session and permission checks that guard the rest
 * of the Academy also guard uploaded pictures.
 *
 * Every upload is checked three ways — declared MIME type, file extension and
 * the leading bytes of the file itself — because the first two are attacker
 * controlled. SVG is deliberately not accepted: it is a script container.
 */

export const IMAGE_STORAGE = path.join(process.cwd(), "storage", "images");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ACCEPTED: Array<{ mime: string; ext: string; magic: number[][] }> = [
  { mime: "image/png", ext: ".png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  { mime: "image/jpeg", ext: ".jpg", magic: [[0xff, 0xd8, 0xff]] },
  { mime: "image/webp", ext: ".webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  { mime: "image/gif", ext: ".gif", magic: [[0x47, 0x49, 0x46, 0x38]] },
];

/** File names handed back by `saveImage`, and the only shape `/api/media` serves. */
export const MEDIA_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/;

export interface ImageUploadResult {
  ok: boolean;
  /** Public URL for the stored image, e.g. `/api/media/<uuid>.png`. */
  url?: string;
  error?: string;
}

function sniff(bytes: Uint8Array): { mime: string; ext: string } | null {
  for (const kind of ACCEPTED) {
    for (const signature of kind.magic) {
      if (signature.every((byte, i) => bytes[i] === byte)) {
        // WEBP shares the RIFF header with other RIFF containers.
        if (kind.mime === "image/webp") {
          const tag = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
          if (tag !== "WEBP") continue;
        }
        return { mime: kind.mime, ext: kind.ext };
      }
    }
  }
  return null;
}

/**
 * Validates and stores an uploaded image. Returns a URL on success and a
 * human-readable reason on rejection — callers surface it as a toast rather
 * than throwing, because a bad picture is a user mistake, not a server fault.
 */
export async function saveImage(file: unknown): Promise<ImageUploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 5 MB or smaller." };

  const declaredExt = path.extname(file.name).toLowerCase();
  const declaredOk = ACCEPTED.some((k) => k.ext === declaredExt || (k.ext === ".jpg" && declaredExt === ".jpeg"));
  if (!declaredOk) return { ok: false, error: "Use a PNG, JPEG, WEBP or GIF image." };
  if (file.type && !ACCEPTED.some((k) => k.mime === file.type)) {
    return { ok: false, error: `Unsupported image type: ${file.type}` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return { ok: false, error: "That file is not a readable image." };

  fs.mkdirSync(IMAGE_STORAGE, { recursive: true });
  const name = `${crypto.randomUUID()}${kind.ext}`;
  fs.writeFileSync(path.join(IMAGE_STORAGE, name), bytes);
  return { ok: true, url: `/api/media/${name}` };
}

/** Resolves a `/api/media/<file>` URL to an absolute path inside private storage. */
export function resolveMediaFile(fileName: string): string | null {
  if (!MEDIA_FILE_PATTERN.test(fileName)) return null;
  const abs = path.join(IMAGE_STORAGE, fileName);
  if (!path.resolve(abs).startsWith(path.resolve(IMAGE_STORAGE))) return null;
  return fs.existsSync(abs) ? abs : null;
}
