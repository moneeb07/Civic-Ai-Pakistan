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
    frameLabel: "Place your CNIC inside the frame",
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
    frameLabelBack: "Place the back of your CNIC inside the frame",
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
    confirmYes: "Yes, that's the problem",
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
    identity:
      "Apna CNIC card camera ke samne rakhein. Card ko seedha aur poora frame ke andar rakhein.",
    identityBack:
      "Ab apna CNIC card ulta karein aur peechay wala hissa camera ke samne rakhein. Is taraf aap ka pata likha hota hai.",
    processing: "CivicAI aap ka CNIC parh raha hai. Thora intezar karein.",
    review:
      "Yeh maloomat aap ke CNIC se li gayi hai. Meharbani kar ke ise dhyan se check karein.",
    contact: "Ab apna mobile number aur email address enter karein.",
    security:
      "Password aap ko khud enter karna hoga. Main aap ko strong password banane ka tareeqa bata sakta hoon, lekin main aap ka password kabhi nahi sunta.",
    address: "Ab apna sheher aur ghar ka pata enter karein.",
    photo: "Ab apni profile tasveer add karein. Camera kholne ke liye Take Photo par press karein.",
    confirm:
      "Main ne aap ki maloomat dikha di hai. Kya aap account banana chahte hain?",
    success: "Aap ka account ban gaya hai. CivicAI mein khush aamdeed.",

    /*
     * Spoken only on a real change of state, and only while voice guidance is
     * switched on — never a running commentary. Nothing here contains a value
     * read off the card: the assistant guides the camera, it does not read a
     * citizen's CNIC number, name or address out loud.
     */
    capture: {
      searching: "Apna CNIC frame ke andar rakhein.",
      too_far: "CNIC ko thora qareeb karein.",
      too_close: "CNIC ko thora door karein.",
      incomplete: "Poora CNIC frame ke andar rakhein.",
      tilted: "CNIC ko seedha rakhein.",
      blurry: "Mobile ko seedha aur sakoon se pakrein.",
      low_light: "Roshni kam hai. Zyada roshan jagah par jayein.",
      glare: "Chamak zyada hai. CNIC ka rukh thora badlein.",
      no_card: "Apna CNIC frame ke andar rakhein.",
      unreadable: "CNIC saaf nahi parha ja raha. Position aur roshni theek karein.",
      ready: "CNIC readable hai. Ab tasveer li ja rahi hai.",
    },
  },
} as const;
