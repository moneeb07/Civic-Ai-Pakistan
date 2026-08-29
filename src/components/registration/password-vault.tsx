"use client";

import * as React from "react";

/*
 * Holds the chosen password between the Security step and account creation.
 *
 * In memory only. Deliberately NOT in the registration session, NOT in
 * localStorage or sessionStorage, and never sent to any endpoint except the
 * final /api/registration/complete call.
 *
 * The provider lives in the /register layout, so it survives client-side
 * navigation between steps. A hard refresh clears it — and that is the correct
 * behaviour: the Review step detects the empty vault and sends the citizen back
 * to re-enter it rather than persisting a password to survive a reload.
 */

interface PasswordVault {
  /** True once a password has been chosen this session. */
  isSet: boolean;
  set: (password: string) => void;
  /** Read once, at submission. */
  read: () => string | null;
  clear: () => void;
}

const PasswordVaultContext = React.createContext<PasswordVault | null>(null);

export function PasswordVaultProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // A ref, not state: the value must never be part of a render tree, a
  // serialised payload, or React DevTools' props inspector.
  const passwordRef = React.useRef<string | null>(null);
  const [isSet, setIsSet] = React.useState(false);

  const value = React.useMemo<PasswordVault>(
    () => ({
      isSet,
      set: (password: string) => {
        passwordRef.current = password;
        setIsSet(true);
      },
      read: () => passwordRef.current,
      clear: () => {
        passwordRef.current = null;
        setIsSet(false);
      },
    }),
    [isSet],
  );

  return (
    <PasswordVaultContext.Provider value={value}>
      {children}
    </PasswordVaultContext.Provider>
  );
}

export function usePasswordVault(): PasswordVault {
  const context = React.useContext(PasswordVaultContext);

  if (!context) {
    throw new Error("usePasswordVault must be used inside PasswordVaultProvider.");
  }

  return context;
}
