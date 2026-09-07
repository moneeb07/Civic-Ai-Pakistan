import "server-only";

import { REPORT_BUCKET, deleteObject, readObject, writeObject } from "@/lib/storage";
import { safeReportKey } from "./report-image-utils";

export {
  mimeTypeForReportPath,
  reportImageAbsolutePath,
  sniffImageMimeType,
} from "./report-image-utils";

/*
 * Report photos, stored the same way profile photos are
 * (src/lib/profile-image.ts): outside /public, served only through an
 * authenticated, ownership-checked route, so one citizen's evidence photo is
 * never guessable from a URL.
 *
 * Filed under the owning citizen's id specifically so a leaked report id
 * alone can't be used to enumerate or guess another citizen's photo path.
 */

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface StoredReportImage {
  relativePath: string;
  mimeType: string;
}

/**
 * Writes an already-validated image buffer for one report.
 *
 * Overwrites any previous photo for the same report (retaking a photo
 * replaces it, it doesn't accumulate).
 */
export async function storeReportImage(
  userId: string,
  reportId: string,
  bytes: Buffer,
  mimeType: string,
): Promise<StoredReportImage | null> {
  const extension = EXTENSIONS[mimeType];
  if (!extension) return null;

  // Filed under the owning citizen's id, so a leaked report id alone cannot
  // be used to guess or enumerate another citizen's photo.
  const relativePath = `${userId}/${reportId}.${extension}`;
  await writeObject(REPORT_BUCKET, relativePath, bytes, mimeType);

  return { relativePath, mimeType };
}

/** Reads a report photo back, or null when it is missing or the key is unsafe. */
export async function readReportImage(relativePath: string): Promise<Buffer | null> {
  const key = safeReportKey(relativePath);
  return key ? readObject(REPORT_BUCKET, key) : null;
}

export async function deleteReportImage(relativePath: string): Promise<void> {
  const key = safeReportKey(relativePath);
  if (key) await deleteObject(REPORT_BUCKET, key);
}
