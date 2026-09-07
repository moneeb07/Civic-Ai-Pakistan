import * as React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { uploadCnic, type UploadFile } from "@/api/client";
import { CnicCapture } from "@/cnic/capture";
import { useRegistration, type CnicAddress } from "@/registration/context";
import { type CnicSide } from "@/registration/retake";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { colors, radius, spacing } from "@/theme";

const cnicFrontImage = require("../../assets/images/cnic-front.webp");
const cnicBackImage = require("../../assets/images/cnic-back.webp");

/*
 * The two specimen images, and the aspect ratio each is locked to.
 *
 * A real CNIC is a landscape ID-1 card (85.6 x 54mm, ~1.586:1), and these
 * are shown that way deliberately — "horizontal CNIC images", not a card
 * squeezed into a portrait crop to fit a narrow phone column. Each ratio is
 * the SPECIMEN FILE'S OWN exact width/height, not the generic 1.586, so
 * `resizeMode="contain"` never has to guess and never introduces a sliver
 * of letterboxing.
 */
const CNIC_SPECIMENS = [
  { side: "front" as const, source: cnicFrontImage, ratio: 880 / 551, label: "Front — name, number, dates" },
  { side: "back" as const, source: cnicBackImage, ratio: 880 / 577, label: "Back — your address" },
];

const CNIC_TIPS = [
  { icon: "sunny-outline", text: "Rest the card on a flat surface, in even light." },
  { icon: "camera-outline", text: "Fill the frame with the card and hold it steady." },
  { icon: "person-outline", text: "The front carries your name, number and dates." },
  { icon: "home-outline", text: "The back carries your present and permanent address." },
] as const;

/*
 * Step one: read the CNIC.
 *
 * The card is photographed, sent to CivicAI's own extraction endpoint, and
 * whatever comes back is shown to the citizen to CHECK before anything is
 * saved. Nothing here decides that a card is genuine — the server's accuracy
 * gate decides only whether the photograph was readable enough to quote, and a
 * read it will not vouch for is discarded rather than half-filled into a form.
 *
 * Typing the details in by hand is a first-class path, not a consolation
 * prize: plenty of citizens have a damaged card, a dark room, or a phone whose
 * camera cannot be trusted, and the flow must not strand any of them.
 */

type Phase = "intro" | "capture-front" | "capture-back" | "extracting";

interface ExtractData {
  fullName?: string | null;
  fatherName?: string | null;
  cnicNumber?: string | null;
  dateOfBirth?: string | null;
  dateOfIssue?: string | null;
  dateOfExpiry?: string | null;
  gender?: string | null;
  nationality?: string | null;
  extractedFields?: string[];
  backScanned?: boolean;
  presentAddress?: CnicAddress | null;
  permanentAddress?: CnicAddress | null;
}

function asUpload(uri: string, side: CnicSide): UploadFile {
  return { uri, name: `cnic-${side}.jpg`, type: "image/jpeg" };
}

export default function IdentityScreen() {
  const router = useRouter();
  const { setDraft, setIdentity, reset } = useRegistration();

  const [phase, setPhase] = React.useState<Phase>("intro");
  const [error, setError] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState(0);

  /*
   * Bumped every time a capture screen is entered — first time, side switch,
   * or a same-side retake alike — and folded into that screen's `key` below.
   *
   * Without this, retaking the SAME side (a normal outcome of a rejected
   * read) re-renders the identical <CnicCapture> element React already has
   * mounted, rather than replacing it. That matters because AutoCamera's
   * "one capture in flight" lock is a ref set on success and never reset on
   * success — by design, matching the reference project, where a successful
   * capture always led to a review screen that unmounted the camera. Here the
   * camera is reused across steps, so without a forced remount the lock stays
   * on and every later frame is silently ignored: this is precisely the "stuck
   * on Capturing…" freeze. A changing key sidesteps the whole class of bug by
   * guaranteeing a fresh component — and fresh refs — on every attempt.
   */
  const [captureAttempt, setCaptureAttempt] = React.useState(0);

  const goToCapture = React.useCallback((side: CnicSide) => {
    setCaptureAttempt((n) => n + 1);
    setPhase(side === "front" ? "capture-front" : "capture-back");
  }, []);

  // The photographs on file. Refs, not state: they are read inside async
  // callbacks that must see the latest value, never the one captured at render.
  const frontRef = React.useRef<string | null>(null);
  const backRef = React.useRef<string | null>(null);
  const retakeTarget = React.useRef<CnicSide | null>(null);

  const goManual = React.useCallback(() => {
    setDraft({ source: "manual", extracted: [], withheld: [] });
    router.push("/register/review");
  }, [router, setDraft]);

  const runExtraction = React.useCallback(
    async (front: string, back: string | null) => {
      setPhase("extracting");
      setError(null);

      let payload;
      try {
        payload = await uploadCnic<ExtractData>("/api/cnic/extract", {
          front: asUpload(front, "front"),
          back: back ? asUpload(back, "back") : null,
        });
      } catch (caught) {
        /*
         * uploadCnic already turns network and timeout failures into an
         * envelope, so reaching here means something genuinely unexpected
         * threw. It must still land somewhere usable: an unhandled rejection
         * here left "Reading your CNIC…" on screen permanently, which is how
         * this bug presented.
         */
        setFailures((count) => count + 1);
        setError(
          caught instanceof Error
            ? `Something went wrong while reading the card: ${caught.message}`
            : "Something went wrong while reading the card.",
        );
        setPhase("intro");
        return;
      }

      if (!payload.success) {
        setFailures((count) => count + 1);
        setError(payload.message ?? "That did not work. Please try again.");

        /*
         * The extraction service is not configured at all. That is our
         * problem, not a fault in the photograph, so the citizen is moved
         * straight to typing rather than being asked to retake a picture that
         * was never going to be read.
         */
        if (payload.reason === "not_configured") {
          goManual();
          return;
        }

        /*
         * Every remaining failure is a failure to READ the card at all — the
         * provider was unreachable, or returned nothing usable. None of them
         * says anything about which photograph to retake, and none of them
         * ever did reliably: the per-side retake that used to run here was
         * driven by an accuracy gate that no longer exists, and on a generic
         * failure it threw away a perfectly good front photo and reopened the
         * camera for a problem that had nothing to do with the front.
         *
         * So the citizen comes back to the intro screen, where the error
         * banner above IS on screen, with both photographs untouched, and
         * chooses for themselves whether to try again or type the details in.
         */
        setPhase("intro");
        return;
      }

      // A scan that came back resets the counter — one rough patch is never
      // held against a citizen whose next attempt reads fine.
      setFailures(0);

      const data = payload.data ?? {};

      setIdentity({
        fullName: data.fullName ?? "",
        fatherName: data.fatherName ?? "",
        cnicNumber: data.cnicNumber ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        dateOfIssue: data.dateOfIssue ?? "",
        dateOfExpiry: data.dateOfExpiry ?? "",
        gender: data.gender === "Male" || data.gender === "Female" ? data.gender : "",
        nationality: data.nationality ?? "",
      });
      setDraft({
        extracted: data.extractedFields ?? [],
        withheld: [],
        backScanned: Boolean(data.backScanned),
        presentAddress: data.presentAddress ?? null,
        permanentAddress: data.permanentAddress ?? null,
        source: (data.extractedFields?.length ?? 0) > 0 ? "cnic_scan" : "manual",
      });

      router.push("/register/review");
    },
    [goManual, router, setDraft, setIdentity],
  );

  function handleFront(uri: string) {
    frontRef.current = uri;

    /*
     * Replacing just the front: straight back to reading, against the back
     * already on file. No reason to photograph it twice — but only when a back
     * actually IS on file, or a front-retake by someone who skipped the back
     * would run a front-only extraction that cannot carry an address, and
     * never offer the back camera again.
     */
    if (retakeTarget.current === "front" && backRef.current) {
      retakeTarget.current = null;
      void runExtraction(uri, backRef.current);
      return;
    }

    retakeTarget.current = null;
    goToCapture("back");
  }

  function handleBack(uri: string) {
    backRef.current = uri;
    retakeTarget.current = null;
    void runExtraction(frontRef.current!, uri);
  }

  function skipBack() {
    // A front-only read is allowed; it simply cannot carry an address, and the
    // address step will ask for it directly instead.
    if (frontRef.current) void runExtraction(frontRef.current, null);
    else goManual();
  }

  /* -- Camera phases: full-bleed, no shell -------------------------------- */

  // The escape hatch a stuck or unwanted camera needs: back to the intro
  // screen, never a dead end with nothing on screen to press.
  const cancelCapture = React.useCallback(() => setPhase("intro"), []);

  if (phase === "capture-front") {
    return (
      <CnicCapture
        key={`front-${captureAttempt}`}
        side="front"
        onCaptured={handleFront}
        onSkip={goManual}
        onCancel={cancelCapture}
      />
    );
  }

  if (phase === "capture-back") {
    return (
      <CnicCapture
        key={`back-${captureAttempt}`}
        side="back"
        onCaptured={handleBack}
        onSkip={skipBack}
        onCancel={cancelCapture}
      />
    );
  }

  /* -- Reading ------------------------------------------------------------ */

  if (phase === "extracting") {
    return (
      <RegistrationShell step="identity" onBack={() => setPhase("intro")}>
        <View style={styles.reading}>
          <ActivityIndicator color={colors.civic600} size="large" />
          <Text style={styles.readingTitle}>Reading your CNIC…</Text>
          <Text style={styles.readingBody}>
            This usually takes ten to twenty seconds. Your photographs are used to read the
            card and are not published anywhere.
          </Text>

          {/*
            An explicit way out. The request now times out on its own, but a
            citizen watching a spinner should never have to trust that — being
            able to leave is the difference between "slow" and "broken".
          */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setPhase("intro")}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </RegistrationShell>
    );
  }

  /* -- Intro -------------------------------------------------------------- */

  /*
   * True when a previous attempt failed for a reason that had nothing to do
   * with either photo — Gemini overloaded, a dropped connection, our own
   * upload timeout — and both photos are consequently still on file (see the
   * failure branch above, which now leaves them untouched in exactly this
   * case). Re-reading refs during render is safe here: they only need to be
   * current at the moment this screen is reached, which is precisely when a
   * re-render just happened.
   *
   * Without this, the only way back in was "Scan my CNIC", which re-walks
   * the front AND back camera for photos that were already fine — asking
   * someone to redo two photographs because a server had a bad ten seconds.
   */
  const canRetryReading = Boolean(frontRef.current && backRef.current);

  return (
    <RegistrationShell
      step="identity"
      onBack={() => {
        reset();
        router.replace("/welcome");
      }}
    >
      <StepHeading
        title="Let's start with your CNIC"
        subtitle="Photograph both sides and we'll fill in your details. You check every one of them before anything is saved."
      />

      {error ? (
        <View style={styles.error}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/*
        What to expect, before any camera opens — a specimen of both sides
        and the four things that actually decide whether a scan reads
        cleanly. This is deliberately ABOVE the "Scan my CNIC" button rather
        than beside a camera view: the citizen sees exactly what is being
        asked for while nothing is being asked of their camera yet, and the
        real capture screen further down is reached the same way it always
        was — by pressing that button.
      */}
      <View style={styles.reference}>
        <Text style={styles.referenceEyebrow}>WHAT WE NEED</Text>

        <View style={styles.specimenRow}>
          {CNIC_SPECIMENS.map((specimen) => (
            <View key={specimen.side} style={styles.specimenBlock}>
              <View style={[styles.specimenFrame, { aspectRatio: specimen.ratio }]}>
                <Image
                  source={specimen.source}
                  style={styles.specimenImage}
                  resizeMode="contain"
                  accessibilityLabel={`Specimen Pakistani CNIC, ${specimen.label}`}
                />
              </View>
              <Text style={styles.specimenLabel}>{specimen.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.specimenCaveat}>
          <Ionicons name="information-circle-outline" size={13} color={colors.civic700} />
          <Text style={styles.specimenCaveatText}>
            A specimen card, shown as a guide. Your own photograph replaces it once you scan.
          </Text>
        </View>

        <View style={styles.tipsList}>
          {CNIC_TIPS.map((tip) => (
            <View key={tip.text} style={styles.tipRow}>
              <View style={styles.tipIcon}>
                <Ionicons name={tip.icon} size={14} color={colors.civic700} />
              </View>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {canRetryReading ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void runExtraction(frontRef.current!, backRef.current)}
          style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}
        >
          <View style={styles.scanIcon}>
            <Ionicons name="refresh" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Try again</Text>
            <Text style={styles.scanBody}>
              We already have both photos — no need to retake them
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.civic200} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => goToCapture("front")}
        style={({ pressed }) => [
          canRetryReading ? styles.manualCard : styles.scanCard,
          pressed && styles.pressed,
        ]}
      >
        <View style={canRetryReading ? styles.manualIcon : styles.scanIcon}>
          <Ionicons
            name="scan-outline"
            size={canRetryReading ? 20 : 22}
            color={canRetryReading ? colors.civic700 : colors.white}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={canRetryReading ? styles.manualTitle : styles.scanTitle}>
            {canRetryReading ? "Retake the photos" : "Scan my CNIC"}
          </Text>
          <Text style={canRetryReading ? styles.manualBody : styles.scanBody}>
            Hold the card in the frame — it captures itself
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={canRetryReading ? colors.muted : colors.civic200}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={goManual}
        style={({ pressed }) => [styles.manualCard, pressed && styles.pressed]}
      >
        <View style={styles.manualIcon}>
          <Ionicons name="create-outline" size={20} color={colors.civic700} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.manualTitle}>Type my details instead</Text>
          <Text style={styles.manualBody}>
            {failures > 0 ? "Scanning is not working? This works just as well." : "No camera, or a damaged card"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <View style={{ marginTop: spacing.xl }}>
        <Note icon="lock-closed-outline">
          Your CNIC number is encrypted before it is stored, and is never shown in full to
          anyone — including the departments handling your reports.
        </Note>
      </View>
    </RegistrationShell>
  );
}

const styles = StyleSheet.create({
  reference: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  referenceEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.civic700,
  },

  // Stacked, not side by side — at a phone's width, two cards side by side
  // would each be too narrow to read as a card at all. Each one is still
  // shown at its own full horizontal shape, just one above the other.
  specimenRow: { marginTop: spacing.md, gap: spacing.md },
  specimenBlock: {},
  specimenFrame: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  specimenImage: { width: "100%", height: "100%" },
  specimenLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
  },

  specimenCaveat: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.md,
  },
  specimenCaveatText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: "rgba(0,90,66,0.75)",
  },

  tipsList: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.civic200,
    gap: spacing.sm,
  },
  tipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tipIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tipText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.ink },

  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.civic600,
  },
  scanIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: { fontSize: 16, fontWeight: "700", color: colors.white },
  scanBody: { marginTop: 2, fontSize: 13, color: "rgba(255,255,255,0.8)" },

  manualCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  manualIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  manualTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  manualBody: { marginTop: 2, fontSize: 13, color: colors.muted },
  pressed: { opacity: 0.8 },

  error: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: "#f3c9c7",
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.danger },

  reading: { alignItems: "center", paddingVertical: spacing.xl * 3 },
  cancel: { marginTop: spacing.xl, padding: spacing.md },
  cancelText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  readingTitle: { marginTop: spacing.xl, fontSize: 18, fontWeight: "700", color: colors.ink },
  readingBody: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
  },
});
