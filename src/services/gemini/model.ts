import "server-only";

/*
 * Which Gemini model every service in CivicAI talks to.
 *
 * One constant, because the alternative bit hard: the model id was duplicated
 * across five service files, so a model becoming unavailable — or exhausting
 * its quota — meant hunting down five separate copies to change.
 *
 * Free-tier quota is bucketed PER MODEL, not per key and not per project, so
 * switching models is a genuine mitigation when one bucket is spent and not
 * merely a version bump. That makes this worth an environment variable: it can
 * be changed without a deploy, from the same .env.local the key lives in.
 *
 *   GEMINI_MODEL=gemini-3.6-flash npm run dev
 *
 * The default is the floating "latest" alias rather than a pinned version.
 * Normally pinning is right — a model that changes under you changes your
 * output — but a pinned id is exactly what breaks when Google retires a
 * version, which has already happened once on this project (gemini-2.5-flash
 * now returns 404 for this key). The alias keeps the app working; the env var
 * is there for the moment reproducibility matters more.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
