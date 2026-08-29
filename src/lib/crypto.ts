import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "node:crypto";

/*
 * Encryption and keyed hashing for sensitive identity data (currently CNIC).
 *
 * Never import this into a client component — it is Node-only by construction.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.CNIC_ENCRYPTION_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CNIC_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32",
      );
    }
    throw new Error(
      "CNIC_ENCRYPTION_KEY is not set. Add it to .env.local — see .env.example.",
    );
  }

  // A fixed salt is acceptable here: the input is already a high-entropy secret,
  // scrypt is only widening it to the 32 bytes AES-256 needs.
  cachedKey = scryptSync(secret, "civicai:cnic:v1", KEY_LENGTH);
  return cachedKey;
}

/**
 * Encrypts a sensitive value. Output is `iv.authTag.ciphertext`, base64url.
 * Each call produces different output for the same input — so this can never
 * be used for equality lookups. Use `hashSensitive` for that.
 */
export function encryptSensitive(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSensitive(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted payload.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Deterministic keyed hash, for duplicate detection without storing the value.
 *
 * HMAC rather than a bare digest on purpose: a CNIC is 13 digits, so roughly
 * 10^13 candidates. A plain SHA-256 column could be brute-forced offline in
 * hours if the database ever leaked. Without the key, this cannot.
 */
export function hashSensitive(value: string): string {
  return createHmac("sha256", getKey()).update(value).digest("hex");
}
