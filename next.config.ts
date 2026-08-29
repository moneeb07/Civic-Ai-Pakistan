import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Both database drivers must be loaded by Node directly rather than bundled.
   *
   * PGlite ships a WASM payload that it locates with `new URL(...)`; bundling it
   * produces a second URL class that Node's fs rejects. `pg` loads native/optional
   * dependencies dynamically. Leaving both external keeps them working.
   */
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
