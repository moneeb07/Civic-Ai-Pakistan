import path from "node:path";

/*
 * The pure parts of report-image handling — path resolution and byte
 * sniffing, no filesystem I/O. Kept out of report-image.ts specifically so
 * these are importable from a plain Node test without tripping the
 * `server-only` guard the real file-writing functions correctly carry (that
 * guard exists to stop this code from ever reaching a client bundle, not to
 * stop pure logic like this from being unit-tested directly).
 */

const UPLOAD_ROOT = path.join(process.cwd(), ".data", "uploads", "reports");

export function reportImageAbsolutePath(relativePath: string): string {
  // Resolve and confine to the upload root so a crafted stored value cannot
  // escape the directory.
  const resolved = path.resolve(UPLOAD_ROOT, relativePath);
  return resolved.startsWith(UPLOAD_ROOT) ? resolved : "";
}

export function mimeTypeForReportPath(relativePath: string): string {
  if (relativePath.endsWith(".png")) return "image/png";
  if (relativePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * Identifies an image's real format from its own bytes — the client's
 * declared Content-Type is never trusted on its own. Returns null for
 * anything that isn't a JPEG, PNG or WebP signature, whatever the upload
 * claimed to be.
 */
export function sniffImageMimeType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  const isRiff = bytes.subarray(0, 4).toString("ascii") === "RIFF";
  const isWebp = bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (isRiff && isWebp) return "image/webp";

  return null;
}

export { UPLOAD_ROOT };
