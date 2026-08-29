"use client";

import * as React from "react";

/*
 * Assisted Mode.
 *
 * A voluntary preference, never an inference about a person. CivicAI does not
 * detect, score or record anyone's literacy — it only counts how much trouble a
 * *screen* is giving, and offers help. The label is always about the mode
 * ("voice guidance"), never about the citizen.
 *
 * localStorage is the source of truth: it is a UI convenience rather than
 * identity data, and reading it through useSyncExternalStore keeps server and
 * client markup consistent while syncing the setting across open tabs.
 */

const STORAGE_KEY = "civicai.assisted-mode";
const STRUGGLE_THRESHOLD = 3;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private browsing or blocked storage — voice guidance stays off.
    return false;
  }
}

/** The server cannot know the preference, so it always renders the default. */
function getServerSnapshot(): boolean {
  return false;
}

function writePreference(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // The preference simply will not persist; this session still works.
  }
  for (const listener of listeners) listener();
}

interface AssistedModeContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  /** True once a screen has caused enough trouble to be worth offering help. */
  shouldOffer: boolean;
  dismissOffer: () => void;
  /** Call on a failed validation, a retry, or an explicit request for help. */
  reportStruggle: () => void;
  /** Call when a step is completed, to reset the counter. */
  resetStruggle: () => void;
}

const AssistedModeContext = React.createContext<AssistedModeContextValue | null>(
  null,
);

export function AssistedModeProvider({ children }: { children: React.ReactNode }) {
  const enabled = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [struggles, setStruggles] = React.useState(0);
  const [offerDismissed, setOfferDismissed] = React.useState(false);

  const setEnabled = React.useCallback((value: boolean) => {
    writePreference(value);
    setOfferDismissed(true);

    // Remember it on the account being built, best-effort.
    void fetch("/api/registration/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "preferences", values: { assistedMode: value } }),
    }).catch(() => undefined);
  }, []);

  const value = React.useMemo<AssistedModeContextValue>(
    () => ({
      enabled,
      setEnabled,
      shouldOffer: !enabled && !offerDismissed && struggles >= STRUGGLE_THRESHOLD,
      dismissOffer: () => setOfferDismissed(true),
      reportStruggle: () => setStruggles((count) => count + 1),
      resetStruggle: () => setStruggles(0),
    }),
    [enabled, offerDismissed, struggles, setEnabled],
  );

  return (
    <AssistedModeContext.Provider value={value}>
      {children}
    </AssistedModeContext.Provider>
  );
}

export function useAssistedMode(): AssistedModeContextValue {
  const context = React.useContext(AssistedModeContext);

  if (!context) {
    throw new Error("useAssistedMode must be used inside AssistedModeProvider.");
  }

  return context;
}
