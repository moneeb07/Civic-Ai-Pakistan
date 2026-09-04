import * as React from "react";

import { clearRegistration } from "@/api/client";

/*
 * What the phone holds while a signup is in progress.
 *
 * Almost nothing, on purpose. The registration itself lives in a row on the
 * server, keyed by the `civicai.registration` cookie, and every step is
 * validated and written there. This context only carries the handful of things
 * that genuinely have to survive a screen change on THIS device:
 *
 *   - the identity fields between reading the card and confirming them,
 *   - the address blocks read off the back, so the address step can offer them,
 *   - the chosen password, which never touches the server until the last call.
 */

export interface IdentityFields {
  fullName: string;
  fatherName: string;
  cnicNumber: string;
  dateOfBirth: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  gender: "" | "Male" | "Female";
  nationality: string;
}

export const EMPTY_IDENTITY: IdentityFields = {
  fullName: "",
  fatherName: "",
  cnicNumber: "",
  dateOfBirth: "",
  dateOfIssue: "",
  dateOfExpiry: "",
  gender: "",
  nationality: "",
};

/** One address block as read off the CNIC's back — present or permanent. */
export interface CnicAddress {
  raw?: string | null;
  houseNumber?: string | null;
  streetOrMohalla?: string | null;
  sector?: string | null;
  district?: string | null;
  city?: string | null;
  roman?: Omit<CnicAddress, "roman" | "confidence"> | null;
  confidence?: number;
}

/*
 * What the citizen typed on the contact and address steps, kept ONLY so the
 * final review screen can show it back to them.
 *
 * The authoritative copy of both is the registration row on the server, which
 * is what actually becomes the profile. The web reads its review summary from
 * that row; a phone would need an extra endpoint to do the same, so it shows
 * what it just sent instead — the same values, masked the same way.
 */
export interface ContactSummary {
  phone: string;
  email: string;
}

export interface AddressSummary {
  houseNumber: string;
  city: string;
  district: string;
  sector: string;
  street: string;
  residentialAddress: string;
  permanentAddress: string;
}

interface Draft {
  identity: IdentityFields;
  contact: ContactSummary | null;
  address: AddressSummary | null;
  /** Whether a profile photograph was accepted on the photo step. */
  hasPhoto: boolean;
  /** Which fields Gemini supplied, so the review screen can badge them. */
  extracted: string[];
  /** Fields the accuracy gate read but would not vouch for. */
  withheld: string[];
  backScanned: boolean;
  presentAddress: CnicAddress | null;
  permanentAddress: CnicAddress | null;
  /** "cnic_scan" when the card was read, "manual" when it was typed. */
  source: "cnic_scan" | "manual";
}

const EMPTY_DRAFT: Draft = {
  identity: EMPTY_IDENTITY,
  contact: null,
  address: null,
  hasPhoto: false,
  extracted: [],
  withheld: [],
  backScanned: false,
  presentAddress: null,
  permanentAddress: null,
  source: "manual",
};

interface RegistrationValue {
  draft: Draft;
  setDraft: (update: Partial<Draft>) => void;
  setIdentity: (update: Partial<IdentityFields>) => void;
  /** True once a password has been chosen this run. */
  passwordSet: boolean;
  setPassword: (password: string) => void;
  /** Read once, at account creation. */
  readPassword: () => string | null;
  /** Wipes everything — after the account exists, or on abandoning the flow. */
  reset: () => void;
}

const RegistrationContext = React.createContext<RegistrationValue | null>(null);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = React.useState<Draft>(EMPTY_DRAFT);
  const [passwordSet, setPasswordSet] = React.useState(false);

  /*
   * A ref, not state: the password must never be part of a render tree, a
   * serialised payload, or a React DevTools props inspector. It is sent to
   * exactly one endpoint — /api/registration/complete — and to nowhere else.
   */
  const passwordRef = React.useRef<string | null>(null);

  const value = React.useMemo<RegistrationValue>(
    () => ({
      draft,
      setDraft: (update) => setDraftState((current) => ({ ...current, ...update })),
      setIdentity: (update) =>
        setDraftState((current) => ({
          ...current,
          identity: { ...current.identity, ...update },
        })),
      passwordSet,
      setPassword: (password) => {
        passwordRef.current = password;
        setPasswordSet(true);
      },
      readPassword: () => passwordRef.current,
      reset: () => {
        passwordRef.current = null;
        setPasswordSet(false);
        setDraftState(EMPTY_DRAFT);
        // Drop the server-side session id too, so a later signup starts clean.
        clearRegistration();
      },
    }),
    [draft, passwordSet],
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useRegistration(): RegistrationValue {
  const value = React.useContext(RegistrationContext);
  if (!value) throw new Error("useRegistration must be used inside RegistrationProvider.");
  return value;
}
