/*
 * Applies the generated SQL migrations to whichever PostgreSQL the environment
 * points at: a real server via DATABASE_URL, or the local PGlite data directory.
 *
 *   npm run db:migrate
 */

const MIGRATIONS_FOLDER = "./drizzle";
const LOCAL_DATA_DIR = "./.data/civicai";

async function main() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");

    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });

    console.log("Applying migrations to PostgreSQL server…");
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.end();
  } else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");

    console.log(`Applying migrations to local PGlite database (${LOCAL_DATA_DIR})…`);
    // PGlite does not create intermediate directories.
    mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    const client = new PGlite(LOCAL_DATA_DIR);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client.close();
  }

  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
