const os = require("node:os");
const path = require("node:path");

/*
 * The three values that differ from one developer's machine to the next.
 *
 * They used to live in app.json, which is committed — so every developer
 * overwrote the other two whenever they pushed, and each of them then hit a
 * different confusing error: a build refused for lack of permission on someone
 * else's Expo project, or an app that loads perfectly and fails every request
 * because it is pointed at a laptop on another continent's Wi-Fi.
 *
 * Expo reads this file after app.json and hands it the parsed result, so
 * app.json keeps everything that is genuinely shared — the name, the icons,
 * the permission strings, the native plugins — and only the per-machine parts
 * are resolved here, from the environment.
 *
 *   EXPO_PUBLIC_API_BASE_URL   where the Next.js API is reachable
 *   EAS_PROJECT_ID             which Expo project builds belong to
 *   EXPO_OWNER                 the Expo account that owns that project
 *
 * All three are optional. Cloning the repo and running `npx expo start`
 * should work with none of them set, which is why the API address falls back
 * to auto-detection rather than to a hardcoded address that is right for
 * exactly one person.
 */

// Expo's CLI loads .env itself, but EAS CLI and a bare `node app.config.js`
// do not always — so load it here too. Harmless when already loaded.
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {
  // dotenv is a transitive dependency, not a declared one. If it is missing,
  // real environment variables still work; only the .env file is skipped.
}

/**
 * This machine's address on the local network.
 *
 * A phone cannot reach "localhost" — that is the phone's own loopback, not the
 * computer's — so the dev server has to be named by its LAN address. Detecting
 * it means a new contributor runs `npx expo start` and it simply works, rather
 * than reading a paragraph explaining why their requests all fail.
 *
 * Returns localhost when there is no LAN interface, which is correct for a
 * simulator running on the same machine and wrong only for a physical device,
 * where EXPO_PUBLIC_API_BASE_URL is the answer.
 */
function detectLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Skip loopback and IPv6; a dev server is reached over IPv4 in practice.
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const port = process.env.EXPO_PUBLIC_API_PORT?.trim() || "3000";
  return `http://${detectLanAddress()}:${port}`;
}

module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const owner = process.env.EXPO_OWNER?.trim();

  return {
    ...config,

    /*
     * Omitted entirely when unset rather than set to undefined: EAS compares
     * `owner` against the project's real owner and rejects a mismatch, and an
     * absent field is how you say "whichever account this project belongs to".
     */
    ...(owner ? { owner } : {}),

    extra: {
      ...config.extra,
      apiBaseUrl: apiBaseUrl(),

      /*
       * No fallback project id on purpose. Someone else's id here would fail
       * with "Entity not authorized", which reads like a broken account rather
       * than a missing setting. Left out, `eas build` offers to create or link
       * a project instead, which is the right answer for a fresh clone.
       */
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
