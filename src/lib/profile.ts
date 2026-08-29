import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

/*
 * Read helpers for the citizen profile.
 *
 * Note what is never selected: `cnicEncrypted` and `cnicHash`. Callers get the
 * masked form only. If a future authorised integration needs the real number it
 * must decrypt it deliberately, not receive it by accident.
 */

export interface CitizenProfile {
  fullName: string;
  fatherName: string | null;
  cnicMasked: string;
  dateOfBirth: string | null;
  gender: string | null;
  identitySource: string;
  phone: string;
  houseNumber: string | null;
  city: string | null;
  district: string | null;
  sector: string | null;
  street: string | null;
  road: string | null;
  residentialAddress: string | null;
  /** As printed on the CNIC's back — a record, not necessarily where the citizen lives now. */
  permanentAddress: string | null;
  hasProfileImage: boolean;
  preferredLanguage: string;
  assistedMode: boolean;
  createdAt: Date;
}

export async function getCitizenProfile(
  userId: string,
): Promise<CitizenProfile | null> {
  const [row] = await db
    .select({
      fullName: schema.userProfile.fullName,
      fatherName: schema.userProfile.fatherName,
      cnicMasked: schema.userProfile.cnicMasked,
      dateOfBirth: schema.userProfile.dateOfBirth,
      gender: schema.userProfile.gender,
      identitySource: schema.userProfile.identitySource,
      phone: schema.userProfile.phone,
      houseNumber: schema.userProfile.houseNumber,
      city: schema.userProfile.city,
      district: schema.userProfile.district,
      sector: schema.userProfile.sector,
      street: schema.userProfile.street,
      road: schema.userProfile.road,
      residentialAddress: schema.userProfile.residentialAddress,
      permanentAddress: schema.userProfile.permanentAddress,
      profileImagePath: schema.userProfile.profileImagePath,
      preferredLanguage: schema.userProfile.preferredLanguage,
      assistedMode: schema.userProfile.assistedMode,
      createdAt: schema.userProfile.createdAt,
    })
    .from(schema.userProfile)
    .where(eq(schema.userProfile.userId, userId))
    .limit(1);

  if (!row) return null;

  const { profileImagePath, ...rest } = row;
  return { ...rest, hasProfileImage: Boolean(profileImagePath) };
}

/** Internal: the stored file name, for the authenticated image route only. */
export async function getProfileImagePath(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ profileImagePath: schema.userProfile.profileImagePath })
    .from(schema.userProfile)
    .where(eq(schema.userProfile.userId, userId))
    .limit(1);

  return row?.profileImagePath ?? null;
}
