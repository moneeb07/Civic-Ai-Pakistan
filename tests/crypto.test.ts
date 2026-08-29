import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

/*
 * The key must exist before the module is imported, because getKey() caches it.
 * This is a throwaway test key, not the development one.
 */
process.env.CNIC_ENCRYPTION_KEY ??= "dGVzdC1vbmx5LWtleS1mb3ItdW5pdC10ZXN0cy0xMjM0";

let encryptSensitive: typeof import("../src/lib/crypto").encryptSensitive;
let decryptSensitive: typeof import("../src/lib/crypto").decryptSensitive;
let hashSensitive: typeof import("../src/lib/crypto").hashSensitive;

before(async () => {
  const mod = await import("../src/lib/crypto");
  encryptSensitive = mod.encryptSensitive;
  decryptSensitive = mod.decryptSensitive;
  hashSensitive = mod.hashSensitive;
});

const SYNTHETIC_CNIC = "35202-1234567-1";

describe("encryptSensitive / decryptSensitive", () => {
  it("round-trips a value", () => {
    const encrypted = encryptSensitive(SYNTHETIC_CNIC);
    assert.equal(decryptSensitive(encrypted), SYNTHETIC_CNIC);
  });

  it("never leaves the plaintext visible in the ciphertext", () => {
    const encrypted = encryptSensitive(SYNTHETIC_CNIC);
    assert.equal(encrypted.includes(SYNTHETIC_CNIC), false);
    assert.equal(encrypted.includes("1234567"), false);
  });

  it("produces different ciphertext each time, so it cannot be used for lookups", () => {
    const a = encryptSensitive(SYNTHETIC_CNIC);
    const b = encryptSensitive(SYNTHETIC_CNIC);
    assert.notEqual(a, b);
  });

  it("rejects a tampered payload rather than returning wrong plaintext", () => {
    const encrypted = encryptSensitive(SYNTHETIC_CNIC);
    const [iv, tag, data] = encrypted.split(".");
    // Flip a character in the ciphertext; GCM's auth tag must catch it.
    const tampered = `${iv}.${tag}.${data.slice(0, -2)}${data.slice(-2) === "AA" ? "BB" : "AA"}`;

    assert.throws(() => decryptSensitive(tampered));
  });

  it("rejects a malformed payload", () => {
    assert.throws(() => decryptSensitive("nonsense"));
  });
});

describe("hashSensitive", () => {
  it("is deterministic, so duplicates can be detected", () => {
    assert.equal(hashSensitive(SYNTHETIC_CNIC), hashSensitive(SYNTHETIC_CNIC));
  });

  it("differs for different CNICs", () => {
    assert.notEqual(hashSensitive(SYNTHETIC_CNIC), hashSensitive("35202-7654321-1"));
  });

  it("does not contain the plaintext", () => {
    assert.equal(hashSensitive(SYNTHETIC_CNIC).includes("1234567"), false);
  });

  it("is keyed, not a bare digest a leaked table could be brute-forced against", async () => {
    const { createHash } = await import("node:crypto");
    const bareSha256 = createHash("sha256").update(SYNTHETIC_CNIC).digest("hex");

    assert.notEqual(hashSensitive(SYNTHETIC_CNIC), bareSha256);
  });
});
