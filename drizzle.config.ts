import { defineConfig } from "drizzle-kit";

/*
 * Used only to GENERATE migrations (`npm run db:generate`).
 * Applying them is handled by `scripts/migrate.ts`, which supports both the
 * PostgreSQL server and the local PGlite driver.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/civicai",
  },
  verbose: true,
  strict: true,
});
