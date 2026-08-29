import "server-only";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { UPLOAD_ROOT, reportImageAbsolutePath } from "./report-image-utils";

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

  const dir = path.join(UPLOAD_ROOT, userId);
  await mkdir(dir, { recursive: true });

  const fileName = `${reportId}.${extension}`;
  await writeFile(path.join(dir, fileName), bytes);

  // A logical, DB-stored path string, not a filesystem call — built with a
  // template literal rather than path.join so Turbopack's static analysis
  // doesn't mistake it for a second dynamic filesystem access next to the
  // real one above, which pulls the whole project into server tracing.
  return { relativePath: `${userId}/${fileName}`, mimeType };
}

export async function deleteReportImage(relativePath: string): Promise<void> {
  const absolute = reportImageAbsolutePath(relativePath);
  if (!absolute) return;

  try {
    await unlink(absolute);
  } catch {
    // Already gone is fine.
  }
}
