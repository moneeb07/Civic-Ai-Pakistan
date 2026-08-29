import "server-only";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/*
 * Profile photos are written outside the public directory and served through an
 * authenticated route, so one citizen's photo is never guessable from a URL.
 *
 * CNIC images are NOT stored here — or anywhere. They exist only in memory for
 * the duration of the extraction request.
 */

const UPLOAD_ROOT = path.join(process.cwd(), ".data", "uploads", "profile");

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface StoredImage {
  relativePath: string;
  mimeType: string;
}

/** Decodes a browser-produced data URL and writes it under the user's id. */
export async function storeProfileImage(
  userId: string,
  dataUrl: string,
): Promise<StoredImage | null> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1];
  const extension = EXTENSIONS[mimeType];
  if (!extension) return null;

  const bytes = Buffer.from(match[2], "base64");

  await mkdir(UPLOAD_ROOT, { recursive: true });

  const fileName = `${userId}.${extension}`;
  await writeFile(path.join(UPLOAD_ROOT, fileName), bytes);

  return { relativePath: fileName, mimeType };
}

export function profileImageAbsolutePath(relativePath: string): string {
  // Resolve and confine to the upload root so a crafted stored value cannot
  // escape the directory.
  const resolved = path.resolve(UPLOAD_ROOT, path.basename(relativePath));
  return resolved.startsWith(UPLOAD_ROOT) ? resolved : "";
}

export async function deleteProfileImage(relativePath: string): Promise<void> {
  const absolute = profileImageAbsolutePath(relativePath);
  if (!absolute) return;

  try {
    await unlink(absolute);
  } catch {
    // Already gone is fine.
  }
}

export function mimeTypeForPath(relativePath: string): string {
  if (relativePath.endsWith(".png")) return "image/png";
  if (relativePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
