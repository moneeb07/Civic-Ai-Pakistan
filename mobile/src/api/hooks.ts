import * as React from "react";

import { api, ApiError } from "./client";

/*
 * A minimal data-fetching hook.
 *
 * Deliberately not a caching library: every screen here wants the current state
 * of a case that colleagues are editing at the same time, so "fresh on open,
 * refreshable by pull-down" is the correct behaviour, and a stale-while-
 * revalidate cache would show officers a version of a case that has moved on.
 */
export function useQuery<T>(path: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [token, setToken] = React.useState(0);

  React.useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const result = await api<T>(path);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : "Could not load. Check your connection.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, token]);

  return { data, error, loading, refresh: () => setToken((t) => t + 1) };
}
