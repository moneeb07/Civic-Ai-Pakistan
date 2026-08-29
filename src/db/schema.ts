import {
  boolean,
  doublePrecision,
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/*
 * Phase 1 schema.
 *
 * `user`, `session`, `account` and `verification` are the entities Better Auth
 * requires. `user_profile` holds CivicAI citizen data and is keyed by `user.id`,
 * which keeps credentials (in `account`) logically separate from identity.
 * `registration_session` is short-lived scratch space so that an abandoned
 * sign-up never leaves a half-built citizen in `user_profile`.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    // Identifies the credential's issuer. For email/password this is the app
    // itself; for a future social provider it is that provider's issuer URL.
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    // Hashed by Better Auth (scrypt). Never a plaintext password.
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/*
 * CivicAI citizen profile.
 *
 * CNIC is never stored in plaintext. Three derived columns serve three needs:
 *   cnic_hash       HMAC-SHA256 — duplicate detection without storing the number.
 *                   HMAC rather than a bare hash because a 13-digit CNIC has only
 *                   ~10^13 possibilities and a plain SHA-256 would be trivially
 *                   brute-forced from a leaked table.
 *   cnic_masked     what the UI displays, e.g. "35202-*******-1".
 *   cnic_encrypted  AES-256-GCM, for a future authorised verification integration.
 *
 * Email lives on `user` (Better Auth owns it) and is deliberately not duplicated.
 */
export const userProfile = pgTable(
  "user_profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // Identity — from the CNIC where the citizen confirmed it, else typed in.
    fullName: text("full_name").notNull(),
    fatherName: text("father_name"),
    cnicHash: text("cnic_hash").notNull().unique(),
    cnicMasked: text("cnic_masked").notNull(),
    cnicEncrypted: text("cnic_encrypted").notNull(),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender"),
    /** "cnic_scan" when extracted and confirmed, "manual" when typed. */
    identitySource: text("identity_source").notNull().default("manual"),

    // Contact — always entered by the citizen, never inferred.
    phone: text("phone").notNull(),

    /*
     * Address the citizen confirmed for reporting purposes. It MAY be
     * pre-filled from the CNIC's Present Address (read off the back) but is
     * never written without the citizen seeing and confirming it — see the
     * Address step. `sector` is an Islamabad-style code; `district` covers
     * every city that addresses by tehsil/district instead.
     */
    houseNumber: text("house_number"),
    city: text("city"),
    district: text("district"),
    sector: text("sector"),
    street: text("street"),
    road: text("road"),
    residentialAddress: text("residential_address"),

    /**
     * The Permanent Address exactly as printed on the CNIC's back, kept as a
     * single reference string — not decomposed, not used for routing. This is
     * a record of what the document says, separate from where the citizen
     * actually receives civic services.
     */
    permanentAddress: text("permanent_address"),

    profileImagePath: text("profile_image_path"),

    preferredLanguage: text("preferred_language").notNull().default("en"),
    assistedMode: boolean("assisted_mode").notNull().default(false),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("user_profile_user_id_idx").on(table.userId)],
);

/*
 * Temporary onboarding state, addressed by an httpOnly cookie.
 *
 * Registration spans several screens; writing each step straight to
 * `user_profile` would litter the table with abandoned rows. This holds the
 * work in progress instead and is deleted the moment the account is created.
 * `data` is a JSON blob; the CNIC number inside it is encrypted, and the
 * password is never written here at all.
 */
export const registrationSession = pgTable(
  "registration_session",
  {
    id: text("id").primaryKey(),
    step: text("step").notNull().default("identity"),
    data: text("data").notNull().default("{}"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("registration_session_expires_at_idx").on(table.expiresAt)],
);

/*
 * Stage 2 — a civic complaint draft.
 *
 * Deliberately flat rather than split into a separate "evidence" table: this
 * stage is one photo, one voice/typed description and one location per
 * report, so a join would buy nothing. Every AI-derived field (category,
 * description, severity) carries a matching `*Source` column so the UI can
 * show "AI-generated" and the badge disappears the instant the citizen edits
 * it — the same "a field the citizen touches is theirs now" rule the CNIC
 * flow uses (see identity-flow.tsx).
 *
 * No CNIC, no address-book fields, no password: this table only needs enough
 * to identify the citizen (`user_id`) and describe the problem.
 */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** draft -> analyzing -> ready_for_review -> ready_for_submission */
    status: text("status").notNull().default("draft"),

    // -- Vision --------------------------------------------------------------
    imagePath: text("image_path"),
    imageMimeType: text("image_mime_type"),
    category: text("category"),
    categorySource: text("category_source"),
    visionConfidence: doublePrecision("vision_confidence"),
    /** Short, image-grounded phrases the model gave for its own guess — never a fact by itself. */
    visionEvidence: text("vision_evidence"),
    visionConfirmed: boolean("vision_confirmed").notNull().default(false),

    // -- Voice / text description ---------------------------------------------
    /** Exactly what was heard or typed — never translated, never rewritten. */
    transcript: text("transcript"),
    transcriptLanguage: text("transcript_language"),
    transcriptSource: text("transcript_source"),

    // -- Location --------------------------------------------------------------
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationAccuracyMeters: doublePrecision("location_accuracy_meters"),
    locationLabel: text("location_label"),
    locationSource: text("location_source"),

    // -- Generated complaint -----------------------------------------------------
    title: text("title"),
    titleSource: text("title_source"),
    description: text("description"),
    descriptionSource: text("description_source"),
    severity: text("severity"),
    severitySource: text("severity_source"),

    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("report_user_id_idx").on(table.userId),
    index("report_status_idx").on(table.status),
    index("report_created_at_idx").on(table.createdAt),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  userProfile,
  registrationSession,
  report,
};
