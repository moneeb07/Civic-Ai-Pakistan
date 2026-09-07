import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Where uploaded images actually live.
 *
 * Two backends behind one interface, chosen by whether Supabase Storage is
 * configured:
 *
 *   LOCAL DISK   — development. Files under .data/uploads/, which is gitignored.
 *   SUPABASE     — anywhere real. Survives a deploy, and is the same account
 *                  the database already lives in, so it adds no new service.
 *
 * WHY THIS EXISTS AT ALL. The app wrote straight to the local filesystem,
 * which works perfectly until it is deployed to a host with an ephemeral disk
 * — Vercel, Fly, most container platforms. There the upload SUCCEEDS, returns
 * 200, writes a path to the database, and the bytes are gone by the next
 * request. Every photograph a citizen took would silently disappear, and the
 * only symptom would be broken images later. A storage seam is the difference
 * between that and a deploy that just works.
 *
 * Supabase Storage is reached over its REST API with fetch rather than through
 * @supabase/supabase-js. The three operations needed here are one HTTP request
 * each, so the SDK would add a dependency and a client lifecycle to manage in
 * exchange for nothing.
 */

/** Buckets, one per kind of image. Both are PRIVATE — see readObject(). */
export const PROFILE_BUCKET = "profile-images";
export const REPORT_BUCKET = "report-images";

interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * Supabase Storage settings, or null when it is not configured.
 *
 * Requires a SECRET key, never the publishable one. The publishable key is
 * designed to be shipped to browsers and is fenced in by row-level security;
 * it cannot write to a private bucket. These writes happen on the server, for
 * a citizen the app has already authenticated, so they use the secret key —
 * which never leaves the server.
 *
 * Supabase renamed these keys: what the dashboard now calls a "Secret key"
 * (sb_secret_…) is the old "service_role" key. Both variable names are read so
 * that neither an older .env nor a newer one silently falls back to the local
 * disk — which on a serverless host means uploads that vanish rather than an
 * error anyone would notice.
 *
 * Falls back to the local disk when unset rather than throwing, so a fresh
 * clone runs with no cloud account at all.
 */
function supabase(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

/**
 * Auth headers for the Storage API.
 *
 * Both headers, deliberately. Supabase's gateway routes on `apikey` and its
 * storage service authorises on the bearer token; legacy JWT keys and the
 * newer sb_secret_ keys differ in which they lean on. Sending both works for
 * either, and costs nothing.
 */
function authHeaders(config: SupabaseConfig): Record<string, string> {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  };
}

/** True when uploads go to Supabase rather than the local disk. */
export function usingRemoteStorage(): boolean {
  return supabase() !== null;
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

/**
 * Resolves a storage key to a path inside the upload root, or "" if it escapes.
 *
 * The key reaches this function from a database column, so it is treated as
 * untrusted: a stored value of "../../etc/passwd" must not resolve to
 * something readable. Callers check for the empty string.
 */
function localPath(bucket: string, key: string): string {
  const root = path.join(LOCAL_ROOT, bucket);
  const resolved = path.resolve(root, key);
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : "";
}

function objectUrl(config: SupabaseConfig, bucket: string, key: string): string {
  // Each segment is encoded separately so that slashes in the key stay path
  // separators — report keys are "<userId>/<file>.jpg".
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${config.url}/storage/v1/object/${bucket}/${encoded}`;
}

/** Writes bytes, overwriting anything already at that key. */
export async function writeObject(
  bucket: string,
  key: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const config = supabase();

  if (!config) {
    const target = localPath(bucket, key);
    if (!target) throw new Error("Refusing to write outside the upload root.");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return;
  }

  const response = await fetch(objectUrl(config, bucket, key), {
    method: "POST",
    headers: {
      ...authHeaders(config),
      "Content-Type": mimeType,
      // Replace rather than fail on a re-upload: a citizen retaking their
      // profile photo writes to the same key by design.
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

/** Reads bytes back, or null when the object is missing. */
export async function readObject(bucket: string, key: string): Promise<Buffer | null> {
  const config = supabase();

  if (!config) {
    const target = localPath(bucket, key);
    if (!target) return null;
    try {
      return await readFile(target);
    } catch {
      return null;
    }
  }

  /*
   * Read through the service key rather than handing out a public URL. The
   * buckets are private on purpose: a report photo can show someone's street,
   * their gate, their car. The app already gates these behind an authenticated
   * route that checks ownership, and that check is worth nothing if the
   * underlying URL is guessable by anyone.
   */
  const response = await fetch(objectUrl(config, bucket, key), {
    headers: authHeaders(config),
  });

  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/** Removes an object. Missing is not an error — the desired state is reached. */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  const config = supabase();

  if (!config) {
    const target = localPath(bucket, key);
    if (!target) return;
    try {
      await unlink(target);
    } catch {
      // Already gone is fine.
    }
    return;
  }

  await fetch(objectUrl(config, bucket, key), {
    method: "DELETE",
    headers: authHeaders(config),
  }).catch(() => {
    // A failed cleanup must not fail the request that triggered it; the object
    // is orphaned, which is recoverable, where a 500 shown to the citizen is not.
  });
}
