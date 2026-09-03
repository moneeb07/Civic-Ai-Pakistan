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
