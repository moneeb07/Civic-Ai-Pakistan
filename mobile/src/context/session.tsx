import * as React from "react";

import { api, ApiError, signIn as apiSignIn, signOut as apiSignOut } from "@/api/client";
import type { Me } from "@/api/types";

/*
 * Who is signed in, and which face of the app they are currently using.
 *
 * The product decision this file implements: ONE app, with a role switch,
 * rather than a citizen app and an officer app. An officer of the water
 * department is also a resident with a broken streetlight outside their house,
 * and making them install a second app to report it would be absurd.
 *
 * So `mode` is a view preference, never a permission. Switching to officer mode
 * does not grant anything — the server decides that on every request, from the
 * session. If someone's officer record is revoked while the app is open, the
 * next request simply 401s or 404s and the app drops back to citizen mode.
 */

export type Mode = "citizen" | "officer";

interface SessionValue {
  me: Me | null;
  loading: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [mode, setModeState] = React.useState<Mode>("citizen");

  /*
   * Whether the default mode has been chosen yet.
   *
   * A ref, not state: this must be readable inside `refresh` without making
   * `refresh` change identity, and reading `me` there instead would see a stale
   * value and re-apply the default on every refresh — quietly dragging an
   * officer who had switched to citizen mode back to the department view.
   */
  const defaultApplied = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api<Me>("/api/me");
      setMe(next);

      if (!next.canSwitch) {
        // Not staff (or no longer staff): officer mode is not a view they have.
        setModeState("citizen");
      } else if (!defaultApplied.current) {
        // Officers land in officer mode on first load, because that is what
        // they opened the app for on a working day. Afterwards their own choice
        // stands, and a refresh never overrides it.
        setModeState("officer");
      }

      defaultApplied.current = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        defaultApplied.current = false;
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh().catch(() => setLoading(false));
  }, [refresh]);

  const value = React.useMemo<SessionValue>(
    () => ({
      me,
      loading,
      mode,
      setMode: (next) => {
        // Guarded so a stale screen cannot put a non-officer into officer mode
        // and leave them staring at empty lists they have no access to.
        if (next === "officer" && !me?.canSwitch) return;
        setModeState(next);
      },
      signIn: async (email, password) => {
        await apiSignIn(email, password);
        setLoading(true);
        await refresh();
      },
      signOut: async () => {
        await apiSignOut();
        setMe(null);
        setModeState("citizen");
        // The next person to sign in on this phone gets their own default.
        defaultApplied.current = false;
      },
      refresh,
    }),
    [me, loading, mode, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}

/** The officer record, or null — narrows the union so screens need no casts. */
export function useOfficer() {
  const { me } = useSession();
  return me?.officer.available ? me.officer : null;
}
