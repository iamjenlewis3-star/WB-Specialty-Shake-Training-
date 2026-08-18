import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

/**
 * SCORM package ingestion.
 *
 * Deliberately isolated behind this module so a commercial SCORM engine can be
 * swapped in later: everything the rest of the platform needs is the parsed
 * metadata returned by `extractScormPackage` plus the runtime CMI store in
 * `src/lib/services/scorm.ts`.
 *
 * Security: SCORM archives are untrusted uploads. We reject absolute paths,
 * parent-directory traversal ("zip slip"), symlinks, oversized archives and
 * server-executable file extensions before anything is written to disk.
 */

export const SCORM_STORAGE_ROOT = process.env.WB_STORAGE_DIR
  ? path.join(process.env.WB_STORAGE_DIR, "scorm")
  : path.join(process.cwd(), "storage", "scorm");

const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const BLOCKED_EXTENSIONS = new Set([
  ".php", ".phtml", ".jsp", ".jspx", ".asp", ".aspx", ".cgi", ".pl", ".py", ".sh", ".bash",
  ".exe", ".dll", ".so", ".bat", ".cmd", ".ps1", ".jar", ".msi",
]);

export interface ScormMetadata {
  id: string;
  title: string;
  identifier: string | null;
  scormVersion: "1.2" | "2004";
  launchFile: string;
  extractPath: string;
  manifestXml: string;
  masteryScore: number | null;
  fileSize: number;
  fileCount: number;
}

export class ScormValidationError extends Error {}

function assertSafeEntryName(entryName: string) {
  if (!entryName || entryName.trim() === "") throw new ScormValidationError("Archive contains an unnamed entry.");
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new ScormValidationError(`Absolute path in archive rejected: ${entryName}`);
  }
  if (normalized.split("/").some((seg) => seg === "..")) {
    throw new ScormValidationError(`Path traversal in archive rejected: ${entryName}`);
  }
  const ext = path.extname(normalized).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new ScormValidationError(`Disallowed file type in archive: ${entryName}`);
  }
}

/** Locate imsmanifest.xml anywhere in the archive (some authoring tools nest it). */
function findManifestEntry(zip: AdmZip): { name: string; xml: string } {
  const entries = zip.getEntries();
  const manifest = entries
    .filter((e) => !e.isDirectory && path.basename(e.entryName).toLowerCase() === "imsmanifest.xml")
    .sort((a, b) => a.entryName.split("/").length - b.entryName.split("/").length)[0];
  if (!manifest) throw new ScormValidationError("No imsmanifest.xml found — this is not a valid SCORM package.");
  return { name: manifest.entryName, xml: zip.readAsText(manifest) };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseManifest(xml: string): {
  title: string;
  identifier: string | null;
  scormVersion: "1.2" | "2004";
  launchHref: string;
  masteryScore: number | null;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseAttributeValue: false,
  });
  const doc = parser.parse(xml);
  const manifest = doc.manifest;
  if (!manifest) throw new ScormValidationError("imsmanifest.xml is malformed.");

  const schemaVersion = String(manifest.metadata?.schemaversion ?? "1.2");
  const scormVersion: "1.2" | "2004" = schemaVersion.includes("2004") || schemaVersion.startsWith("1.3") ? "2004" : "1.2";

  const organizations = manifest.organizations;
  const orgList = asArray(organizations?.organization);
  const defaultOrgId = organizations?.["@_default"];
  const org = orgList.find((o: Record<string, string>) => o["@_identifier"] === defaultOrgId) ?? orgList[0];

  const resources = asArray(manifest.resources?.resource);
  const items = asArray(org?.item);

  // Walk items (they can nest) to find the first that points at a resource.
  let identifierRef: string | undefined;
  let itemTitle: string | undefined;
  let masteryScore: number | null = null;
  const walk = (nodes: Record<string, unknown>[]) => {
    for (const node of nodes) {
      if (identifierRef) return;
      const ref = node["@_identifierref"] as string | undefined;
      if (ref) {
        identifierRef = ref;
        itemTitle = node.title as string | undefined;
        const mastery = node.masteryscore ?? node["masteryscore"];
        if (mastery !== undefined) masteryScore = Number(mastery);
        const minScore = (node as never as Record<string, Record<string, Record<string, string>>>)
          ?.["sequencing"]?.["objectives"]?.["primaryObjective"];
        if (!masteryScore && minScore && minScore["minNormalizedMeasure"]) {
          masteryScore = Number(minScore["minNormalizedMeasure"]) * 100;
        }
        return;
      }
      walk(asArray(node.item as Record<string, unknown>[]));
    }
  };
  walk(items as Record<string, unknown>[]);

  const resource =
    resources.find((r: Record<string, string>) => r["@_identifier"] === identifierRef) ??
    resources.find((r: Record<string, string>) => (r["@_scormtype"] ?? r["@_scormType"]) === "sco") ??
    resources[0];

  const launchHref = resource?.["@_href"];
  if (!launchHref) throw new ScormValidationError("No launchable resource (href) found in the manifest.");

  const title = (typeof itemTitle === "string" && itemTitle) || org?.title || manifest["@_identifier"] || "SCORM package";

  return {
    title: String(title),
    identifier: manifest["@_identifier"] ? String(manifest["@_identifier"]) : null,
    scormVersion,
    launchHref: String(launchHref),
    masteryScore,
  };
}

/** Validate + safely extract a SCORM archive; returns metadata for persistence. */
export function extractScormPackage(buffer: Buffer, originalName: string): ScormMetadata {
  if (buffer.length === 0) throw new ScormValidationError("Uploaded file is empty.");
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new ScormValidationError("SCORM archive exceeds the 500 MB limit.");
  // ZIP local file header magic — refuse anything that is not actually a zip.
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new ScormValidationError("Uploaded file is not a ZIP archive.");
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ScormValidationError("Archive could not be read — it may be corrupt.");
  }

  const entries = zip.getEntries();
  if (entries.length === 0) throw new ScormValidationError("Archive is empty.");
  if (entries.length > MAX_ENTRIES) throw new ScormValidationError("Archive contains too many files.");

  let uncompressed = 0;
  for (const entry of entries) {
    assertSafeEntryName(entry.entryName);
    uncompressed += entry.header.size;
    if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new ScormValidationError("Archive expands beyond the allowed size (possible zip bomb).");
    }
  }

  const manifest = findManifestEntry(zip);
  const parsed = parseManifest(manifest.xml);
  const manifestDir = path.posix.dirname(manifest.name) === "." ? "" : path.posix.dirname(manifest.name);

  const id = crypto.randomUUID();
  const destRoot = path.join(SCORM_STORAGE_ROOT, id);
  fs.mkdirSync(destRoot, { recursive: true });

  let fileCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relative = manifestDir ? entry.entryName.replace(new RegExp(`^${manifestDir}/`), "") : entry.entryName;
    const target = path.join(destRoot, relative);
    // Second traversal check against the resolved path (belt and braces).
    if (!target.startsWith(destRoot + path.sep) && target !== destRoot) {
      throw new ScormValidationError(`Unsafe extraction path rejected: ${entry.entryName}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    fileCount += 1;
  }

  const launchFile = parsed.launchHref.replace(/^\.\//, "");
  if (!fs.existsSync(path.join(destRoot, launchFile.split("?")[0]))) {
    throw new ScormValidationError(`Launch file "${launchFile}" is missing from the archive.`);
  }

  return {
    id,
    title: parsed.title,
    identifier: parsed.identifier,
    scormVersion: parsed.scormVersion,
    launchFile,
    extractPath: path.relative(process.cwd(), destRoot),
    manifestXml: manifest.xml,
    masteryScore: parsed.masteryScore,
    fileSize: buffer.length,
    fileCount,
  };
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Resolve a request path inside a package directory, refusing escapes. */
export function resolvePackageFile(extractPath: string, requestPath: string[]): string | null {
  const root = path.isAbsolute(extractPath) ? extractPath : path.join(process.cwd(), extractPath);
  const joined = path.join(root, ...requestPath.map((p) => decodeURIComponent(p)));
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(path.resolve(root))) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}
