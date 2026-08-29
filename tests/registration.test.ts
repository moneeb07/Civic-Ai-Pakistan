import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addressSchema,
  contactSchema,
  identitySchema,
  phoneSchema,
  profilePhotoSchema,
} from "../src/lib/registration/schema";

describe("phone validation (Pakistan)", () => {
  const accepted = [
    "03001234567",
    "+923001234567",
    "+92 300 1234567",
    "0300-1234567",
    "923001234567",
  ];

  for (const input of accepted) {
    it(`accepts ${input} and normalises it`, () => {
      const result = phoneSchema.safeParse(input);
      assert.equal(result.success, true, `expected ${input} to be accepted`);
      assert.equal(result.data, "+923001234567");
    });
  }

  const rejected = [
    ["12345", "too short"],
    ["+441234567890", "not a Pakistani number"],
    ["02001234567", "landline, not a mobile"],
    ["", "empty"],
  ] as const;

  for (const [input, why] of rejected) {
    it(`rejects "${input}" (${why})`, () => {
      assert.equal(phoneSchema.safeParse(input).success, false);
    });
  }
});

describe("identitySchema", () => {
  const valid = {
    fullName: "Ayesha Demo Khan",
    cnicNumber: "35202-1234567-1",
  };

  it("accepts name plus a valid CNIC", () => {
    assert.equal(identitySchema.safeParse(valid).success, true);
  });

  it("rejects a malformed CNIC", () => {
    const result = identitySchema.safeParse({ ...valid, cnicNumber: "123" });
    assert.equal(result.success, false);
  });

  it("rejects a missing name", () => {
    assert.equal(
      identitySchema.safeParse({ ...valid, fullName: "" }).success,
      false,
    );
  });

  it("treats every other identity field as optional", () => {
    // A CNIC that is worn, cropped or partly glared should still let a citizen
    // through on the fields that could be read.
    const result = identitySchema.safeParse({
      ...valid,
      fatherName: "",
      dateOfBirth: "",
      gender: undefined,
    });
    assert.equal(result.success, true);
  });

  it("rejects a gender value outside the allowed set", () => {
    const result = identitySchema.safeParse({ ...valid, gender: "Other-ish" });
    assert.equal(result.success, false);
  });
});

describe("contactSchema", () => {
  it("lower-cases the email", () => {
    const result = contactSchema.safeParse({
      phone: "03001234567",
      email: "Ayesha@Example.COM",
    });
    assert.equal(result.success, true);
    assert.equal(result.data!.email, "ayesha@example.com");
  });

  it("rejects a malformed email", () => {
    const result = contactSchema.safeParse({
      phone: "03001234567",
      email: "nope",
    });
    assert.equal(result.success, false);
  });
});

describe("addressSchema", () => {
  it("requires city and residential address", () => {
    assert.equal(
      addressSchema.safeParse({ city: "", residentialAddress: "" }).success,
      false,
    );
  });

  it("accepts optional sector, street, road and district", () => {
    const result = addressSchema.safeParse({
      city: "Islamabad",
      residentialAddress: "House 4, Block C",
      sector: "",
      street: "",
      road: "",
      district: "",
    });
    assert.equal(result.success, true);
  });

  it("accepts a district for cities that address by tehsil rather than sector", () => {
    const result = addressSchema.safeParse({
      city: "Multan",
      residentialAddress: "House 9, Gulgasht Colony",
      district: "Multan",
    });
    assert.equal(result.success, true);
  });
});

describe("profilePhotoSchema", () => {
  it("accepts a JPEG data URL", () => {
    const result = profilePhotoSchema.safeParse({
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    });
    assert.equal(result.success, true);
  });

  it("rejects a non-image data URL", () => {
    const result = profilePhotoSchema.safeParse({
      image: "data:text/html;base64,PHNjcmlwdD4=",
    });
    assert.equal(result.success, false);
  });

  it("rejects a remote URL, so nothing is fetched on the server's behalf", () => {
    const result = profilePhotoSchema.safeParse({
      image: "https://example.com/photo.jpg",
    });
    assert.equal(result.success, false);
  });

  it("rejects an oversized image", () => {
    const result = profilePhotoSchema.safeParse({
      image: `data:image/jpeg;base64,${"A".repeat(1_500_000)}`,
    });
    assert.equal(result.success, false);
  });
});
