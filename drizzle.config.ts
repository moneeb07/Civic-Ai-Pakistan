import { defineConfig } from "drizzle-kit";

/*
 * Used only to GENERATE migrations (`npm run db:generate`).
 * Applying them is handled by `scripts/migrate.ts`, which supports both the
 * PostgreSQL server and the local PGlite driver.
 */
export default defineConfig({
  dialect: "postgresql",
  /*
   * Two entry points, not one: Stage 3's authority tables live in their own
   * file so that branch can be merged without touching the citizen-side
   * schema. drizzle-kit unions everything it is given here.
   */
  schema: ["./src/db/schema.ts", "./src/db/gov/collaboration.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/civicai",
  },
  verbose: true,
  strict: true,
});
