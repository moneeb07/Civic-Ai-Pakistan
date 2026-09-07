import type { Dictionary } from "../index";
import { en } from "./en";

/*
 * Urdu — اردو.
 *
 * HOW THIS FILE IS BUILT, AND WHY IT IS BUILT THAT WAY.
 *
 * Every level starts by spreading the English section and then overriding the
 * keys that have a translation. That is not shorthand for laziness — it is the
 * property that keeps this maintainable. A key added to en.ts tomorrow appears
 * here immediately, in English, and the app keeps working; the alternative is a
 * type error on a file nobody remembers to open, or worse, a blank string on a
 * screen. Untranslated copy is a visible gap someone can fix. A missing key is
 * a bug.
 *
 * WHAT IS DELIBERATELY LEFT IN ENGLISH.
 *
 *   brand    — "CivicAI", "Pakistan", the headline and the supporting line.
 *              These are identity, not instruction. A brand that renames
 *              itself depending on who is looking is not a brand, and the
 *              landing page's promise is the one sentence the project is
 *              known by. Not translated in any locale, ever.
 *
 *   landing  — the eyebrow, title and subtitle stay English for the same
 *              reason: they are the mission statement on the front door. Only
 *              the BUTTONS on that page are translated, because a button is an
 *              instruction and instructions are what this file exists for.
 *
 *   gov      — the government portal is out of scope. Officers are addressed
 *              in English throughout, and mixing half a translated portal into
 *              a citizen's language choice would be worse than not offering it.
 *
 *   voice    — already Urdu, in both dictionaries. It is what a citizen HEARS
 *              rather than reads, and it must not go silent for someone
 *              browsing in English who turned voice guidance on.
 *
 * A note on register: formal throughout — "کریں", never "کرو". This is a
 * government service addressing a citizen it has never met, and the familiar
 * form would read as either patronising or over-friendly depending on who is
 * reading it. Neither is what a public institution should sound like.
 */
export const ur = {
  ...en,

  // Buttons only. The headline and subtitle above them stay English.
  landing: {
    ...en.landing,
    signIn: "سائن اِن کریں",
    createAccount: "اکاؤنٹ بنائیں",
    existing: "پہلے سے CivicAI استعمال کر رہے ہیں؟",
  },

  signIn: {
    ...en.signIn,
    title: "خوش آمدید",
    subtitle: "جاری رکھنے کے لیے سائن اِن کریں۔",
    emailLabel: "ای میل ایڈریس",
    passwordLabel: "پاس ورڈ",
    passwordPlaceholder: "اپنا پاس ورڈ درج کریں",
    forgotPassword: "پاس ورڈ بھول گئے؟",
    submit: "سائن اِن کریں",
    submitting: "سائن اِن کیا جا رہا ہے…",
    noAccount: "اکاؤنٹ نہیں ہے؟",
    createAccount: "اکاؤنٹ بنائیں",
  },

  signUp: {
    ...en.signUp,
    title: "اپنا CivicAI اکاؤنٹ بنائیں",
    subtitle:
      "شہری مسائل کی اطلاع دینے اور ان کی پیش رفت دیکھنے کا بہتر اور آسان طریقہ۔",
    nameLabel: "پورا نام",
    namePlaceholder: "آپ کا پورا نام",
    emailLabel: "ای میل ایڈریس",
    passwordLabel: "پاس ورڈ",
    passwordPlaceholder: "پاس ورڈ بنائیں",
    passwordHint: "کم از کم آٹھ حروف۔",
    confirmPasswordLabel: "پاس ورڈ کی تصدیق کریں",
    confirmPasswordPlaceholder: "پاس ورڈ دوبارہ درج کریں",
    submit: "اکاؤنٹ بنائیں",
    submitting: "آپ کا اکاؤنٹ بنایا جا رہا ہے…",
    haveAccount: "پہلے سے اکاؤنٹ موجود ہے؟",
    signIn: "سائن اِن کریں",
    legal: "اکاؤنٹ بنا کر آپ تصدیق کرتے ہیں کہ دی گئی معلومات درست ہیں۔",
  },

  passwordStrength: {
    ...en.passwordStrength,
    label: "پاس ورڈ کی مضبوطی",
    weak: "کمزور",
    fair: "درمیانہ",
    strong: "مضبوط",
  },

  home: {
    ...en.home,
    accountLabel: "بطور سائن اِن",
    nextUp: "آگے کیا ہے",
    signOut: "سائن آؤٹ",
    signingOut: "سائن آؤٹ کیا جا رہا ہے…",
  },

  errors: {
    ...en.errors,
    signInFailed: "ہم آپ کو سائن اِن نہیں کر سکے۔ اپنی تفصیلات دیکھ کر دوبارہ کوشش کریں۔",
    signUpFailed: "اکاؤنٹ نہیں بن سکا۔ براہِ کرم دوبارہ کوشش کریں۔",
    emailTaken:
      "اس ای میل کے ساتھ پہلے سے اکاؤنٹ موجود ہے۔ براہِ کرم سائن اِن کریں۔",
    network: "ہم CivicAI تک نہیں پہنچ سکے۔ اپنا انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔",
    tooManyRequests: "بہت زیادہ کوششیں۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    sessionExpired: "آپ کا سیشن ختم ہو گیا ہے۔ براہِ کرم دوبارہ سائن اِن کریں۔",
    unexpected: "کچھ غلط ہو گیا۔ براہِ کرم دوبارہ کوشش کریں۔",
  },

  common: {
    ...en.common,
    showPassword: "پاس ورڈ دکھائیں",
    hidePassword: "پاس ورڈ چھپائیں",
    or: "یا",
    required: "لازمی",
  },

  forgotPassword: {
    ...en.forgotPassword,
    title: "پاس ورڈ ری سیٹ",
    subtitle: "پاس ورڈ کی بحالی ابھی دستیاب نہیں۔",
    body:
      "CivicAI کے ساتھ ابھی کوئی ای میل سروس منسلک نہیں، اس لیے ری سیٹ لنک نہیں بھیجا جا سکتا۔ یہ سہولت بعد میں شامل کی جائے گی۔",
    back: "واپس سائن اِن پر",
  },

  registration: {
    ...en.registration,
    progressLabel: "رجسٹریشن کی پیش رفت",
    stepCounter: "مرحلہ {current} از {total}",
    stepDone: "مکمل",
    stepCurrent: "موجودہ مرحلہ",
    stepUpcoming: "ابھی شروع نہیں ہوا",
    steps: {
      identity: "شناخت",
      contact: "رابطہ",
      security: "سیکیورٹی",
      address: "پتہ",
      photo: "پروفائل",
      review: "نظرِ ثانی",
    },
    back: "واپس",
    continue: "جاری رکھیں",
    saving: "محفوظ کیا جا رہا ہے…",
    skip: "ابھی چھوڑ دیں",
    fromCnic: "شناختی کارڈ سے",
    exitConfirm: "رجسٹریشن چھوڑ دیں؟ آپ کی پیش رفت دو گھنٹے محفوظ رہے گی۔",
  },

  identity: {
    ...en.identity,
    title: "آئیے آپ کی شناخت کی تصدیق کریں",
    subtitle:
      "اپنا شناختی کارڈ اسکین کریں تاکہ کارڈ پر موجود معلومات خود بخود بھر جائیں۔",
    manual: "تفصیلات خود درج کریں",
    manualHint: "کیمرہ نہیں ہے؟ آپ اپنی تفصیلات خود لکھ سکتے ہیں۔",
    troubleScanningTitle: "اسکین کرنے میں اب بھی دشواری ہو رہی ہے؟",
    troubleScanningBody:
      "آپ اپنی تفصیلات خود درج کر سکتے ہیں — بار بار کیمرہ آزمانے کی ضرورت نہیں۔",
    troubleScanningAction: "تفصیلات خود درج کریں",
    dismissAndKeepTrying: "اسکین کرنا جاری رکھیں",
    guidance: {
      heading: "بہترین نتیجے کے لیے",
      flat: "کارڈ کو ہموار سطح پر رکھیں",
      light: "روشنی مناسب رکھیں",
      corners: "کارڈ کے چاروں کونے نظر آنے چاہئیں",
      glare: "چمک اور عکس سے بچیں",
      cover: "کسی تحریر کو انگلی سے نہ ڈھانپیں",
    },
    retake: "دوبارہ لیں",
    usePhoto: "یہی تصویر استعمال کریں",
    cancel: "منسوخ کریں",
    processingTitle: "آپ کا شناختی کارڈ پڑھا جا رہا ہے",
    processingBody: "CivicAI آپ کے کارڈ سے معلومات محفوظ طریقے سے حاصل کر رہا ہے۔",
    notConfiguredTitle: "اسکیننگ دستیاب نہیں",
    notConfiguredBody:
      "اس سرور پر شناختی کارڈ اسکیننگ ابھی مہیا نہیں۔ آپ اپنی تفصیلات خود درج کر کے آگے بڑھ سکتے ہیں۔",
    backTitle: "اب پچھلا رخ اسکین کریں",
    backSubtitle:
      "شناختی کارڈ کے پچھلے رخ پر آپ کا پتہ درج ہوتا ہے، جس سے ہم آپ کا پتہ خود بھر دیں گے۔",
    skipBack: "چھوڑ دیں — میں اپنا پتہ خود لکھوں گا",
    frontCaptured: "سامنے والا رخ محفوظ ہو گیا",
  },

  identityManual: {
    ...en.identityManual,
    title: "اپنے شناختی کارڈ کی تفصیلات درج کریں",
    subtitle: "معلومات بالکل ویسے لکھیں جیسے آپ کے کارڈ پر درج ہیں۔",
    fullName: "پورا نام",
    fatherName: "والد / شوہر کا نام",
    cnicNumber: "شناختی کارڈ نمبر",
    dateOfBirth: "تاریخِ پیدائش",
    dateOfIssue: "تاریخِ اجرا",
    dateOfExpiry: "تاریخِ اختتام",
    gender: "جنس",
    male: "مرد",
    female: "عورت",
    notSelected: "بتانا نہیں چاہتا",
    nationality: "قومیت",
    optional: "اختیاری",
  },

  extraction: {
    ...en.extraction,
    title: "اپنی معلومات کی جانچ کریں",
    subtitle:
      "یہ معلومات ہمیں آپ کے شناختی کارڈ پر ملی ہیں۔ براہِ کرم انہیں غور سے دیکھ لیں۔",
    notVerified:
      "اس کا مطلب صرف یہ ہے کہ ہم آپ کا کارڈ پڑھ سکے — یہ اصلیت کی تصدیق نہیں ہے۔",
    missingCnic: "ہم شناختی کارڈ نمبر واضح نہیں پڑھ سکے۔ براہِ کرم نیچے درج کریں۔",
    genderMismatch: "براہِ کرم جنس کا خانہ اپنے کارڈ سے دوبارہ ملا لیں۔",
    edit: "معلومات میں ترمیم کریں",
    confirm: "تصدیق کر کے جاری رکھیں",
    retake: "دوبارہ اسکین کریں",
  },

  contact: {
    ...en.contact,
    title: "ہم آپ سے کیسے رابطہ کریں؟",
    subtitle: "ہم انہی کے ذریعے آپ کو آپ کی شکایات کی اطلاع دیتے رہیں گے۔",
    phone: "موبائل نمبر",
    phoneHint: "پاکستانی موبائل نمبر۔",
    email: "ای میل ایڈریس",
    notOnCnic:
      "ہم نے صرف وہی معلومات بھری ہیں جو آپ کے کارڈ پر موجود تھیں۔ باقی خود مکمل کریں۔",
  },

  security: {
    ...en.security,
    title: "اپنا اکاؤنٹ محفوظ بنائیں",
    subtitle: "ایسا پاس ورڈ چنیں جو آپ کو یاد رہے۔ اسے صرف آپ ہی جانیں گے۔",
    password: "پاس ورڈ",
    confirmPassword: "پاس ورڈ کی تصدیق کریں",
    hint: "کم از کم آٹھ حروف۔",
    voiceNotice: "صوتی رہنمائی آپ کا پاس ورڈ نہ پوچھتی ہے، نہ سنتی ہے، نہ دہراتی ہے۔",
  },

  address: {
    ...en.address,
    title: "آپ کہاں رہتے ہیں؟",
    subtitle: "اس سے ہمیں آپ کی شکایت درست مقامی ادارے تک بھیجنے میں مدد ملتی ہے۔",
    notice:
      "یہ معلومات ہم نے آپ کے شناختی کارڈ کے پچھلے رخ سے بھری ہیں۔ ہر خانہ غور سے دیکھ لیں — چھپا ہوا پتہ ہمیشہ ٹھیک ٹھیک خانوں میں تقسیم نہیں ہوتا۔",
    noticeManual: "ہم آپ کے کارڈ سے پتہ نہیں پڑھ سکے، اس لیے براہِ کرم خود درج کریں۔",
    houseNumber: "مکان نمبر",
    city: "شہر",
    district: "ضلع / تحصیل",
    sector: "سیکٹر / علاقہ",
    street: "گلی / محلہ",
    road: "سڑک",
    residentialAddress: "موجودہ پتہ",
    residentialPlaceholder: "مکان نمبر، بلاک، کوئی نشانی",
    permanentAddress: "مستقل پتہ",
    permanentPlaceholder: "جیسا شناختی کارڈ کے پچھلے رخ پر درج ہے",
    sameAsCurrent: "موجودہ پتے جیسا ہی",
    optional: "اختیاری",
    usePresent: "کارڈ والا موجودہ پتہ استعمال کریں",
    usePermanent: "کارڈ والا مستقل پتہ استعمال کریں",
    useManual: "اس کے بجائے خود درج کریں",
    fromCnicSource: "آپ کے شناختی کارڈ سے بھرا گیا — درست ہونے کی تصدیق کر لیں",
    asPrintedOnCnic: "جیسا آپ کے شناختی کارڈ پر چھپا ہے",
  },

  photo: {
    ...en.photo,
    title: "اپنی پروفائل تصویر شامل کریں",
    subtitle: "یہ صرف آپ کی پروفائل تصویر ہے۔ اس سے آپ کی تصدیق نہیں کی جاتی۔",
    take: "تصویر لیں",
    choose: "گیلری سے منتخب کریں",
    retake: "دوبارہ لیں",
    use: "یہی تصویر رکھیں",
    skip: "ابھی چھوڑ دیں",
    notBiometric:
      "CivicAI چہرے کی شناخت استعمال نہیں کرتا اور اس تصویر کا آپ کے کارڈ کی تصویر سے موازنہ کبھی نہیں کرتا۔",
  },

  confirm: {
    ...en.confirm,
    title: "اپنی CivicAI پروفائل دیکھ لیں",
    subtitle: "اکاؤنٹ بنانے سے پہلے براہِ کرم ہر چیز کی جانچ کر لیں۔",
    identity: "شناخت",
    contact: "رابطہ",
    address: "پتہ",
    security: "سیکیورٹی",
    profile: "پروفائل تصویر",
    passwordSet: "پاس ورڈ مقرر ہو گیا",
    photoAdded: "تصویر شامل ہو گئی",
    noPhoto: "کوئی تصویر شامل نہیں",
    edit: "ترمیم",
    create: "میرا اکاؤنٹ بنائیں",
    creating: "آپ کا اکاؤنٹ بنایا جا رہا ہے…",
    legal: "اکاؤنٹ بنا کر آپ تصدیق کرتے ہیں کہ دی گئی معلومات درست ہیں۔",
    yesCreate: "جی ہاں، اکاؤنٹ بنائیں",
    reviewAgain: "دوبارہ دیکھیں",
  },

  success: {
    ...en.success,
    body: "آپ کا اکاؤنٹ تیار ہے۔",
    action: "CivicAI پر جائیں",
  },

  dashboard: {
    ...en.dashboard,
    greetingMorning: "صبح بخیر",
    greetingAfternoon: "السلام علیکم",
    greetingEvening: "شام بخیر",
    prompt: "آج ہم آپ کے شہر کو بہتر بنانے میں کیسے مدد کر سکتے ہیں؟",
    comingSoonBadge: "جلد آ رہا ہے",
    reportCamera: "کیمرے سے اطلاع دیں",
    reportCameraBody: "اپنا کیمرہ مسئلے کی طرف کریں",
    reportVoice: "اپنی شکایت بولیں",
    reportVoiceBody: "مسئلہ اپنی زبان میں بیان کریں",
    reportType: "لکھ کر بتائیں",
    reportTypeBody: "اگر آپ چاہیں تو شکایت لکھ سکتے ہیں",
    commonIssues: "عام مسائل",
    potholes: "سڑک کے گڑھے",
    garbage: "کچرا",
    streetLight: "اسٹریٹ لائٹ",
    waterLeakage: "پانی کا رساؤ",
    notReadyTitle: "اپنے شہر کو بہتر بنانے کے لیے تیار ہیں؟",
    navHome: "ہوم",
    navReport: "اطلاع",
    navMyReports: "میری شکایات",
    navMap: "نقشہ",
    navProfile: "پروفائل",
  },

  report: {
    ...en.report,

    categories: {
      ROAD_DAMAGE: "سڑک کی خرابی",
      POTHOLE: "سڑک کا گڑھا",
      GARBAGE: "کچرا",
      BROKEN_STREETLIGHT: "خراب اسٹریٹ لائٹ",
      WATER_LEAKAGE: "پانی کا رساؤ",
      DRAINAGE_PROBLEM: "نکاسیٔ آب کا مسئلہ",
      OPEN_MANHOLE: "کھلا مین ہول",
      DAMAGED_FOOTPATH: "خراب فٹ پاتھ",
      DAMAGED_PUBLIC_INFRASTRUCTURE: "سرکاری تنصیبات کو نقصان",
      OTHER: "کوئی اور شہری مسئلہ",
    },
    severities: { LOW: "کم", MEDIUM: "درمیانہ", HIGH: "زیادہ" },

    cameraTitle: "اپنا کیمرہ مسئلے کی طرف کریں",
    cameraSubtitle: "جس شہری مسئلے کی اطلاع دینا چاہتے ہیں اس کی واضح تصویر لیں۔",
    cameraInstruction:
      "ضروری نہیں کہ مسئلہ پوری تصویر میں سمائے — بس یہ دیکھ لیں کہ وہ نظر آ رہا ہے۔",
    tipDownTitle: "کیمرہ مسئلے کی طرف نیچے کریں",
    tipDownBody: "تصویر قریب سے لیں۔",
    tipCenteredTitle: "مسئلہ درمیان میں رکھیں",
    tipCenteredBody: "دیکھ لیں کہ مسئلہ تصویر کے وسط میں ہے۔",
    tipLightingTitle: "علاقہ واضح نظر آنا چاہیے",
    tipLightingBody: "اچھی روشنی سے تفصیلات بہتر نظر آتی ہیں۔",
    commonIssuesPrompt: "عام مسائل جن کی اطلاع آپ دے سکتے ہیں",
    capture: "تصویر لیں",
    retake: "دوبارہ لیں",
    usePhoto: "یہی تصویر استعمال کریں",
    chooseFromGallery: "گیلری سے منتخب کریں",
    allowCamera: "کیمرے کی اجازت دیں",
    notNow: "ابھی نہیں",
    tryAgain: "دوبارہ کوشش کریں",
    choosePhoto: "تصویر منتخب کریں",
    qualityCheckTitle: "یہ تصویر واضح نہیں لگ رہی",
    qualityCheckBody:
      "براہِ کرم زیادہ واضح تصویر لیں تاکہ CivicAI مسئلہ بہتر سمجھ سکے۔",
    useAnyway: "پھر بھی استعمال کریں",

    analyzingTitle: "آپ کی تصویر دیکھی جا رہی ہے",
    analyzingBody: "CivicAI جانچ رہا ہے کہ یہ کس قسم کا مسئلہ ہو سکتا ہے۔",
    possibleIssue: "ممکنہ طور پر {category}",
    confirmIssuePrompt: "کیا یہی وہ مسئلہ ہے جس کی آپ اطلاع دے رہے ہیں؟",
    confirmNo: "نہیں، دوبارہ کوشش کریں",
    describeInstead: "کوئی اور مسئلہ بیان کریں",
    notDetectedTitle: "ہم کوئی مخصوص مسئلہ نہیں پہچان سکے",
    notDetectedBody:
      "آپ خود مسئلہ بیان کر سکتے ہیں — تصویر آپ کی شکایت کے ساتھ شامل رہے گی۔",
    visionUnavailableBody:
      "خودکار شناخت ابھی دستیاب نہیں۔ آپ مسئلہ خود بیان کر سکتے ہیں۔",
    chooseCategoryPrompt: "یہ کس قسم کا مسئلہ ہے؟",

    describeTitle: "ہمیں بتائیں کیا ہوا",
    describeSubtitle:
      "مسئلہ اپنے الفاظ میں بیان کریں — بول کر یا لکھ کر، جو آپ کو آسان لگے۔",
    useVoice: "بول کر بتائیں",
    typeInstead: "لکھ کر بتائیں",
    listening: "سنا جا رہا ہے…",
    tapWhenFinished: "بات مکمل ہونے پر دبائیں۔",
    processingVoice: "آپ کی بات سمجھی جا رہی ہے…",
    whatWeHeard: "ہم نے یہ سنا",
    transcriptCorrect: "درست ہے",
    recordAgain: "دوبارہ ریکارڈ کریں",
    unclearRecordingBody:
      "ہم وہ ریکارڈنگ واضح نہیں سمجھ سکے۔ دوبارہ کوشش کریں یا لکھ کر بیان کریں۔",
    describePlaceholder:
      "مثال کے طور پر: سڑک پر ایک بڑا گڑھا ہے جس سے گاڑیوں کا گزرنا مشکل ہے۔",

    locationTitle: "اپنا مقام شامل کریں",
    locationSubtitle: "آپ کے مقام سے CivicAI متعلقہ علاقہ پہچانتا ہے۔",
    useMyLocation: "میرا مقام استعمال کریں",
    enterLocationManually: "مقام خود درج کریں",
    locationLabel: "شکایت کا مقام",
    yourCurrentLocation: "آپ کا موجودہ مقام",
    confirmLocation: "مقام کی تصدیق کریں",
    changeLocation: "مقام تبدیل کریں",
    locationDeniedBody: "ہم آپ کا مقام معلوم نہیں کر سکے۔ آپ اسے خود درج کر سکتے ہیں۔",

    generatingTitle: "آپ کی شکایت تیار کی جا رہی ہے",
    generatingBody: "CivicAI آپ کی دی گئی معلومات کو ایک واضح شکایت میں ڈھال رہا ہے۔",
    generationFailedTitle: "ہم شکایت خودکار طریقے سے تیار نہیں کر سکے۔",
    editManually: "خود ترمیم کریں",
    reviewTitle: "اپنی شکایت دیکھ لیں",
    reviewSubtitle: "تصدیق سے پہلے براہِ کرم نیچے دی گئی ہر چیز کی جانچ کر لیں۔",
    evidenceSection: "ثبوت",
    issueSection: "مسئلہ",
    titleField: "عنوان",
    descriptionField: "تفصیل",
    severityField: "شدت",
    severityHint: "AI کا اندازہ — تصدیق سے پہلے آپ اسے بدل سکتے ہیں۔",
    aiGenerated: "AI کی تیار کردہ",
    aiGeneratedHint:
      "آپ کی تصویر اور تفصیل سے خودکار طور پر لکھی گئی — غور سے پڑھیں اور جو درست نہ ہو بدل دیں۔",
    edit: "ترمیم",
    save: "محفوظ کریں",
    confirmReport: "شکایت کی تصدیق کریں",
    reportReadyTitle: "آپ کی شکایت تیار ہے۔",
    incompleteReportBody: "تصدیق سے پہلے براہِ کرم ہر حصہ مکمل کریں۔",

    networkError: "آپ آف لائن ہیں۔ براہِ کرم اپنا انٹرنیٹ چیک کریں۔",
    unexpectedError: "کچھ غلط ہو گیا۔ براہِ کرم دوبارہ کوشش کریں۔",
  },

  profile: {
    ...en.profile,
    title: "پروفائل",
    identitySection: "شناختی معلومات",
    extractedFromCnic: "شناختی کارڈ سے حاصل شدہ",
    enteredManually: "خود درج کردہ",
    contactSection: "رابطہ",
    addressSection: "پتہ",
    accountSection: "اکاؤنٹ",
    settingsSection: "ترتیبات",
    fullName: "پورا نام",
    fatherName: "والد / شوہر کا نام",
    cnic: "شناختی کارڈ",
    dateOfBirth: "تاریخِ پیدائش",
    gender: "جنس",
    phone: "موبائل نمبر",
    email: "ای میل ایڈریس",
    houseNumber: "مکان نمبر",
    city: "شہر",
    district: "ضلع",
    address: "پتہ",
    permanentAddress: "مستقل پتہ (جیسا شناختی کارڈ پر درج ہے)",
    memberSince: "رکنیت کا آغاز",
    accountStatus: "اکاؤنٹ کی حالت",
    active: "فعال",
    assistedMode: "صوتی رہنمائی",
    assistedModeOn: "آن",
    assistedModeOff: "آف",
    signOut: "سائن آؤٹ",
    notProvided: "فراہم نہیں کی گئی",
  },

  assisted: {
    ...en.assisted,
    offerTitle: "کیا آپ صوتی مدد چاہیں گے؟",
    offerBody: "CivicAI ہر مرحلہ اردو میں پڑھ کر سنا سکتا ہے اور اگلا قدم بتا سکتا ہے۔",
    accept: "جی ہاں، رہنمائی کریں",
    decline: "عام طریقے سے جاری رکھیں",
    enable: "مدد چاہیے؟",
    enabled: "صوتی رہنمائی آن ہے",
    disable: "صوتی رہنمائی بند کریں",
    repeat: "دوبارہ سنیں",
    loading: "لوڈ ہو رہا ہے…",
  },
} satisfies Dictionary;
