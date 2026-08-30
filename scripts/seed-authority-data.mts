/*
 * Demo content for the Stage 3 authority side, kept apart from the seeding
 * mechanics in seed-authority.ts.
 *
 * Everything here is fictional. These are not real CDA employees, not real
 * citizens and not real complaints — they are plausible-looking test data for
 * a prototype, and nothing in the application treats them as anything else.
 */

/** The demo authority. Nothing in the app hardcodes CDA; this is just a row. */
export const DEMO_AUTHORITY = {
  code: "CDA",
  name: "Capital Development Authority (Demo)",
  slug: "cda-demo",
  city: "Islamabad",
};

/*
 * A SECOND authority, so that isolation between authorities is demonstrable
 * rather than merely asserted. Its departments claim categories CDA does not,
 * which means the routing agent sends those reports here on its own — the
 * authority follows from the configuration, and no code anywhere mentions
 * either body by name.
 *
 * An MCI member signing in sees only MCI's issues, and cannot reach CDA's by
 * editing a URL.
 */
export const SECOND_AUTHORITY = {
  code: "MCI",
  name: "Metropolitan Corporation Islamabad (Demo)",
  slug: "mci-demo",
  city: "Islamabad",
};

export const SECOND_DEPARTMENTS = [
  {
    slug: "parks-amenities",
    name: "Parks & Amenities",
    description: "Public parks, benches, railings and civic amenities.",
    categories: ["DAMAGED_PUBLIC_INFRASTRUCTURE"],
  },
  {
    slug: "emergency-response",
    name: "Emergency Response",
    description: "Storm damage, obstructions and anything not otherwise assigned.",
    categories: ["OTHER"],
  },
];

export const SECOND_ADMIN_NAMES = ["Saira Bukhari"];

export const PARKS_NAMES = [
  "Naveed Akhtar", "Hira Siddiqui", "Zohaib Malik", "Ammara Tariq",
];

export const EMERGENCY_NAMES = [
  "Kashif Raza", "Sundas Naeem", "Bilal Ahmad",
];

/*
 * Departments, each declaring the civic categories it handles. This IS the
 * routing configuration — the routing agent reads nothing else.
 */
export const DEMO_DEPARTMENTS = [
  {
    slug: "water-management",
    name: "Water Management",
    description: "Water supply, leakage, drainage and sewerage across the capital.",
    categories: ["WATER_LEAKAGE", "DRAINAGE_PROBLEM", "OPEN_MANHOLE"],
  },
  {
    slug: "road-infrastructure",
    name: "Road & Infrastructure",
    description: "Carriageways, footpaths and road surface maintenance.",
    categories: ["POTHOLE", "ROAD_DAMAGE", "DAMAGED_FOOTPATH"],
  },
  {
    slug: "municipal-services",
    name: "Municipal Services",
    description: "Waste collection, street lighting and public amenities.",
    /*
     * DAMAGED_PUBLIC_INFRASTRUCTURE and OTHER deliberately belong to MCI
     * instead. Two authorities claiming one category is a real configuration
     * problem (the routing agent flags it as ambiguous), not something to
     * demonstrate on purpose.
     */
    categories: ["GARBAGE", "BROKEN_STREETLIGHT"],
  },
];

/** Fictional staff names. Roughly 53 people across the demo authority. */
export const ADMIN_NAMES = ["Nadia Sheikh", "Imran Qureshi", "Farhan Siddiqui"];

export const WATER_NAMES = [
  "Ali Raza", "Ahmed Nawaz", "Sara Bilal", "Hassan Tariq", "Bilal Akhtar",
  "Ayesha Malik", "Usman Ghani", "Zainab Haider", "Kamran Aslam", "Rabia Noor",
  "Shahid Mehmood", "Hina Farooq", "Adnan Bashir", "Maryam Javed", "Tariq Saeed",
  "Nida Khan", "Owais Anwar", "Sana Rafiq", "Junaid Iqbal", "Amna Rashid",
];

export const ROAD_NAMES = [
  "Fahad Mahmood", "Iqra Yousaf", "Salman Abbas", "Mehwish Ali", "Danish Kamal",
  "Sadia Waheed", "Umar Farooq", "Anum Zafar", "Waqas Ahmed", "Laiba Sohail",
  "Asad Mehmood", "Tehmina Riaz", "Zeeshan Haq", "Kiran Shahzad", "Noman Butt",
];

export const MUNICIPAL_NAMES = [
  "Rehan Aziz", "Fatima Naveed", "Shoaib Latif", "Areeba Munir", "Hamza Rauf",
  "Sidra Kamran", "Yasir Nadeem", "Komal Pervaiz", "Arslan Majeed", "Bushra Ilyas",
  "Talha Sarwar", "Nimra Aftab", "Faizan Hussain", "Saba Arshad", "Raheel Younas",
];

/** Fictional citizens whose reports the pipeline will group into issues. */
export const CITIZEN_NAMES = [
  "Abdul Rehman", "Kashif Mahmood", "Nazia Sultan", "Irfan Ali", "Shazia Bibi",
  "Waseem Akram", "Rukhsana Parveen", "Zubair Ahmed", "Farida Begum", "Naveed Anjum",
  "Samina Kausar", "Tanveer Hussain", "Uzma Shabbir", "Ejaz Ahmad", "Rizwan Sattar",
  "Nasreen Akhtar", "Shakeel Ahmed", "Ghazala Yasmin", "Mudassar Iqbal", "Bushra Naz",
  "Aftab Alam", "Robina Khalid", "Zahid Mehmood", "Yasmeen Akhtar", "Sajid Mahmood",
  "Parveen Akhtar", "Naeem Ullah", "Shabana Kausar", "Arif Mehmood", "Rehana Kausar",
];

export interface DemoCluster {
  category: string;
  /** Anchor point. Individual reports are jittered around it. */
  latitude: number;
  longitude: number;
  locationLabel: string;
  title: string;
  description: string;
  /** Report wordings, cycled through — real duplicates are never identical. */
  variants: string[];
  /** How many citizen reports describe this one problem. */
  reports: number;
  /** Days before "now" the first report arrived. */
  daysAgo: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  /**
   * Extra reports placed ~200m away with vaguer wording. These are what land
   * in `needs_review` — plausibly the same problem, not certain.
   */
  nearMisses?: number;
}

/*
 * Sixteen distinct civic problems around Islamabad, spread across the three
 * demo departments, with realistic duplicate clusters. The first is the
 * headline case: 24 citizens, one pothole.
 */
export const DEMO_CLUSTERS: DemoCluster[] = [
  {
    category: "POTHOLE",
    latitude: 33.6844, longitude: 73.0479,
    locationLabel: "Service Road West, G-10/4, Islamabad",
    title: "Deep pothole on G-10/4 service road",
    description:
      "A large pothole has opened on the service road near the G-10/4 markaz entrance. Vehicles are swerving into oncoming traffic to avoid it.",
    variants: [
      "Deep pothole on the service road near G-10 markaz, cars swerving to avoid it",
      "Large pothole outside G-10/4 market entrance damaging vehicle tyres",
      "Big hole in the road surface near G-10 markaz, dangerous for motorcycles",
      "Pothole on service road G-10/4 has become deeper after the rain",
    ],
    reports: 24, daysAgo: 9, severity: "HIGH", nearMisses: 2,
  },
  {
    category: "WATER_LEAKAGE",
    latitude: 33.7014, longitude: 73.0553,
    locationLabel: "Street 42, F-8/3, Islamabad",
    title: "Water main leaking on Street 42, F-8/3",
    description:
      "Continuous water leakage from a main line has flooded part of Street 42. Water has been running for several days.",
    variants: [
      "Water leaking continuously from the main line on Street 42 F-8/3",
      "Water main burst near Street 42, road is flooded and water is being wasted",
      "Leakage from water supply pipe flooding the street in F-8/3",
    ],
    reports: 11, daysAgo: 6, severity: "HIGH", nearMisses: 1,
  },
  {
    category: "GARBAGE",
    latitude: 33.6603, longitude: 73.0712,
    locationLabel: "Sector G-11/2 collection point, Islamabad",
    title: "Garbage accumulating at G-11/2 collection point",
    description:
      "The collection point in G-11/2 has not been cleared for over a week. Waste is spilling onto the footpath and the smell is severe.",
    variants: [
      "Garbage not collected for a week at G-11/2, waste spilling onto footpath",
      "Rubbish piling up at the G-11 collection point, very bad smell",
      "Uncollected garbage heap near G-11/2, stray dogs gathering around it",
    ],
    reports: 8, daysAgo: 4, severity: "MEDIUM",
  },
  {
    category: "DRAINAGE_PROBLEM",
    latitude: 33.6938, longitude: 73.0361,
    locationLabel: "Margalla Road near F-7/1, Islamabad",
    title: "Blocked drainage flooding Margalla Road",
    description:
      "Storm drains along Margalla Road are blocked and rainwater is collecting across both lanes after every shower.",
    variants: [
      "Drain blocked on Margalla Road, rainwater standing across both lanes",
      "Storm drainage choked near F-7, water does not clear after rain",
      "Blocked drain causing water to accumulate on the road near F-7/1",
    ],
    reports: 6, daysAgo: 3, severity: "MEDIUM",
  },
  {
    category: "BROKEN_STREETLIGHT",
    latitude: 33.6462, longitude: 73.0796,
    locationLabel: "Main Double Road, I-8/3, Islamabad",
    title: "Streetlights out along I-8/3 Double Road",
    description:
      "A stretch of streetlights on Double Road has been out for two weeks, leaving the pedestrian crossing unlit at night.",
    variants: [
      "Streetlights not working on Double Road I-8/3 for two weeks",
      "Street lighting out near I-8 crossing, very dark at night for pedestrians",
      "Several street lamps dead along Double Road, unsafe after sunset",
    ],
    reports: 7, daysAgo: 12, severity: "MEDIUM",
  },
  {
    category: "OPEN_MANHOLE",
    latitude: 33.7118, longitude: 73.0602,
    locationLabel: "Street 9, F-6/2, Islamabad",
    title: "Open manhole on Street 9, F-6/2",
    description:
      "A manhole cover is missing on Street 9. The opening is unmarked and directly on the pedestrian route to the school.",
    variants: [
      "Manhole cover missing on Street 9 F-6/2, open hole on the walking route",
      "Uncovered manhole near F-6/2, children walk past it to school",
      "Open manhole without any barrier or warning on Street 9",
    ],
    reports: 5, daysAgo: 2, severity: "HIGH",
  },
  {
    category: "ROAD_DAMAGE",
    latitude: 33.6521, longitude: 73.1043,
    locationLabel: "IJP Road near Faizabad, Islamabad",
    title: "Road surface broken up on IJP Road",
    description:
      "A long stretch of IJP Road has broken up, with loose gravel and cracked asphalt across the inner lane.",
    variants: [
      "Road surface completely broken on IJP Road, loose gravel everywhere",
      "Cracked and broken asphalt on IJP Road inner lane near Faizabad",
      "Damaged road surface on IJP Road causing traffic to slow badly",
    ],
    reports: 9, daysAgo: 15, severity: "HIGH",
  },
  {
    category: "DAMAGED_FOOTPATH",
    latitude: 33.7076, longitude: 73.0489,
    locationLabel: "Jinnah Super Market, F-7/2, Islamabad",
    title: "Broken footpath tiles at Jinnah Super",
    description:
      "Footpath tiles outside Jinnah Super are lifted and broken, making the walkway difficult for elderly pedestrians.",
    variants: [
      "Footpath tiles lifted and broken outside Jinnah Super Market",
      "Damaged pavement at F-7 markaz, difficult to walk on",
      "Broken footpath slabs near Jinnah Super, trip hazard for elderly",
    ],
    reports: 4, daysAgo: 8, severity: "LOW",
  },
  {
    category: "WATER_LEAKAGE",
    latitude: 33.6669, longitude: 73.0405,
    locationLabel: "Street 24, G-9/1, Islamabad",
    title: "Supply line leaking in G-9/1",
    description:
      "A supply line is leaking at the corner of Street 24, and residents report low pressure across the block.",
    variants: [
      "Water supply line leaking at Street 24 corner in G-9/1",
      "Leaking pipe in G-9/1 and low water pressure in nearby houses",
    ],
    reports: 3, daysAgo: 1, severity: "MEDIUM",
  },
  {
    category: "GARBAGE",
    latitude: 33.6398, longitude: 73.0821,
    locationLabel: "I-9 Industrial Area, Islamabad",
    title: "Waste dumping in I-9 Industrial Area",
    description:
      "Construction and household waste is being dumped on the vacant plot beside the I-9 service lane.",
    variants: [
      "Waste being dumped on vacant plot in I-9 industrial area",
      "Construction rubble and household waste dumped beside I-9 service lane",
    ],
    reports: 5, daysAgo: 20, severity: "MEDIUM",
  },
  {
    category: "POTHOLE",
    latitude: 33.7231, longitude: 73.0655,
    locationLabel: "Street 15, F-6/1, Islamabad",
    title: "Potholes on Street 15, F-6/1",
    description:
      "Several potholes have formed along Street 15 after recent digging work was backfilled poorly.",
    variants: [
      "Potholes on Street 15 F-6/1 where the road was dug and refilled badly",
      "Multiple holes in the road on Street 15 after pipeline work",
    ],
    reports: 4, daysAgo: 5, severity: "MEDIUM",
  },
  {
    category: "BROKEN_STREETLIGHT",
    latitude: 33.6712, longitude: 73.0158,
    locationLabel: "Park Road near H-8, Islamabad",
    title: "Streetlight pole down on Park Road",
    description:
      "A streetlight pole near the H-8 turning has come down and is resting against the boundary wall.",
    variants: [
      "Streetlight pole fallen near H-8 turning on Park Road",
      "Light pole down and leaning on the wall near Park Road H-8",
    ],
    reports: 3, daysAgo: 7, severity: "HIGH",
  },
  {
    category: "DRAINAGE_PROBLEM",
    latitude: 33.6288, longitude: 73.0714,
    locationLabel: "Sector I-10/4, Islamabad",
    title: "Sewerage overflowing in I-10/4",
    description:
      "Sewerage is overflowing from a manhole in I-10/4 and running along the street toward the houses.",
    variants: [
      "Sewerage overflowing from manhole in I-10/4 and running down the street",
      "Sewage water flowing on the road in I-10/4, terrible smell near houses",
      "Overflowing sewerage line in I-10/4 reaching the house entrances",
    ],
    reports: 6, daysAgo: 11, severity: "HIGH",
  },
  {
    category: "DAMAGED_PUBLIC_INFRASTRUCTURE",
    latitude: 33.6955, longitude: 73.0721,
    locationLabel: "F-9 Park, Islamabad",
    title: "Damaged benches and railing in F-9 Park",
    description:
      "Several benches and a section of railing in F-9 Park are broken and have sharp edges exposed.",
    variants: [
      "Broken benches and damaged railing in F-9 Park with sharp edges",
      "Park furniture damaged in F-9, railing section completely broken",
    ],
    reports: 3, daysAgo: 18, severity: "LOW",
  },
  {
    category: "ROAD_DAMAGE",
    latitude: 33.6180, longitude: 73.0902,
    locationLabel: "Kuri Road, Islamabad",
    title: "Road edge collapsed on Kuri Road",
    description:
      "The edge of the carriageway on Kuri Road has collapsed into the drain, narrowing the usable road.",
    variants: [
      "Road edge collapsed into the drain on Kuri Road, lane is narrowed",
      "Carriageway edge broken away on Kuri Road near the culvert",
    ],
    reports: 4, daysAgo: 13, severity: "HIGH",
  },
  {
    category: "OTHER",
    latitude: 33.7002, longitude: 73.0289,
    locationLabel: "Margalla Road, F-6/3, Islamabad",
    title: "Fallen tree blocking Margalla Road lane",
    description:
      "A large tree has fallen across the inner lane of Margalla Road after the storm and is blocking traffic.",
    variants: [
      "Large tree fallen across the inner lane of Margalla Road after the storm",
      "Tree blocking road near F-6/3, traffic having to use one lane only",
    ],
    reports: 3, daysAgo: 1, severity: "HIGH",
  },
];

/** Vaguer wording for the near-miss reports that should land in review. */
export const NEAR_MISS_VARIANTS = [
  "Surface damaged outside the shops, needs attention",
  "Something wrong with the road here, please send someone",
  "Condition near the market has got worse recently",
];
