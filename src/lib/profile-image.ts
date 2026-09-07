import "server-only";

import path from "node:path";

import { PROFILE_BUCKET, deleteObject, readObject, writeObject } from "@/lib/storage";

/*
 * Profile photos are written outside the public directory and served through an
 * authenticated route, so one citizen's photo is never guessable from a URL.
 *
 * CNIC images are NOT stored here — or anywhere. They exist only in memory for
 * the duration of the extraction request.
 */

/*
 * Storage keys are flat here — one object per user, named by id. The bucket
 * decides WHERE that lives; this file only decides what it is called, which is
 * why the local path helper below survives even on Supabase.
 */

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

  const fileName = `${userId}.${extension}`;
  await writeObject(PROFILE_BUCKET, fileName, bytes, mimeType);

  return { relativePath: fileName, mimeType };
}

/**
 * Reads a stored photo back, or null when it is gone.
 *
 * basename() is the containment check: the stored value reaches here from a
 * database column, and a key of "../reports/someone-else.jpg" must not resolve
 * to another citizen's photograph.
 */
export async function readProfileImage(relativePath: string): Promise<Buffer | null> {
  return readObject(PROFILE_BUCKET, path.basename(relativePath));
}

export async function deleteProfileImage(relativePath: string): Promise<void> {
  await deleteObject(PROFILE_BUCKET, path.basename(relativePath));
}

export function mimeTypeForPath(relativePath: string): string {
  if (relativePath.endsWith(".png")) return "image/png";
  if (relativePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
