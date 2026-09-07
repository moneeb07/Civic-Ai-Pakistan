/*
 * The English dictionary is the source of truth for CivicAI's copy and for the
 * shape every other locale must satisfy (see `Dictionary` in ../index.ts).
 */
export const en = {
  brand: {
    name: "CivicAI",
    country: "Pakistan",
    headline: "Your Voice. Your City. Your Right to Be Heard.",
    supporting: "Making civic services more accessible, one voice at a time.",
  },

  landing: {
    eyebrow: "Civic accountability platform",
    title: "Report civic problems. Track what happens next.",
    subtitle:
      "Create an account to report issues in your neighbourhood and follow them through to resolution.",
    signIn: "Sign In",
    createAccount: "Create Account",
    existing: "Already using CivicAI?",
  },

  signIn: {
    title: "Welcome back",
    subtitle: "Sign in to continue to CivicAI.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    forgotPassword: "Forgot password?",
    submit: "Sign In",
    submitting: "Signing you in…",
    noAccount: "Don't have an account?",
    createAccount: "Create account",
  },

  signUp: {
    title: "Create your CivicAI account",
    subtitle:
      "Join a smarter, more accessible way to report and track civic issues.",
    nameLabel: "Full name",
    namePlaceholder: "Your full name",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Create a password",
    passwordHint: "At least 8 characters.",
    confirmPasswordLabel: "Confirm password",
    confirmPasswordPlaceholder: "Re-enter your password",
    submit: "Create Account",
    submitting: "Creating your account…",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    legal:
      "By creating an account you confirm the information you provide is correct.",
  },

  passwordStrength: {
    label: "Password strength",
    weak: "Weak",
    fair: "Fair",
    strong: "Strong",
  },

  home: {
    welcome: "Welcome to CivicAI",
    ready: "Your CivicAI account is ready.",
    accountLabel: "Signed in as",
    nextUp: "What's next",
    nextUpBody:
      "Reporting, voice assistance and complaint tracking arrive in the next stage of CivicAI.",
    signOut: "Sign out",
    signingOut: "Signing out…",
  },

  errors: {
    signInFailed:
      "We couldn't sign you in. Please check your details and try again.",
    signUpFailed: "We couldn't create your account. Please try again.",
    emailTaken:
      "An account already exists with this email address. Please sign in instead.",
    network:
      "We couldn't reach CivicAI. Please check your connection and try again.",
    tooManyRequests: "Too many attempts. Please wait a moment and try again.",
    sessionExpired: "Your session has expired. Please sign in again.",
    unexpected: "Something went wrong. Please try again.",
  },

  common: {
    showPassword: "Show password",
    hidePassword: "Hide password",
    or: "or",
    required: "required",
    backToHome: "Back to CivicAI",
  },

  forgotPassword: {
    title: "Password reset",
    subtitle: "Password recovery is not available yet.",
    body:
      "CivicAI does not have an email provider connected yet, so we can't send reset links. This will be enabled in a later stage.",
    back: "Back to sign in",
  },

  registration: {
    progressLabel: "Registration progress",
    stepCounter: "Step {current} of {total}",
    stepDone: "completed",
    stepCurrent: "current step",
    stepUpcoming: "not started",
    steps: {
      identity: "Identity",
      contact: "Contact",
      security: "Security",
      address: "Address",
      photo: "Profile",
      review: "Review",
    },
    back: "Back",
    continue: "Continue",
    saving: "Saving…",
    skip: "Skip for now",
    fromCnic: "From CNIC",
    exitConfirm: "Leave registration? Your progress is saved for 2 hours.",
  },

  identity: {
    title: "Let's verify your identity",
    subtitle:
      "Scan your CNIC to automatically fill the information available on your document.",
    scan: "Scan CNIC",
    upload: "Upload CNIC",
    /*
     * Side-specific labels. "Scan CNIC" is ambiguous at the exact moment it
     * matters — the citizen is holding a two-sided card and has to know which
     * face to present. Naming the side in the button removes the guess.
     */
    scanFront: "Scan the front",
    scanBack: "Scan the back",
    uploadFront: "Upload front",
    uploadBack: "Upload back",
    manual: "Enter details manually",
    manualHint: "No camera? You can type your CNIC details instead.",
    /*
     * Shown only after repeated scan failures — never on the first attempt,
     * where it would just be noise. The plain "Enter details manually" link
     * above is always available regardless; this is the same door, made
     * impossible to miss once scanning has genuinely stopped working.
     */
    troubleScanningTitle: "Still having trouble scanning?",
    troubleScanningBody:
      "You can enter your CNIC details by hand instead — you won't need to keep retrying the camera.",
    troubleScanningAction: "Enter details manually",
    dismissAndKeepTrying: "Keep trying to scan",
    /*
     * The drop-zone captions. They said "Place your CNIC inside the frame"
     * — camera language, on a screen that has no camera and no frame. The
     * spoken guidance asks for an upload; these now ask for the same thing,
     * so the voice and the screen are not describing two different actions.
     */
    frameLabel: "Upload the front of your CNIC",
    guidance: {
      heading: "For the best result",
      flat: "Place the CNIC on a flat surface",
      light: "Make sure the lighting is good",
      corners: "Keep all four corners visible",
      glare: "Avoid glare and reflections",
      cover: "Do not cover any text",
    },
    capture: "Capture",
    retake: "Retake",
    usePhoto: "Use this photo",
    cancel: "Cancel",
    cameraStarting: "Starting camera…",
    permissionTitle: "Camera access is required",
    permissionBody:
      "CivicAI needs camera access to scan your CNIC. You can allow it in your browser settings, or upload a photo instead.",
    permissionUpload: "Upload a photo instead",
    processingTitle: "Reading your CNIC",
    processingBody:
      "CivicAI is securely extracting the information from your document.",
    notConfiguredTitle: "Scanning is unavailable",
    notConfiguredBody:
      "CNIC scanning is not set up on this server yet. You can enter your details manually and continue.",

    // Back of the card — carries the Present/Permanent Address.
    backTitle: "Now scan the back",
    backSubtitle:
      "The back of your CNIC has your address. This lets us fill that in for you too.",
    frameLabelBack: "Upload the back of your CNIC",
    skipBack: "Skip — I'll enter my address manually",
    frontCaptured: "Front captured",

    /*
     * Smart auto-capture: the live guidance loop that watches position,
     * distance, lighting, glare, tilt and sharpness, and captures on its own
     * once everything is genuinely good. Only one message is ever shown —
     * whichever single issue matters most right now.
     */
    autoCapture: {
      instruction:
        "Place your CNIC inside the frame. We will capture it automatically when everything looks clear.",
      statusNotReady: "Not Ready — Fix the highlighted issue",
      statusPerfect: "CNIC looks clear. Hold still…",
      detecting: "Looking for your CNIC…",

      // Full-screen scanner chrome.
      scannerTitleFront: "CNIC · Front",
      scannerTitleBack: "CNIC · Back",
      holdStill: "Hold still",

      // The far/close gauge down the side of the viewfinder.
      gaugeFar: "TOO FAR",
      gaugeClose: "TOO CLOSE",
      gaugeLabel: "Distance from your CNIC",
      /*
       * Shown inside the scanner once auto-capture has plainly failed to lock
       * on. Names the most likely cause honestly — a laptop webcam often
       * cannot resolve the small print on a CNIC at all — so a citizen stops
       * blaming their own aim and takes the route that will actually work.
       */
      stalledTitle: "Still can't get a clear view",
      stalledBody:
        "Laptop webcams often can't resolve the small print on a CNIC. You can take the photo with your phone and upload it instead — the result is usually much better.",

      /*
       * Wording for the live score. It is deliberately "Readability" and never
       * "accuracy": this number describes the photo, not whether the details
       * read off it are correct. Claiming the latter would be a claim CivicAI
       * has no way to make until Gemini has actually read the card.
       */
      readability: "Readability",
      readabilityNote: "This measures the photo, not the information on it.",
      tiers: {
        poor: "Poor",
        improving: "Needs improvement",
        acceptable: "Readable",
      },

      voiceOn: "Voice guidance on",
      voiceOff: "Voice guidance off",

      issues: {
        no_card: "Please place your CNIC inside the frame.",
        too_far: "CNIC is too far. Move it closer.",
        too_close: "CNIC is too close. Move it slightly back.",
        incomplete: "Please place the complete CNIC inside the frame.",
        tilted: "Please straighten the CNIC.",
        blurry: "The image is blurry. Hold your phone steady.",
        low_light: "Lighting is too low. Move to a brighter area.",
        glare: "There is too much glare. Tilt the CNIC slightly.",
        // The honest catch-all: everything measurable checks out, but the print
        // still isn't resolvable. Never shown as "capture failed".
        unreadable:
          "I can't clearly read the CNIC. Please adjust the position and lighting.",
      },
    },
  },

  identityManual: {
    title: "Enter your CNIC details",
    subtitle: "Type the information exactly as it appears on your card.",
    fullName: "Full name",
    fatherName: "Father's / husband's name",
    cnicNumber: "CNIC number",
    cnicPlaceholder: "35202-1234567-1",
    dateOfBirth: "Date of birth",
    datePlaceholder: "DD.MM.YYYY",
    dateOfIssue: "Date of issue",
    dateOfExpiry: "Date of expiry",
    gender: "Gender",
    male: "Male",
    female: "Female",
    notSelected: "Prefer not to say",
    nationality: "Nationality",
    optional: "optional",
  },

  extraction: {
    title: "Review your information",
    subtitle: "We found this information on your CNIC. Please check it carefully.",
    notVerified:
      "This confirms we could read your card — it is not a check of authenticity.",
    missingCnic:
      "We couldn't read the CNIC number clearly. Please enter it below.",
    genderMismatch:
      "Please double-check the gender field against your card.",
    edit: "Edit information",
    confirm: "Confirm & Continue",
    retake: "Scan again",
    /*
     * Retaking one side keeps the other. A citizen whose address came out
     * perfectly should never have to re-photograph the front to fix a name.
     */
    retakeFront: "Retake front only",
    retakeBack: "Retake back only",
    /*
     * Shown when the read produced no address — usually because the back was
     * skipped. Without this the only way back to the back camera was to
     * restart the whole scan, which is why a missing address felt permanent.
     */
    scanBackForAddress: "Scan the back to add your address",
    retakeKeepsOther: "The other side is kept — only the side you retake is read again.",
    empty: "Not found on your CNIC",
    presentAddressFound: "We also found a present address on the back of your CNIC.",
    permanentAddressFound: "We also found a permanent address on the back of your CNIC.",
    addressNotFound:
      "We couldn't find an address on the back — you'll enter it in the next steps.",
    /*
     * The address outcomes. Each one names what actually happened and what the
     * citizen can do about it — a blank address with no explanation was the
     * single most confusing thing this screen could show.
     */
    addressUnreadableTitle: "We couldn't read the address",
    addressUnreadableBody:
      "The back of your card was photographed, but the address on it wasn't clear enough to read. This is common with a laptop webcam, or when part of the card falls outside the frame. Retake the back, or type your address in yourself — both work equally well.",
    addressPartialTitle: "We only read part of the address",
    addressPartialBody:
      "Some of the address came through, but not enough to deliver a report to. Please retake the back of the card, or complete the address yourself on the next step.",
    addressMissingTitle: "No address yet",
    addressMissingBody:
      "You haven't scanned the back of your CNIC, which is where the address is printed. Scan it now, or enter your address by hand — neither will hold up your registration.",
    addressEnterManually: "I'll type my address",
    addressManualNoted:
      "No problem — you'll enter your address on the Address step, in a moment.",
    addressLowConfidence:
      "The address on the back was hard to read. Please check it carefully on the next screen.",
    presentAddressTitle: "Present address",
    permanentAddressTitle: "Permanent address",
    addressAsPrinted:
      "Kept in the script printed on your card — not translated.",
    addressRomanLabel: "In Roman Urdu",
    /*
     * Shown when the read passed the accuracy gate as a whole but individual
     * fields were held back. Those boxes are blank on purpose — an empty field
     * the citizen fills in is correct; a confident-looking wrong one is not.
     */
    /*
     * Replaces the old "we left these blank" message. The reader no longer
     * withholds anything — it shows what it read and asks for a look, because
     * a citizen holding the card can settle in two seconds what a confidence
     * score can only guess at.
     */
    checkTheseFields:
      "Please check the highlighted details against your card — the scan wasn't fully sure about them. You can edit anything below.",
    withheldFields:
      "Some fields could not be read with certainty, so they were left blank rather than guessed. Please fill them in.",
    /*
     * "read", not "verified". CivicAI can confirm it managed to read the card;
     * it cannot confirm the card is genuine, and must never imply that it can.
     */
    gatePassed: "CNIC information extracted successfully.",
  },

  contact: {
    title: "How can we reach you?",
    subtitle: "We use these to keep you updated about your reports.",
    phone: "Mobile number",
    phonePlaceholder: "+92 300 1234567",
    phoneHint: "Pakistani mobile number.",
    email: "Email address",
    emailPlaceholder: "you@example.com",
    notOnCnic:
      "We only filled information that was available on your CNIC. Please complete the rest.",
  },

  security: {
    title: "Secure your account",
    subtitle: "Choose a password you'll remember. Only you will ever know it.",
    password: "Password",
    confirmPassword: "Confirm password",
    hint: "At least 8 characters.",
    voiceNotice:
      "Voice guidance never asks for, hears, or repeats your password.",
  },

  address: {
    title: "Where do you live?",
    subtitle: "This helps us send your reports to the right local authority.",
    notice:
      "We filled these in from the back of your CNIC. Please check every field carefully — the layout of a printed address doesn't always split cleanly into boxes.",
    noticeManual:
      "We couldn't read an address from your CNIC, so please enter it yourself.",
    houseNumber: "House / Makan No.",
    houseNumberPlaceholder: "Makan No 123",
    city: "City",
    cityPlaceholder: "Islamabad",
    district: "District / Tehsil",
    districtPlaceholder: "Rawalpindi",
    sector: "Sector / area",
    sectorPlaceholder: "G-11",
    street: "Street / Mohalla",
    road: "Road",
    residentialAddress: "Current address",
    residentialPlaceholder: "House number, block, any landmark",
    /*
     * Kept as a separate field from the current address, in the script it was
     * printed in. An Urdu address is never auto-translated (spec §13).
     */
    permanentAddress: "Permanent address",
    permanentPlaceholder: "As printed on the back of your CNIC",
    sameAsCurrent: "Same as current address",
    optional: "optional",
    usePresent: "Use present address from CNIC",
    usePermanent: "Use permanent address from CNIC",
    useManual: "Enter manually instead",
    fromCnicSource: "Filled from your CNIC — please check it's correct",
    asPrintedOnCnic: "As printed on your CNIC",
  },

  photo: {
    title: "Add your profile photo",
    subtitle: "This is just your profile picture. It is not used to verify you.",
    take: "Take Photo",
    choose: "Choose from Gallery",
    retake: "Retake",
    use: "Use Photo",
    skip: "Skip for now",
    notBiometric:
      "CivicAI does not use face recognition and never compares this with your CNIC photo.",
  },

  confirm: {
    title: "Review your CivicAI profile",
    subtitle: "Please check everything before we create your account.",
    identity: "Identity",
    contact: "Contact",
    address: "Address",
    security: "Security",
    profile: "Profile photo",
    passwordSet: "Password set",
    photoAdded: "Photo added",
    noPhoto: "No photo added",
    edit: "Edit",
    create: "Create My Account",
    creating: "Creating your account…",
    legal:
      "By creating your account, you confirm that the information provided is correct.",
    assistedPrompt: "Aap ki maloomat tayyar hai. Kya aap account banana chahte hain?",
    yesCreate: "Yes, Create Account",
    reviewAgain: "Review Again",
  },

  success: {
    title: "Welcome to CivicAI",
    body: "Your account is ready.",
    action: "Go to CivicAI",
  },

  dashboard: {
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    prompt: "How can we help improve your city today?",
    comingSoonBadge: "Coming soon",
    reportCamera: "Report with Camera",
    reportCameraBody: "Point your camera at the problem",
    reportVoice: "Speak Your Complaint",
    reportVoiceBody: "Describe the issue in your own language",
    reportType: "Type Instead",
    reportTypeBody: "Write your complaint if you prefer",
    commonIssues: "Common issues",
    potholes: "Potholes",
    garbage: "Garbage",
    streetLight: "Street light",
    waterLeakage: "Water leakage",
    notReadyTitle: "Ready to make your city better?",
    notReadyBody:
      "CivicAI will soon help you report civic problems using your voice and camera. Your account is set up and waiting.",
    navHome: "Home",
    navReport: "Report",
    navMyReports: "My Reports",
    navMap: "Map",
    navProfile: "Profile",
  },

  /*
   * Stage 2 — reporting a civic problem. Every AI-derived value shown here is
   * paired with a "possible" / "AI-generated" framing, never presented as a
   * settled fact, and every one of them is editable.
   */
  report: {
    categories: {
      ROAD_DAMAGE: "Road damage",
      POTHOLE: "Pothole",
      GARBAGE: "Garbage",
      BROKEN_STREETLIGHT: "Broken streetlight",
      WATER_LEAKAGE: "Water leakage",
      DRAINAGE_PROBLEM: "Drainage problem",
      OPEN_MANHOLE: "Open manhole",
      DAMAGED_FOOTPATH: "Damaged footpath",
      DAMAGED_PUBLIC_INFRASTRUCTURE: "Damaged public infrastructure",
      OTHER: "Other civic issue",
    },
    severities: {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
    },

    // -- Camera --------------------------------------------------------------
    cameraTitle: "Point your camera at the problem",
    cameraSubtitle: "Take a clear photo of the civic issue you'd like to report.",
    cameraInstruction: "The problem doesn't need to fill the frame — just make sure it's visible.",
    tipDownTitle: "Point camera down at the issue",
    tipDownBody: "Take the photo from a close distance.",
    tipCenteredTitle: "Keep the problem centered",
    tipCenteredBody: "Make sure the issue is in the middle of the photo.",
    tipLightingTitle: "Make sure the area is clearly visible",
    tipLightingBody: "Good lighting helps us see the details.",
    commonIssuesPrompt: "Common issues you can report",
    capture: "Capture",
    retake: "Retake",
    usePhoto: "Use this photo",
    chooseFromGallery: "Choose from Gallery",
    cameraPermissionTitle: "Camera access helps CivicAI understand the problem you're reporting.",
    allowCamera: "Allow Camera",
    notNow: "Not Now",
    cameraUnavailableTitle: "Camera access is required for photo reporting.",
    tryAgain: "Try Again",
    choosePhoto: "Choose Photo",
    qualityCheckTitle: "This photo looks unclear",
    qualityCheckBody: "Please take a clearer photo so CivicAI can better understand the problem.",
    useAnyway: "Use Anyway",

    // -- Vision confirmation ---------------------------------------------------
    analyzingTitle: "Looking at your photo",
    analyzingBody: "CivicAI is checking what kind of problem this might be.",
    possibleIssue: "Possible {category}",
    confirmIssuePrompt: "Does this look like the problem you're reporting?",

    /*
     * The Urdu half of the confirmation step.
     *
     * These sit in the ENGLISH dictionary on purpose, and it is worth being
     * clear why rather than treating it as a mistake to fix later. They are
     * not a translation of the surrounding page — the page stays in English.
     * They are the words a citizen who cannot read English HEARS, spoken
     * aloud, at the one moment the app asks them to confirm something the AI
     * decided. Moving them into a ur.ts that only loads when the whole
     * interface switches to Urdu would silence exactly the person they exist
     * for. When a real Urdu dictionary lands, these move into it and the
     * spoken prompt keeps working in both.
     *
     * {problem} is the model's own Urdu sentence about the photograph.
     */
    confirmSpokenQuestion: "کیا آپ کو بھی یہی لگتا ہے؟",
    // Names confirmYesUr verbatim — see the note on confirmYes.
    confirmSpokenYes: "اگر ہاں، تو جاری رکھیں کا سبز بٹن دبائیں۔",
    confirmSpokenNo: "اگر نہیں، تو مائیک کے بٹن پر کلک کرکے اپنا مسئلہ بتائیں۔",
    confirmListenAgain: "دوبارہ سنیں",
    confirmStopSpeaking: "روکیں",
    confirmSpeakYourProblem: "اپنا مسئلہ بتائیں",
    confirmVoiceAdded: "آپ کی بات محفوظ ہو گئی ہے۔",
    /*
     * The green button, in both scripts, and they must not drift apart.
     *
     * The spoken prompt tells the citizen to press "جاری رکھیں". If the button
     * says anything else in Urdu, the instruction is useless to the person it
     * was recorded for — they are being told to press a button that, as far as
     * they can read, is not on the screen. So the Urdu half of this label and
     * confirmSpokenYes below are one string in two places: change either and
     * change both.
     */
    confirmYes: "Continue",
    confirmYesUr: "جاری رکھیں",
    confirmNo: "No, try again",
    describeInstead: "Describe another problem",
    notDetectedTitle: "We couldn't identify a specific problem",
    notDetectedBody: "You can still describe the problem yourself — the photo will be included with your report.",
    visionUnavailableBody: "Automatic problem detection isn't available right now. You can describe the problem yourself instead.",
    chooseCategoryPrompt: "What kind of problem is this?",

    // -- Voice / text description -----------------------------------------------
    describeTitle: "Tell us what happened",
    describeSubtitle: "Describe the problem in your own words — speak or type, whichever you prefer.",
    useVoice: "Use voice",
    typeInstead: "Type instead",
    listening: "Listening…",
    tapWhenFinished: "Tap when you're finished.",
    processingVoice: "Understanding what you said…",
    micPermissionBody: "CivicAI uses your microphone only when you choose to describe the problem by voice.",
    micUnavailableBody: "Microphone access is unavailable.",
    whatWeHeard: "What we heard",
    transcriptCorrect: "Correct",
    recordAgain: "Record Again",
    unclearRecordingBody: "We couldn't clearly understand that recording. Please try again, or type your description instead.",
    describePlaceholder: "For example: There is a large pothole on the road and it's difficult for vehicles to pass.",

    // -- Location --------------------------------------------------------------
    locationTitle: "Add your location",
    locationSubtitle: "Your location helps CivicAI identify the relevant area.",
    useMyLocation: "Use My Location",
    enterLocationManually: "Enter Location Manually",
    locationLabel: "Report location",
    yourCurrentLocation: "Your current location",
    confirmLocation: "Confirm Location",
    changeLocation: "Change Location",
    locationDeniedBody: "We couldn't determine your location. You can enter it yourself instead.",
    locationPlaceholder: "e.g. G-10, Islamabad",

    // -- Generation / review -----------------------------------------------------
    generatingTitle: "Preparing your report",
    generatingBody: "CivicAI is turning what you provided into a clear report.",
    generationFailedTitle: "We couldn't generate the complaint automatically.",
    editManually: "Edit Manually",
    reviewTitle: "Review your report",
    reviewSubtitle: "Please check everything below before confirming.",
    evidenceSection: "Evidence",
    issueSection: "Issue",
    titleField: "Title",
    descriptionField: "Description",
    severityField: "Severity",
    severityHint: "AI-estimated — you can change this before confirming.",
    aiGenerated: "AI-generated",
    aiGeneratedHint: "Written automatically from your photo and description — check it carefully and edit anything that isn't right.",
    edit: "Edit",
    save: "Save",
    confirmReport: "Confirm Report",
    reportReadyTitle: "Your report is ready.",
    reportReadyBody: "This report has not been sent anywhere yet — submitting it to your local authority is coming in a future update.",
    incompleteReportBody: "Please complete every section before confirming.",

    // -- Errors -----------------------------------------------------------------
    networkError: "You're offline. Please check your connection.",
    unexpectedError: "Something went wrong. Please try again.",
  },

  profile: {
    title: "Profile",
    identitySection: "Identity information",
    extractedFromCnic: "Extracted from CNIC",
    enteredManually: "Entered manually",
    contactSection: "Contact",
    addressSection: "Address",
    accountSection: "Account",
    settingsSection: "Settings",
    fullName: "Full name",
    fatherName: "Father's / husband's name",
    cnic: "CNIC",
    dateOfBirth: "Date of birth",
    gender: "Gender",
    phone: "Mobile number",
    email: "Email address",
    houseNumber: "House / Makan No.",
    city: "City",
    district: "District",
    address: "Address",
    permanentAddress: "Permanent address (as printed on CNIC)",
    memberSince: "Member since",
    accountStatus: "Account status",
    active: "Active",
    assistedMode: "Voice guidance",
    assistedModeOn: "On",
    assistedModeOff: "Off",
    signOut: "Sign Out",
    notProvided: "Not provided",
  },

  assisted: {
    offerTitle: "Would you like voice assistance?",
    offerBody:
      "CivicAI can read each step aloud and tell you what to do next, in Urdu.",
    accept: "Yes, guide me",
    decline: "Continue normally",
    enable: "Need help?",
    enabled: "Voice guidance on",
    disable: "Turn off voice guidance",
    repeat: "Repeat",
    unsupported:
      "Voice guidance isn't available in this browser, but every step still has written instructions.",
  },

  /*
   * Spoken guidance, in Roman Urdu so it reads naturally through an Urdu voice.
   * Nothing here ever mentions, requests or repeats a password.
   */
  voice: {
    /*
     * WRITTEN IN URDU SCRIPT, NOT ROMAN URDU.
     *
     * These were Roman Urdu — "Apna CNIC card camera ke samne rakhein" — and
     * that is a transliteration, not a language any speech engine knows.
     * Handed those letters, both the browser's synthesiser and the server's
     * voice read what is literally there: English. The result was a mangled
     * half-English approximation that an Urdu speaker had to decode rather
     * than simply hear.
     *
     * In Urdu script the same sentence is unambiguous to a synthesiser, and
     * it is also what an Urdu-speaking citizen would read if any of these
     * ever surface as text. Formal register throughout — "کریں", never the
     * familiar "کرو" — because this is a government service addressing a
     * citizen it has never met.
     *
     * The capture block that used to sit here is gone with the frame
     * detector that drove it: glare, tilt and distance corrections describe
     * checks that no longer run.
     */
    identity:
      "براہِ کرم اپنے شناختی کارڈ کا سامنے والا رخ اپ لوڈ کریں۔ یہی وہ رخ ہے جس پر آپ کی تصویر اور شناختی نمبر درج ہوتا ہے۔",
    identityBack:
      "اب براہِ کرم اپنے شناختی کارڈ کا پچھلا رخ اپ لوڈ کریں۔ اسی رخ پر آپ کا پتہ درج ہوتا ہے۔",
    processing: "سِوک اے آئی آپ کا شناختی کارڈ پڑھ رہا ہے۔ براہِ کرم تھوڑا انتظار کریں۔",
    review:
      "یہ معلومات آپ کے شناختی کارڈ سے لی گئی ہیں۔ براہِ کرم انہیں غور سے دیکھ لیں، اور اگر کوئی بات درست نہ ہو تو خود درست کر لیں۔",
    contact: "اب براہِ کرم اپنا موبائل نمبر اور ای میل ایڈریس درج کریں۔",
    security:
      "پاس ورڈ آپ کو خود درج کرنا ہوگا۔ میں آپ کو مضبوط پاس ورڈ بنانے کا طریقہ بتا سکتا ہوں، لیکن آپ کا پاس ورڈ کبھی نہیں سنتا۔",
    address: "اب براہِ کرم اپنا شہر اور گھر کا پتہ درج کریں۔",
    photo:
      "اب براہِ کرم اپنی پروفائل تصویر شامل کریں۔ کیمرہ کھولنے کے لیے تصویر لیں کا بٹن دبائیں۔",
    confirm: "میں نے آپ کی تمام معلومات دکھا دی ہیں۔ کیا آپ اکاؤنٹ بنانا چاہتے ہیں؟",
    success: "آپ کا اکاؤنٹ بن گیا ہے۔ سِوک اے آئی میں خوش آمدید۔",
  },

  /*
   * Government portal.
   *
   * One new top-level key; nothing above is touched. Every string the officer
   * pages render comes from here, the same rule the citizen side follows, so
   * adding Urdu later is a translation job rather than a hunt through JSX.
   */
  gov: {
    portalName: "CivicAI Government Portal",

    roles: {
      platform_admin: "Platform administrator",
      org_head: "Organization head",
      dept_head: "Department head",
      member: "Field member",
    },

    login: {
      title: "Government sign in",
      subtitle: "For authorised government officers only.",
      emailLabel: "Official email address",
      emailPlaceholder: "you@department.gov.pk",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter your password",
      submit: "Sign In",
      submitting: "Signing you in…",
      forgotPassword: "Forgot password?",
      forgotPasswordHint: "Contact your administrator",
      noAccess: "This account has no government access.",
      invalid: "That email or password is not correct.",
      noSignUp: "Government accounts are created by invitation only.",
    },

    /*
     * The onboarding screen exists because the landing page offers "Authority
     * Registration / Onboarding", and there is no such thing as authority
     * self-registration. Rather than quietly send that button to the sign-in
     * form, this page says how an account is actually obtained and gives the
     * one self-service path that genuinely exists: redeeming an invitation.
     */
    onboarding: {
      eyebrow: "Authority onboarding",
      title: "Getting your department onto CivicAI",
      subtitle:
        "Government accounts are issued by invitation — they cannot be created here or by signing up.",
      haveInviteTitle: "You have an invitation",
      haveInviteBody:
        "Paste the invitation link from your email, or just the code at the end of it.",
      tokenLabel: "Invitation link or code",
      tokenPlaceholder: "https://…/gov/invite/… or the code itself",
      tokenSubmit: "Continue",
      tokenInvalid:
        "That doesn't look like an invitation link. Copy the whole link from your invitation email and paste it here.",
      noInviteTitle: "You don't have one yet",
      noInviteBody:
        "Ask the administrator at your own organization to invite you. They can do it from Members in the CivicAI workspace, and the invitation arrives at your official email address.",
      newOrgTitle: "Your organization isn't on CivicAI at all",
      newOrgBody:
        "A new authority is added by a CivicAI platform administrator, who creates the organization and appoints its first head. Contact them through your usual departmental channel — there is no public sign-up for this.",
      alreadyHaveAccount: "Already have an account?",
      signIn: "Government sign in",
    },

    invite: {
      acceptTitle: "Accept your invitation",
      acceptSubtitle: "Set a password to activate your government account.",
      grantsEyebrow: "This invitation grants",
      emailLabel: "Email address",
      roleLabel: "Role",
      orgLabel: "Organization",
      deptLabel: "Department",
      expiresLabel: "Expires",
      nameLabel: "Full name",
      namePlaceholder: "Your full name",
      passwordLabel: "Create a password",
      passwordPlaceholder: "At least 8 characters",
      confirmPasswordLabel: "Confirm password",
      confirmPasswordPlaceholder: "Re-enter your password",
      submit: "Activate Account",
      submitting: "Setting up your account…",
      invalidTitle: "This invitation link isn't valid",
      invalidBody:
        "The link may have been mistyped. Ask whoever invited you to send a new one.",
      expiredTitle: "This invitation has expired",
      expiredBody:
        "Invitations are valid for seven days. Ask whoever invited you to send a new one.",
      usedTitle: "This invitation has already been used",
      usedBody: "An account already exists for this invitation. Try signing in instead.",
      backToLogin: "Go to sign in",

      manageTitle: "Invitations",
      manageSubtitle: "Invite people into your part of the portal.",
      inviteEmailLabel: "Email address",
      inviteEmailPlaceholder: "officer@department.gov.pk",
      inviteRoleLabel: "Role",
      inviteOrgLabel: "Organization",
      inviteDeptLabel: "Department",
      send: "Send Invitation",
      sending: "Sending…",
      sent: "Invitation sent.",
      sentTerminal: "Invitation created. The link was printed to the server console.",
      revoke: "Revoke",
      revoked: "Invitation revoked.",
      pendingEyebrow: "Pending invitations",
      noPendingTitle: "No pending invitations",
      noPendingBody: "People you invite will appear here until they accept.",
      expiresOn: "Expires",
      rateLimited: "You've sent the maximum number of invitations this hour. Try again later.",
      alreadyInvited: "There is already a pending invitation for this address.",
      notPermitted: "You cannot invite someone to that role.",
    },

    admin: {
      title: "Platform administration",
      subtitle: "Organizations on CivicAI, and who leads them.",
      orgsEyebrow: "Organizations",
      createOrgTitle: "Add an organization",
      orgNameLabel: "Organization name",
      orgNamePlaceholder: "Capital Development Authority",
      orgCodeLabel: "Short code",
      orgCodePlaceholder: "CDA",
      orgCodeHint: "Capital letters and digits, e.g. CDA. Shown instead of an id.",
      createOrg: "Create Organization",
      creating: "Creating…",
      orgCreated: "Organization created.",
      duplicateCode: "That short code is already in use.",
      departmentCount: "departments",
      noOrgsTitle: "No organizations yet",
      noOrgsBody:
        "Create the first government body, then invite its head to take it over.",
    },

    org: {
      title: "Organization",
      subtitle: "Your departments, and complaints waiting to be routed.",
      deptsEyebrow: "Departments",
      createDeptTitle: "Add a department",
      deptNameLabel: "Department name",
      deptNamePlaceholder: "Roads & Infrastructure",
      deptCategoriesLabel: "Handles these complaint types",
      createDept: "Create Department",
      deptCreated: "Department created.",
      duplicateDept: "A department with that name already exists here.",
      noDeptsTitle: "No departments yet",
      noDeptsBody:
        "Add the units that actually resolve complaints, then invite a head for each.",
      workflowReady: "Workflow defined",
      workflowMissing: "No workflow yet",

      inboxEyebrow: "Waiting to be routed",
      noInboxTitle: "Nothing waiting",
      noInboxBody:
        "Complaints citizens have confirmed will appear here for you to send to a department.",
      routeTo: "Route to department",
      route: "Route",
      routing: "Routing…",
      routed: "Complaint routed.",
      aiSuggestionUnavailable: "Automatic routing isn't available yet — choose a department.",
    },

    dept: {
      title: "Department",
      subtitle: "Complaints routed to your department.",
      queueEyebrow: "Queue",
      teamEyebrow: "Team",
      noQueueTitle: "No complaints assigned yet",
      noQueueBody:
        "New complaints from citizens will appear here after they're routed by your organization head.",
      noTeamTitle: "No team members yet",
      noTeamBody: "Invite members so complaints can be assigned to someone.",
      assignTo: "Assign to",
      assign: "Assign",
      assigning: "Assigning…",
      assigned: "Complaint assigned.",
      unassigned: "Not assigned",
      needsWorkflow: "Define a workflow before assigning complaints.",
      openWorkflow: "Define workflow",
      needsAttention: "Needs attention",
      lowRating: "Rated poorly by the citizen",
      reopen: "Reopen",
      reopening: "Reopening…",
      reopened: "Complaint reopened.",
      reopenConfirmTitle: "Reopen this complaint?",
      reopenConfirmBody:
        "It goes back to the first stage of the workflow. The citizen is not notified again.",
      confirm: "Reopen complaint",
      cancel: "Cancel",
    },

    workflow: {
      title: "Resolution workflow",
      subtitle:
        "The stages every complaint in your department moves through, in order.",
      templateBadge: "Template — please review",
      templateNote:
        "These are suggested stages. Change them to match how your department actually works, then save.",
      stageName: "Stage name",
      stageNamePlaceholder: "e.g. Site inspection",
      stageDescription: "Description (optional)",
      stageDescriptionPlaceholder: "What happens at this stage",
      requiresPhoto: "Requires photo",
      requiresNote: "Requires note",
      slaLabel: "Target time",
      slaSuffix: "hours",
      slaPlaceholder: "—",
      terminalLabel: "This is the resolved stage",
      addStage: "+ Add stage",
      deleteStage: "Delete stage",
      moveUp: "Move up",
      moveDown: "Move down",
      save: "Save changes",
      saving: "Saving…",
      saved: "Workflow saved.",
      unsaved: "Unsaved changes",
      noChanges: "No changes",
      cannotDeleteLastTerminal: "Every workflow needs one resolved stage.",
      cannotDeleteLastActive: "Keep at least one stage before the resolved stage.",
      stageCount: "stages",
    },

    complaint: {
      title: "Complaint",
      detailsEyebrow: "What the citizen reported",
      timelineEyebrow: "Progress",
      historyEyebrow: "Activity",
      noTitle: "Untitled complaint",
      noDescription: "No description was provided.",
      categoryLabel: "Type",
      severityLabel: "Severity",
      locationLabel: "Location",
      submittedLabel: "Submitted",
      assignedLabel: "Assigned to",
      stageLabel: "Current stage",
      resolvedBadge: "Resolved",
      overdue: "Overdue",
      dueIn: "Target",
      advanceTitle: "Move to the next stage",
      photoUrlLabel: "Photo link",
      photoUrlPlaceholder: "https://…",
      photoRequired: "This stage requires a photo before it can be completed.",
      noteLabel: "Note",
      notePlaceholder: "What was done at this stage",
      noteRequired: "This stage requires a note before it can be completed.",
      advance: "Complete Stage",
      advancing: "Saving…",
      advanced: "Stage completed.",
      resolvedNotice: "This complaint is resolved. The citizen has been notified.",
      requirementsUnmet: "Add what this stage requires before completing it.",
      ratingEyebrow: "Citizen rating",
      ratingStars: "out of 5",
      noRating: "The citizen hasn't rated this yet.",
      notStarted: "This complaint hasn't been assigned to anyone yet.",
    },

    common: {
      signOut: "Sign Out",
      back: "Back",
      loading: "Loading…",
      tryAgain: "Try again",
      errorTitle: "Something went wrong",
      errorBody: "We couldn't complete that. Try again, and quote the code below if it keeps happening.",
      unexpectedError: "Something went wrong. Please try again.",
      notFound: "Not found.",
      forbidden: "You don't have access to that.",
      signInRequired: "Please sign in.",
      comingSoon: "Coming soon",
      required: "This field is required.",
      optional: "Optional",
      none: "None",
      selectPlaceholder: "Choose…",
    },
  },
} as const;
