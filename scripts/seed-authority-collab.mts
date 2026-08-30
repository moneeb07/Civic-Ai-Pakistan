/*
 * Demo statuses, discussions and @mentions for the seeded issues.
 *
 * Split out of seed-authority.ts so that file stays about the intake pipeline.
 * Conversations here are written to read like real departmental coordination —
 * someone notices a pattern, asks a named colleague to inspect, evidence comes
 * back, the status moves. No "hello / test / ok" filler, because a judge
 * reading the demo learns nothing from that.
 *
 * All dialogue is fictional.
 */

import { randomBytes } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  civicIssue,
  conversationParticipant,
  issueConversation,
  issueMessage,
  issueStatusEvent,
  messageMention,
} from "@/db/authority/schema";

function newId(): string {
  return randomBytes(16).toString("base64url");
}

export interface SeedMember {
  id: string;
  name: string;
  code: string;
}

export interface CollaborationInput {
  departmentIds: Record<string, string>;
  members: Record<string, SeedMember[]>;
}

/** First name only — how colleagues actually address each other. */
function firstName(member: SeedMember): string {
  return member.name.split(" ")[0];
}

/**
 * Writes one message, resolving any @mentions to real member rows.
 *
 * Mentions are stored as rows rather than left as text so a mention always
 * points at somebody who really is in the department — the same rule the live
 * API enforces.
 */
async function postMessage(
  conversationId: string,
  author: SeedMember,
  body: string,
  mentioned: SeedMember[],
  createdAt: Date,
) {
  const messageId = newId();
  await db.insert(issueMessage).values({
    id: messageId,
    conversationId,
    memberId: author.id,
    body,
    createdAt,
  });

  for (const target of mentioned) {
    await db.insert(messageMention).values({
      id: newId(),
      messageId,
      memberId: target.id,
    });
  }
}

/*
 * Conversation scripts, written as functions of the members involved so the
 * same shape can be applied to whichever department an issue landed in.
 * `to` marks who a line mentions.
 */
type Line = { from: number; text: string; to?: number[] };

const TRIAGE_SCRIPT: Line[] = [
  { from: 0, text: "@{1} We have received multiple reports from this area over the last few days. The duplicate check has grouped them under one issue.", to: [1] },
  { from: 1, text: "I have gone through the linked reports. The coordinates are all within about 30 metres, so this does look like a single location." },
  { from: 2, text: "Reports have increased noticeably since the weekend. Two came in this morning alone." },
  { from: 0, text: "@{1} Please arrange a site inspection and confirm the extent of the damage before we commit a crew.", to: [1] },
  { from: 1, text: "I will coordinate with the field team and go out this afternoon." },
  { from: 2, text: "Please attach the inspection photographs to this issue so we have them on record." },
  { from: 1, text: "Inspection done. The affected stretch is larger than the reports suggested — roughly 20 metres, not a single spot." },
  { from: 0, text: "Noted. Moving this to In Process and requesting the repair schedule." },
];

const EVIDENCE_SCRIPT: Line[] = [
  { from: 0, text: "The citizen photographs on this issue are clear enough to work from. @{1} can you confirm this matches what the field team saw?", to: [1] },
  { from: 1, text: "Yes, it matches. The images from the two most recent reports show the same section from opposite directions." },
  { from: 2, text: "One of the grouped reports is flagged as needing review — it is about 200 metres away and the wording is vague." },
  { from: 0, text: "@{2} Please check that one separately. If it is a different spot we should split it into its own issue rather than let it inflate this count.", to: [2] },
  { from: 2, text: "Understood. I will verify the location and split it if it does not belong here." },
];

const RESOLUTION_SCRIPT: Line[] = [
  { from: 0, text: "@{1} What is the current position on this one? It has been open for a while.", to: [1] },
  { from: 1, text: "Work was completed on site yesterday. The team has cleared the area and restored the surface." },
  { from: 2, text: "I visited this morning to confirm. The complaint condition is no longer present." },
  { from: 0, text: "Good. @{2} please note the completion date in the status update so the history is accurate.", to: [2] },
  { from: 2, text: "Added. Marking this as Resolved." },
];

const PLANNING_SCRIPT: Line[] = [
  { from: 0, text: "@{1} This is the third issue in the same sector this month. Worth looking at whether there is a common cause.", to: [1] },
  { from: 1, text: "Agreed. The two earlier ones were both within a few hundred metres of this location." },
  { from: 2, text: "The recent digging work in that block may be related. I can pull the dates." },
  { from: 0, text: "Please do. If the timing lines up we should raise it with the contractor rather than keep patching." },
  { from: 1, text: "I will prepare a short summary of all three issues for that discussion." },
];

const SCRIPTS = [TRIAGE_SCRIPT, EVIDENCE_SCRIPT, RESOLUTION_SCRIPT, PLANNING_SCRIPT];

/** Fills the {n} placeholders with real first names. */
function render(text: string, cast: SeedMember[]): string {
  return text.replace(/\{(\d+)\}/g, (_, index: string) => firstName(cast[Number(index)]));
}

export async function seedCollaboration(input: CollaborationInput) {
  const issues = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      departmentId: civicIssue.departmentId,
      reportCount: civicIssue.reportCount,
      createdAt: civicIssue.createdAt,
    })
    .from(civicIssue)
    .orderBy(asc(civicIssue.issueCode));

  // Which department each issue's members come from.
  const membersByDepartment = new Map<string, SeedMember[]>();
  for (const [slug, id] of Object.entries(input.departmentIds)) {
    membersByDepartment.set(id, input.members[slug] ?? []);
  }

  let statusUpdates = 0;
  let conversations = 0;
  let messages = 0;

  for (const [index, issue] of issues.entries()) {
    const cast = issue.departmentId
      ? (membersByDepartment.get(issue.departmentId) ?? [])
      : [];
    if (cast.length < 3) continue;

    /*
     * A spread of statuses so every dashboard filter has something in it.
     * Busier issues (more citizen reports) are further along, which is what a
     * real queue looks like — volume drives attention.
     */
    const target =
      index % 3 === 0 ? "RESOLVED" : index % 3 === 1 ? "IN_PROCESS" : "REPORTED";

    const actors = [cast[index % cast.length], cast[(index + 5) % cast.length], cast[(index + 11) % cast.length]];

    if (target !== "REPORTED") {
      const movedAt = new Date(issue.createdAt.getTime() + 2 * 24 * 3_600_000);

      await db.insert(issueStatusEvent).values({
        id: newId(),
        issueId: issue.id,
        fromStatus: "REPORTED",
        toStatus: "IN_PROCESS",
        note: "Site inspection scheduled with the field team.",
        memberId: actors[0].id,
        createdAt: movedAt,
      });
      statusUpdates += 1;

      if (target === "RESOLVED") {
        const resolvedAt = new Date(movedAt.getTime() + 3 * 24 * 3_600_000);
        await db.insert(issueStatusEvent).values({
          id: newId(),
          issueId: issue.id,
          fromStatus: "IN_PROCESS",
          toStatus: "RESOLVED",
          note: "Work completed on site and verified by a second member.",
          memberId: actors[2].id,
          createdAt: resolvedAt,
        });
        statusUpdates += 1;
      }

      await db
        .update(civicIssue)
        .set({ status: target, updatedAt: new Date() })
        .where(eq(civicIssue.id, issue.id));
    }

    // Roughly two thirds of issues carry a discussion — an empty thread on a
    // quiet issue is realistic, and shows the empty state works.
    if (index % 3 === 2 && index > 2) continue;

    const conversationId = newId();
    const startedAt = new Date(issue.createdAt.getTime() + 6 * 3_600_000);

    await db.insert(issueConversation).values({
      id: conversationId,
      issueId: issue.id,
      title: "General discussion",
      visibility: "department",
      createdByMemberId: actors[0].id,
      createdAt: startedAt,
    });
    conversations += 1;

    const script =
      target === "RESOLVED"
        ? RESOLUTION_SCRIPT
        : SCRIPTS[index % SCRIPTS.length];

    for (const [lineIndex, line] of script.entries()) {
      await postMessage(
        conversationId,
        actors[line.from],
        render(line.text, actors),
        (line.to ?? []).map((i) => actors[i]),
        new Date(startedAt.getTime() + lineIndex * 47 * 60_000),
      );
      messages += 1;
    }
  }

  /*
   * The contextual-continuity scenario, on the busiest issue.
   *
   * A private thread runs for six messages between three members, then a
   * fourth is added part-way through. Because participation carries no
   * "joined at" cursor, the new member can read everything that came before —
   * which is the entire reason to add someone to a discussion.
   */
  // The busiest issue, so the scenario sits on the one a judge will open first.
  const [headline] = await db
    .select({ id: civicIssue.id, issueCode: civicIssue.issueCode, departmentId: civicIssue.departmentId, createdAt: civicIssue.createdAt })
    .from(civicIssue)
    .orderBy(desc(civicIssue.reportCount))
    .limit(1);

  if (headline?.departmentId) {
    const cast = membersByDepartment.get(headline.departmentId) ?? [];
    const ali = cast[0];
    const ahmed = cast[1];
    const sara = cast[2];
    const hassan = cast[3];

    if (ali && ahmed && sara && hassan) {
      const conversationId = newId();
      const startedAt = new Date(headline.createdAt.getTime() + 30 * 3_600_000);

      await db.insert(issueConversation).values({
        id: conversationId,
        issueId: headline.id,
        title: "Inspection coordination (private)",
        visibility: "private",
        createdByMemberId: ali.id,
        createdAt: startedAt,
      });
      conversations += 1;

      for (const member of [ali, ahmed, sara]) {
        await db.insert(conversationParticipant).values({
          id: newId(),
          conversationId,
          memberId: member.id,
          addedByMemberId: ali.id,
          addedAt: startedAt,
        });
      }

      const before: Line[] = [
        { from: 0, text: "Keeping this thread separate from the main discussion while we work out the contractor position.", to: [] },
        { from: 1, text: "The repair here was done under the maintenance contract eight months ago, so this may be a warranty matter." },
        { from: 2, text: "I have the completion certificate from that work. The surface failed well inside the guarantee period." },
        { from: 0, text: `@${firstName(ahmed)} Can you confirm the contractor reference before we raise it formally?`, to: [1] },
        { from: 1, text: "Confirmed. Same contractor, same stretch of road, signed off in January." },
        { from: 2, text: "That changes how we should word the repair request. We should not be paying for this twice." },
      ];

      for (const [i, line] of before.entries()) {
        const cast3 = [ali, ahmed, sara];
        await postMessage(
          conversationId,
          cast3[line.from],
          line.text,
          (line.to ?? []).map((n) => cast3[n]),
          new Date(startedAt.getTime() + i * 38 * 60_000),
        );
        messages += 1;
      }

      // Hassan joins here — after six messages already exist.
      const joinedAt = new Date(startedAt.getTime() + 7 * 38 * 60_000);
      await db.insert(conversationParticipant).values({
        id: newId(),
        conversationId,
        memberId: hassan.id,
        addedByMemberId: ali.id,
        addedAt: joinedAt,
      });

      const after: Array<{ author: SeedMember; text: string; to: SeedMember[] }> = [
        {
          author: ali,
          text: `Adding @${firstName(hassan)} — he handled the original contract file and can see everything discussed above.`,
          to: [hassan],
        },
        {
          author: hassan,
          text: "Thanks — I have read back through the thread. The warranty position looks right, the sign-off was in January and the defects period runs for twelve months.",
          to: [],
        },
        {
          author: ahmed,
          text: `@${firstName(hassan)} Can you pull the original file so we can attach it to the repair request?`,
          to: [hassan],
        },
        {
          author: hassan,
          text: "I will send it across today. On that basis the contractor should be carrying out the repair at their own cost.",
          to: [],
        },
      ];

      for (const [i, line] of after.entries()) {
        await postMessage(
          conversationId,
          line.author,
          line.text,
          line.to,
          new Date(joinedAt.getTime() + i * 26 * 60_000),
        );
        messages += 1;
      }

      console.log(
        `Contextual-continuity demo on ${headline.issueCode}: ${firstName(hassan)} added after 6 messages, sees all ${before.length + after.length}`,
      );
    }
  }

  console.log(
    `Collaboration: ${conversations} conversations, ${messages} messages, ${statusUpdates} status changes`,
  );
}
