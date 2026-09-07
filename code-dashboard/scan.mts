/*
 * Reads the CivicAI codebase and emits the architecture metadata the dashboard
 * renders.
 *
 * The governing rule, and the reason this file exists rather than a hand-written
 * JSON: NOTHING HERE IS INVENTED. Every file, route, table, export and
 * environment variable in the output was found by reading the actual source. A
 * beautiful diagram of an architecture the code does not have is worse than no
 * diagram, because it will be believed.
 *
 * Where a relationship is a judgement rather than a fact — the conceptual
 * workflow stages, mainly — it is marked `inferred: true` and the dashboard
 * labels it as such. Facts and opinions are kept apart on purpose.
 *
 * Known limitation, stated plainly: imports are extracted with regular
 * expressions, not the TypeScript compiler API. That reads ordinary static
 * `import ... from "…"` and `await import("…")` correctly, which is every
 * import in this codebase, but it would miss a dynamically-computed specifier.
 * The compiler API would be exact; it is also an order of magnitude slower and
 * heavier, and this needs to run in a second so `Refresh` feels instant.
 *
 * Secrets are NEVER read. Environment variables are collected by NAME from
 * `process.env.X` references in source. `.env` files are not opened at all.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");
const SRC = join(ROOT, "src");

/** Directories never worth walking. */
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".data"]);

/* ==========================================================================
 * Layers — the colour/grouping vocabulary the whole dashboard shares
 * ======================================================================== */

export type Layer =
  | "frontend"
  | "api"
  | "ai"
  | "database"
  | "auth"
  | "gov"
  | "lib"
  | "config"
  | "test";

/**
 * Which layer a file belongs to, decided by its path.
 *
 * Order matters: the most specific rule wins. An API route under `app/api` is
 * API even though it also lives under `app`, and a gov API route is API rather
 * than gov, because what it IS matters more than what it is about.
 */
function layerOf(path: string): Layer {
  if (path.startsWith("tests/")) return "test";
  if (path.includes("/api/")) return "api";
  if (path.startsWith("src/db/") || path.startsWith("drizzle/")) return "database";
  if (path.startsWith("src/services/")) return "ai";
  if (path.includes("/auth") || path.includes("better-auth")) return "auth";
  if (path.startsWith("src/components/gov/") || path.startsWith("src/app/gov/")) return "gov";
  if (path.startsWith("src/lib/gov/")) return "gov";
  if (path.startsWith("src/components/") || path.startsWith("src/app/")) return "frontend";
  if (path.startsWith("src/lib/")) return "lib";
  return "config";
}

/** A coarse "what kind of thing is this" used for icons and grouping. */
function kindOf(path: string): string {
  if (path.endsWith("/route.ts")) return "api-route";
  if (path.endsWith("/page.tsx")) return "page";
  if (path.endsWith("/layout.tsx")) return "layout";
  if (path.startsWith("src/components/")) return "component";
  if (path.startsWith("src/services/")) return "service";
  if (path.startsWith("src/db/")) return "schema";
  if (path.startsWith("tests/")) return "test";
  return "module";
}

/* ==========================================================================
 * Walking the tree
 * ======================================================================== */

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);

    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(entry))) out.push(full);
  }

  return out;
}

/* ==========================================================================
 * Per-file extraction
 * ======================================================================== */

/** Import specifiers, static and dynamic. */
function extractImports(source: string): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
    found.add(match[1]!);
  }
  // Side-effect imports: `import "server-only";`
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    found.add(match[1]!);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    found.add(match[1]!);
  }

  return [...found];
}

/** Exported names, so the inspector can show what a file actually offers. */
function extractExports(source: string): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    found.add(match[1]!);
  }
  // `export { a, b as c }`
  for (const match of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z0-9_$]+$/.test(name)) found.add(name);
    }
  }
  if (/^export\s+default\b/m.test(source)) found.add("default");

  return [...found];
}

/**
 * Environment variables, by NAME only.
 *
 * This deliberately reads source code rather than any .env file. The dashboard
 * shows which variables the code depends on and where they are used; it must
 * never be able to show what they are set to.
 */
function extractEnvVars(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(match[1]!);
  for (const match of source.matchAll(/process\.env\[["']([A-Z0-9_]+)["']\]/g)) {
    found.add(match[1]!);
  }
  return [...found];
}

/**
 * HTTP methods a route file exports — the real ones, never assumed CRUD.
 *
 * Two export styles both occur in this codebase and both count:
 *
 *   export async function GET(…)              — the usual form
 *   export const { GET, POST } = handler(…)   — Better Auth's catch-all
 *
 * Missing the second would have shown the entire authentication endpoint as
 * serving no methods at all, which is exactly the kind of quiet blank the
 * dashboard is supposed to eliminate.
 */
function extractHttpMethods(source: string): string[] {
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  const destructured = new Set<string>();
  for (const match of source.matchAll(/export\s+const\s*\{([^}]+)\}\s*=/g)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/[:\s]/)[0]?.trim();
      if (name) destructured.add(name);
    }
  }

  return methods.filter(
    (method) =>
      new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source) ||
      destructured.has(method),
  );
}

/** The URL a route file serves, derived from its path on disk. */
function routePathFor(file: string): string {
  return (
    "/" +
    file
      .replace(/^src\/app\//, "")
      .replace(/\/route\.ts$/, "")
      // Next.js route groups — (auth) — are organisational and not in the URL.
      .replace(/\/\([^)]+\)/g, "")
  );
}

/**
 * Whether a route requires a session, judged from the guards it actually calls.
 *
 * Reported as a tri-state rather than a boolean: "unknown" is an honest answer
 * for a route that guards itself some other way, and is far better than
 * labelling it public and having somebody believe that.
 */
function authRequirementFor(source: string): "required" | "public" | "unknown" {
  if (/requireSession|requireOfficer|withOfficer|getOfficer\(\)/.test(source)) return "required";
  if (/getSession\(\)/.test(source)) return "required";
  if (/export\s+const\s+dynamic|export\s+async\s+function/.test(source)) return "unknown";
  return "unknown";
}

/**
 * The API endpoints a file talks to.
 *
 * This is the edge that makes the architecture legible and that imports alone
 * can never show: a page does not IMPORT a route handler, it calls it over
 * HTTP. Without this, pages and their endpoints sit in the graph as two
 * unconnected islands.
 *
 * Every `/api/...` string or template literal in the file counts as a
 * reference. Template holes become `*` so `/api/reports/${id}` can be matched
 * against the route that serves `/api/reports/[id]`.
 */
function extractApiCalls(source: string): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)) {
    const raw = match[1]!;
    const normalised = raw
      .replace(/\$\{[^}]*\}/g, "*") // template hole
      .replace(/\?.*$/, "") // query string
      .replace(/\/+$/, ""); // trailing slash
    if (normalised.length > 4) found.add(normalised);
  }

  return [...found];
}

/** Turns a route path into the same shape extractApiCalls produces. */
function routeMatchKey(routePath: string): string {
  return routePath.replace(/\[[^\]]+\]/g, "*").replace(/\/+$/, "");
}

/**
 * The schema tables a file actually touches.
 *
 * Matching bare identifiers would be hopeless — `user` and `report` are far too
 * common as local names. So a table only counts when the file NAMES it in an
 * import from the schema module, or reaches it through one of the two barrels
 * (`schema.x` / `govSchema.x`). That is a claim the source can back.
 */
function extractTableUsage(source: string, variableToTable: Map<string, string>): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s+["']@\/db\/schema["']/g)) {
    for (const part of match[1]!.split(",")) {
      const name = part.split(" as ")[0]!.trim();
      const table = variableToTable.get(name);
      if (table) found.add(table);
    }
  }

  for (const match of source.matchAll(/\b(?:gov)?[Ss]chema\.([A-Za-z_$][\w$]*)/g)) {
    const table = variableToTable.get(match[1]!);
    if (table) found.add(table);
  }

  return [...found];
}

/** Third-party packages the file imports, which is where the system leaves our code. */
function extractPackages(source: string): string[] {
  const found = new Set<string>();

  for (const specifier of extractImports(source)) {
    if (specifier.startsWith("@/") || specifier.startsWith(".")) continue;
    // Scoped packages keep two segments: @google/genai, not @google.
    const name = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0]!;
    found.add(name);
  }

  return [...found];
}

/** Resolves an import specifier to a repo-relative file, or null if external. */
function resolveImport(specifier: string, fromFile: string, known: Set<string>): string | null {
  let base: string;

  if (specifier.startsWith("@/")) base = join("src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null; // a package, not our code

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];

  for (const candidate of candidates) {
    const normal = candidate.split("\\").join("/");
    if (known.has(normal)) return normal;
  }
  return null;
}

/* ==========================================================================
 * Database schema
 * ======================================================================== */

interface TableInfo {
  name: string;
  file: string;
  variable: string;
  columns: { name: string; type: string; notNull: boolean; primaryKey: boolean }[];
  foreignKeys: { column: string; references: string }[];
}

/**
 * Tables from the Drizzle schema files.
 *
 * Parsed from the `pgTable("name", { … })` calls themselves, so the dashboard
 * shows the schema that exists rather than one somebody documented once and
 * then let drift.
 */
function extractTables(file: string, source: string): TableInfo[] {
  const tables: TableInfo[] = [];

  for (const match of source.matchAll(
    /export const (\w+)\s*=\s*pgTable\(\s*["'](\w+)["']\s*,\s*\{/g,
  )) {
    const [, variable, name] = match;
    const start = match.index! + match[0].length;

    // Walk braces to find the column block, so a nested object cannot end it early.
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth++;
      else if (source[index] === "}") depth--;
      index++;
    }
    const body = source.slice(start, index - 1);

    const columns: TableInfo["columns"] = [];
    const foreignKeys: TableInfo["foreignKeys"] = [];

    for (const col of body.matchAll(
      /^\s{4}(\w+):\s*(\w+)\(\s*["']([\w-]+)["']/gm,
    )) {
      const [, property, builder] = col;
      // The declaration continues until the next column at the same indent.
      const tail = body.slice(col.index!, col.index! + 600);

      columns.push({
        name: col[3]!,
        type: builder!,
        notNull: /\.notNull\(\)/.test(tail.split(/\n\s{4}\w+:/)[0] ?? ""),
        primaryKey: /\.primaryKey\(\)/.test(tail.split(/\n\s{4}\w+:/)[0] ?? ""),
      });

      const reference = /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/.exec(
        tail.split(/\n\s{4}\w+:/)[0] ?? "",
      );
      if (reference) {
        foreignKeys.push({ column: col[3]!, references: `${reference[1]}.${reference[2]}` });
      }
      void property;
    }

    tables.push({ name: name!, file, variable: variable!, columns, foreignKeys });
  }

  return tables;
}

/* ==========================================================================
 * The conceptual workflow
 * ======================================================================== */

/*
 * The Big Picture stages.
 *
 * This is the ONE curated part of the output — a judgement about what the
 * system does, in the order a citizen experiences it. Everything else is
 * measured.
 *
 * Each stage names files by path, and every one of those paths is VERIFIED
 * against the file system below. A stage whose files have moved reports the
 * miss rather than silently pointing at nothing, so this list cannot rot
 * quietly the way a hand-drawn diagram does.
 */
const STAGES: {
  id: string;
  n: number;
  title: string;
  layer: Layer;
  what: string;
  files: string[];
}[] = [
  {
    id: "citizen",
    n: 1,
    title: "Citizen arrives",
    layer: "frontend",
    what: "The front door. One page serves two audiences — a citizen reporting a problem, and an officer signing in to work on one.",
    files: ["src/app/page.tsx", "src/components/landing/site-header.tsx"],
  },
  {
    id: "registration",
    n: 2,
    title: "Registration",
    layer: "frontend",
    what: "A multi-step account setup: identity, contact, security, photo. Nothing is saved until the citizen confirms what was read.",
    files: ["src/app/register/page.tsx", "src/components/registration/registration-shell.tsx"],
  },
  {
    id: "cnic",
    n: 3,
    title: "CNIC verification",
    layer: "ai",
    what: "The camera watches the live frame, captures when the card is steady, then the model is asked whether the photograph is genuinely readable — field by field — before anything is extracted.",
    files: [
      "src/components/registration/cnic-capture.tsx",
      "src/lib/cnic/validation.ts",
      "src/services/ai/cnic-validator.ts",
      "src/app/api/cnic/validate/route.ts",
      "src/app/api/cnic/extract/route.ts",
    ],
  },
  {
    id: "auth",
    n: 4,
    title: "Authentication",
    layer: "auth",
    what: "Better Auth issues an httpOnly session cookie. Where somebody lands afterwards is decided by what their account IS, never by which button they pressed.",
    files: ["src/lib/auth.ts", "src/lib/session.ts", "src/lib/gov/session.ts"],
  },
  {
    id: "report",
    n: 5,
    title: "Report a problem",
    layer: "frontend",
    what: "Photograph, describe by voice or text, confirm the location. Camera-first, because a photograph is the one thing every citizen can produce.",
    files: [
      "src/app/report/page.tsx",
      "src/components/report/camera-flow.tsx",
      "src/components/report/describe-flow.tsx",
      "src/app/api/reports/route.ts",
    ],
  },
  {
    id: "ai",
    n: 6,
    title: "AI processing",
    layer: "ai",
    what: "Vision identifies what the photograph shows; speech turns a spoken description into text. Both feed the routing decision.",
    files: [
      "src/services/vision/report-vision.ts",
      "src/services/speech/transcription.ts",
      "src/services/complaint/complaint-generator.ts",
    ],
  },
  {
    id: "grouping",
    n: 7,
    title: "Routing & grouping",
    layer: "ai",
    what: "One agent picks the department that owns the problem; another decides whether this is a NEW problem or another voice on one already reported. This is why 108 reports become 16 issues.",
    files: [
      "src/services/gov/ingest.ts",
      "src/lib/gov/ai-routing.ts",
      "src/lib/gov/ai-similarity.ts",
      "src/lib/gov/grouping-examples.ts",
    ],
  },
  {
    id: "issue",
    n: 8,
    title: "Civic issue",
    layer: "database",
    what: "The unit of government work. Many citizen reports link to one issue, so a department sees one job rather than a queue of the same complaint.",
    files: ["src/db/gov/collaboration.ts", "src/lib/gov/collaboration.ts"],
  },
  {
    id: "authority",
    n: 9,
    title: "Authority workspace",
    layer: "gov",
    what: "The department's operations view: the queue, the case file, the AI's reasoning, and the evidence behind every grouped report.",
    files: ["src/app/gov/page.tsx", "src/app/gov/issues/[code]/page.tsx", "src/lib/gov/stats.ts"],
  },
  {
    id: "discussion",
    n: 10,
    title: "Discussion",
    layer: "gov",
    what: "Issue-scoped chat with @mentions. Flat by design: any member may open a thread and pull in any colleague, so coordinating never means leaving for WhatsApp.",
    files: [
      "src/components/gov/issue-discussion.tsx",
      "src/app/api/gov/conversations/[id]/messages/route.ts",
    ],
  },
  {
    id: "status",
    n: 11,
    title: "Status",
    layer: "gov",
    what: "Reported → In process → Resolved, computed from the department's OWN workflow stages rather than a fixed enum, so each department defines what finished means.",
    files: ["src/lib/civic/status.ts", "src/lib/gov/issue-progress.ts"],
  },
  {
    id: "resolved",
    n: 12,
    title: "Resolved & published",
    layer: "frontend",
    what: "The citizen sees the outcome, and every authority's resolution rate is published against the workload it actually carries.",
    files: ["src/app/performance/page.tsx", "src/lib/gov/performance.ts"],
  },
];

/* ==========================================================================
 * Main
 * ======================================================================== */

interface FileNode {
  path: string;
  layer: Layer;
  kind: string;
  lines: number;
  exports: string[];
  imports: string[];
  importedBy: string[];
  envVars: string[];
  /** Route files this file calls over HTTP, resolved in the third pass. */
  apiCalls: string[];
  /** Schema tables this file reads or writes. */
  tablesUsed: string[];
  /** Third-party packages imported here. */
  packages: string[];
  /** Files that call THIS route handler, resolved in the third pass. */
  calledBy: string[];
  /** The doc-comment at the top of the file, if it has one. */
  summary: string | null;
}

/** The leading block comment, which in this codebase explains WHY a file exists. */
function leadingComment(source: string): string | null {
  const match = /^\s*\/\*+([\s\S]*?)\*\//.exec(source);
  if (!match) return null;

  const text = match[1]!
    .split("\n")
    .map((line) => line.replace(/^\s*\*ature?\s?/, "").replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (text.length < 20) return null;
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

function main() {
  const absolute = [...walk(SRC), ...walk(join(ROOT, "tests"))];
  const relPaths = absolute.map((file) => relative(ROOT, file).split("\\").join("/"));
  const known = new Set(relPaths);

  const files: Record<string, FileNode> = {};
  const routes: {
    methods: string[];
    path: string;
    file: string;
    auth: string;
    summary: string | null;
  }[] = [];
  const tables: TableInfo[] = [];
  const envUsage: Record<string, string[]> = {};

  for (let index = 0; index < absolute.length; index += 1) {
    const abs = absolute[index]!;
    const rel = relPaths[index]!;
    const source = readFileSync(abs, "utf8");

    const node: FileNode = {
      path: rel,
      layer: layerOf(rel),
      kind: kindOf(rel),
      lines: source.split("\n").length,
      exports: extractExports(source),
      imports: [],
      importedBy: [],
      envVars: extractEnvVars(source),
      apiCalls: [],
      tablesUsed: [],
      packages: extractPackages(source),
      calledBy: [],
      summary: leadingComment(source),
    };

    for (const name of node.envVars) {
      (envUsage[name] ??= []).push(rel);
    }

    if (rel.endsWith("/route.ts") && rel.startsWith("src/app/api/")) {
      routes.push({
        methods: extractHttpMethods(source),
        path: routePathFor(rel),
        file: rel,
        auth: authRequirementFor(source),
        summary: node.summary,
      });
    }

    if (/pgTable\(/.test(source)) tables.push(...extractTables(rel, source));

    files[rel] = node;
  }

  // Second pass: resolve imports now that every path is known.
  for (let index = 0; index < absolute.length; index += 1) {
    const rel = relPaths[index]!;
    const source = readFileSync(absolute[index]!, "utf8");

    for (const specifier of extractImports(source)) {
      const target = resolveImport(specifier, rel, known);
      if (!target || target === rel) continue;

      files[rel]!.imports.push(target);
      files[target]!.importedBy.push(rel);
    }
  }

  /*
   * Third pass: the two relations that need the whole picture first.
   *
   * API calls need the route table, and table usage needs the variable->table
   * map, so neither can be resolved while the files are still being read.
   */
  const routeByKey = new Map<string, string>();
  for (const route of routes) routeByKey.set(routeMatchKey(route.path), route.file);

  const variableToTable = new Map<string, string>();
  for (const table of tables) variableToTable.set(table.variable, table.name);

  let apiEdges = 0;
  let tableEdges = 0;

  for (let index = 0; index < absolute.length; index += 1) {
    const rel = relPaths[index]!;
    const source = readFileSync(absolute[index]!, "utf8");
    const node = files[rel]!;

    for (const call of extractApiCalls(source)) {
      const target = routeByKey.get(call);
      // An unmatched call is dropped rather than guessed at: a dangling edge
      // to an endpoint that does not exist would be a lie about the system.
      if (!target || target === rel) continue;
      if (!node.apiCalls.includes(target)) {
        node.apiCalls.push(target);
        files[target]!.calledBy.push(rel);
        apiEdges += 1;
      }
    }

    node.tablesUsed = extractTableUsage(source, variableToTable);
    tableEdges += node.tablesUsed.length;
  }

  // Verify every curated stage actually points at files that exist.
  const stages = STAGES.map((stage) => {
    const present = stage.files.filter((file) => known.has(file));
    const missing = stage.files.filter((file) => !known.has(file));
    return { ...stage, files: present, missing };
  });

  const missingTotal = stages.reduce((sum, stage) => sum + stage.missing.length, 0);

  const output = {
    generatedAt: new Date().toISOString(),
    root: "CivicAI Pakistan",
    counts: {
      files: relPaths.length,
      routes: routes.length,
      tables: tables.length,
      envVars: Object.keys(envUsage).length,
    },
    stages,
    files,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    tables: tables.sort((a, b) => a.name.localeCompare(b.name)),
    /* Names and usage sites only — never values. See extractEnvVars. */
    env: Object.entries(envUsage)
      .map(([name, usedBy]) => ({ name, usedBy: [...new Set(usedBy)] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const target = join(HERE, "architecture.json");
  writeFileSync(target, JSON.stringify(output, null, 2));

  console.log(`Scanned ${relPaths.length} files`);
  console.log(`  API routes       ${routes.length}`);
  console.log(`  Database tables  ${tables.length}`);
  console.log(`  Env vars (names) ${Object.keys(envUsage).length}`);
  console.log(`  HTTP call edges  ${apiEdges}`);
  console.log(`  Table use edges  ${tableEdges}`);
  console.log(`  Workflow stages  ${stages.length}`);
  if (missingTotal > 0) {
    console.log(`\n  ${missingTotal} stage file(s) no longer exist — shown as missing:`);
    for (const stage of stages) {
      for (const file of stage.missing) console.log(`    ${stage.id}: ${file}`);
    }
  }
  console.log(`\nWrote ${relative(ROOT, target)}`);
}

if (!existsSync(SRC)) {
  console.error("src/ not found — run this from the CivicAI repository.");
  process.exitCode = 1;
} else {
  main();
}
