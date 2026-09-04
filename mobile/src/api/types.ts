/*
 * The shapes the API returns.
 *
 * Hand-written rather than generated, and deliberately narrower than the server
 * types: the app should read only the fields it renders, so a field added on
 * the server never silently changes what a screen shows.
 */

export type OfficerRole = "platform_admin" | "org_head" | "dept_head" | "member";

export interface Me {
  user: { id: string; name: string; email: string };
  citizen: { available: true; profileComplete: boolean };
  officer:
    | { available: false }
    | {
        available: true;
        officerId: string;
        role: OfficerRole;
        orgId: string | null;
        orgName: string | null;
        deptId: string | null;
        deptName: string | null;
      };
  canSwitch: boolean;
}

export interface IssueSummary {
  id: string;
  issueCode: string;
  title: string;
  category: string;
  severity: string | null;
  locationLabel: string | null;
  reportCount: number;
  deptId: string | null;
  deptName: string | null;
  routingConfidence: number | null;
  createdAt: string;
}

export interface IssueDetail {
  issue: {
    id: string;
    issueCode: string;
    title: string;
    description: string | null;
    category: string;
    severity: string | null;
    locationLabel: string | null;
    reportCount: number;
    routingConfidence: number | null;
    routingRationale: string | null;
    createdAt: string;
    orgName: string | null;
    deptName: string | null;
  };
  reports: {
    linkId: string;
    reportId: string;
    matchStatus: string;
    title: string | null;
    locationLabel: string | null;
    createdAt: string;
  }[];
  conversations: ConversationSummary[];
  clarifications: ClarificationThread[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  visibility: "department" | "private";
  messageCount: number;
  participantCount: number;
  lastMessageAt: string | null;
}

export interface ConversationMessage {
  id: string;
  body: string;
  officerId: string;
  officerName: string;
  role: string;
  mentions: { officerId: string; name: string }[];
  createdAt: string;
}

export interface ClarificationThread {
  id: string;
  issueCode: string;
  reportId: string;
  citizenName: string | null;
  status: "open" | "closed";
  messageCount: number;
  unreadForOfficer: number;
  unreadForCitizen: number;
}

export interface ClarificationMessage {
  id: string;
  senderKind: "officer" | "citizen";
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  issueCode: string | null;
  conversationId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TrackedReport {
  reportId: string;
  title: string | null;
  category: string | null;
  locationLabel: string | null;
  submittedAt: string;
  reportStatus: string;
  /** Null until the intake pipeline has placed this report on an issue. */
  issue: {
    issueCode: string;
    title: string;
    stageName: string | null;
    isResolved: boolean;
    reportCount: number;
    departmentName: string | null;
    orgName: string;
    needsReview: boolean;
  } | null;
}

export interface TrackingSummary {
  total: number;
  submitted: number;
  drafts: number;
  reported: number;
  inProcess: number;
  resolved: number;
}

/** One tracked issue with its stage timeline, as the citizen sees it. */
export interface CitizenIssueDetail {
  issueCode: string;
  title: string;
  description: string | null;
  category: string;
  locationLabel: string | null;
  reportCount: number;
  departmentName: string | null;
  orgName: string;
  stageName: string | null;
  isResolved: boolean;
  createdAt: string;
  /*
   * Stage changes with timestamps and nothing else. No officer names and no
   * internal notes: a citizen is entitled to know their issue moved on a given
   * date, not to read the department's internal reasoning about it.
   */
  timeline: { stageName: string; position: number; isTerminal: boolean; at: string }[];
}

/**
 * The citizen's own profile, as /api/citizen/profile returns it.
 *
 * Mirrors CitizenProfile in src/lib/profile.ts. Note `cnicMasked`: the real
 * number is never sent to any client, not even the citizen's own — the server
 * holds it encrypted and this masked form is all that ever leaves it.
 */
export interface CitizenProfile {
  fullName: string;
  fatherName: string | null;
  cnicMasked: string;
  dateOfBirth: string | null;
  gender: string | null;
  identitySource: string | null;
  phone: string | null;
  houseNumber: string | null;
  city: string | null;
  district: string | null;
  sector: string | null;
  street: string | null;
  road: string | null;
  residentialAddress: string | null;
  permanentAddress: string | null;
  preferredLanguage: string | null;
  assistedMode: boolean | null;
  hasProfileImage: boolean;
  createdAt: string;
  email: string;
}

/** One authority's public performance row, as /api/performance returns it. */
export interface AuthorityPerformance {
  authorityId: string;
  authorityName: string;
  authorityCode: string;
  reported: number;
  inProcess: number;
  resolved: number;
  citizenReports: number;
  totalIssues: number;
  openIssues: number;
  resolutionRate: number;
  rankingScore: number;
  /** False when the caseload is too small to rank honestly — still shown. */
  ranked: boolean;
  /** 1-based position, or 0 when `ranked` is false. */
  rank: number;
}

export interface PerformanceSummary {
  citizenReports: number;
  issues: number;
  reported: number;
  inProcess: number;
  resolved: number;
  resolutionRate: number;
}

/* -- Government portal ---------------------------------------------------- */

export interface GovOverview {
  reports: number;
  issues: number;
  reported: number;
  inProcess: number;
  resolved: number;
  grouped: number;
  unrouted: number;
}

export interface DepartmentLoad {
  deptId: string;
  name: string;
  issues: number;
  reports: number;
  resolved: number;
  open: number;
}

export interface GovOverviewPayload {
  overview: GovOverview;
  departments: DepartmentLoad[];
  unrouted: number;
  officer: { role: string; orgName: string | null; deptName: string | null };
}

/** One row of the "how is everyone below me doing" table. */
export interface PeerRow {
  id: string;
  name: string;
  subtitle: string | null;
  reported: number;
  inProcess: number;
  resolved: number;
  citizenReports: number;
  totalIssues: number;
  openIssues: number;
  resolutionRate: number;
  rankingScore: number;
  ranked: boolean;
  rank: number;
}

export interface PeerPerformance {
  /** Which tier is being compared — decided by the server from the role. */
  level: "organization" | "department" | "member" | "none";
  label: string;
  rows: PeerRow[];
}

/** One complaint as the officer portal sees it, with its assignment state. */
export interface ComplaintDetail {
  complaint: {
    reportId: string;
    title: string | null;
    description: string | null;
    category: string | null;
    severity: string | null;
    locationLabel: string | null;
    submittedAt: string;
    assignment: {
      id: string;
      orgId: string;
      deptId: string;
      deptName: string | null;
      currentStageId: string | null;
      currentStageName: string | null;
      assignedOfficerId: string | null;
      assignedOfficerName: string | null;
      isResolved: boolean;
      stageEnteredAt: string | null;
      slaHours: number | null;
    } | null;
    rating: { stars: number; comment: string | null; ratedAt: string } | null;
    needsAttention: boolean;
  };
  progress: {
    id: string;
    stageName: string;
    enteredAt: string;
    completedAt: string | null;
    completedByOfficerName: string | null;
    note: string | null;
    photoUrl: string | null;
  }[];
  /*
   * What this officer may do, answered by the server from the same
   * authorize.ts predicates the mutating routes enforce — so a button shown
   * here and the permission checked there cannot drift apart.
   */
  permissions: {
    canAdvance: boolean;
    canReopen: boolean;
    /** Dept head placing routed work on a member's desk. */
    canAssign: boolean;
    /** Org head sending unrouted work to a department. */
    canRoute: boolean;
    requiresPhoto: boolean;
    requiresNote: boolean;
  };
}

/** A department member, as the assign picker needs them. */
export interface DepartmentMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** A department, as the routing picker needs it. */
export interface DepartmentOption {
  id: string;
  name: string;
  hasWorkflow?: boolean;
}

/** An organization, as the admin screen lists them. */
export interface OrganizationSummary {
  id: string;
  name: string;
  code: string;
  departmentCount?: number;
}

/** A pending invitation awaiting redemption. */
export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  orgName: string | null;
  deptName: string | null;
  expiresAt: string;
  /** Present in development, where invites are printed rather than emailed. */
  token?: string | null;
}
