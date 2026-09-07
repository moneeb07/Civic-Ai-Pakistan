import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  reportImageAbsolutePath,
  safeReportKey,
  sniffImageMimeType,
} from "../src/lib/report-image-utils";

/*
 * The client's declared Content-Type is never trusted (brief: "Do not trust
 * ... MIME type from client"). These pin the actual signature bytes checked,
 * so a renamed .exe or a text file wearing an "image/jpeg" label is caught
 * regardless of what the upload claimed to be.
 */

describe("sniffImageMimeType", () => {
  it("identifies a real JPEG by its signature bytes", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(sniffImageMimeType(bytes), "image/jpeg");
  });

  it("identifies a real PNG by its signature bytes", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.equal(sniffImageMimeType(bytes), "image/png");
  });

  it("identifies a real WebP by its RIFF/WEBP signature", () => {
    const bytes = Buffer.from("RIFF\x00\x00\x00\x00WEBP", "binary");
    assert.equal(sniffImageMimeType(bytes), "image/webp");
  });

  it("rejects a file whose bytes don't match any known image signature, whatever it claims to be", () => {
    // A plain text file with a .jpg extension and an "image/jpeg" Content-Type
    // header is exactly the attack this check exists for.
    const bytes = Buffer.from("#!/bin/sh\necho not an image\n", "utf8");
    assert.equal(sniffImageMimeType(bytes), null);
  });

  it("rejects a truncated file too short to carry any real signature", () => {
    assert.equal(sniffImageMimeType(Buffer.from([0xff, 0xd8])), null);
  });

  it("does not misidentify a PNG as a JPEG or vice versa", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.notEqual(sniffImageMimeType(png), "image/jpeg");
  });
});

describe("reportImageAbsolutePath", () => {
  it("resolves a normal stored relative path", () => {
    const resolved = reportImageAbsolutePath("someUserId/someReportId.jpg");
    assert.ok(resolved.length > 0);
    assert.ok(resolved.endsWith("someUserId/someReportId.jpg"));
  });

  it("refuses a path-traversal attempt rather than escaping the upload root", () => {
    const resolved = reportImageAbsolutePath("../../../../etc/passwd");
    assert.equal(resolved, "");
  });

  it("refuses an absolute path override attempt", () => {
    const resolved = reportImageAbsolutePath("/etc/passwd");
    assert.equal(resolved, "");
  });
});

describe("safeReportKey", () => {
  /*
   * This is the only containment check left on the remote-storage path. With
   * files on disk the OS refuses a traversal for us; an object store happily
   * fetches whatever key it is given, so a stored value of
   * "../profile-images/victim.jpg" would return another citizen's photograph
   * unless it is rejected here.
   */
  it("accepts the shape the app actually writes", () => {
    assert.equal(safeReportKey("user_123/report_456.jpg"), "user_123/report_456.jpg");
  });

  it("rejects traversal out of the bucket", () => {
    assert.equal(safeReportKey("../profile-images/victim.jpg"), "");
    assert.equal(safeReportKey("user/../../etc/passwd"), "");
  });

  it("rejects a bare filename with no owner segment", () => {
    // Without the user id there is nothing tying the object to who owns it.
    assert.equal(safeReportKey("report_456.jpg"), "");
  });

  it("rejects anything deeper than owner/file", () => {
    assert.equal(safeReportKey("a/b/c.jpg"), "");
  });

  it("tolerates a leading or doubled slash rather than mangling it", () => {
    // Empty segments are dropped, so these normalise to the valid two-segment
    // key instead of being silently turned into something else.
    assert.equal(safeReportKey("/user_123/report_456.jpg"), "user_123/report_456.jpg");
    assert.equal(safeReportKey("user_123//report_456.jpg"), "user_123/report_456.jpg");
  });

  it("rejects an empty key", () => {
    assert.equal(safeReportKey(""), "");
  });
});
