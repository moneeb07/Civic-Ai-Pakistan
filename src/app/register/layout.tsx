import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AssistedModeProvider } from "@/components/assisted/assisted-mode-provider";
import { PasswordVaultProvider } from "@/components/registration/password-vault";

export const metadata: Metadata = { title: "Create your account" };

/*
 * Both providers live here rather than on the individual steps, so their state
 * survives client-side navigation from one step to the next. The password vault
 * is memory-only by design — see password-vault.tsx.
 */
export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <AssistedModeProvider>
      <PasswordVaultProvider>{children}</PasswordVaultProvider>
    </AssistedModeProvider>
  );
}
