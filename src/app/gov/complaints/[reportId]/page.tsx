import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Star } from "lucide-react";

import { Card, CardBody, CardEyebrow, CardTitle } from "@/components/ui/card";
import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { StageAdvance } from "@/components/gov/stage-advance";
import { ToastProvider } from "@/components/gov/toast";
import {
  canAdvanceStage,
  canManageAssignees,
  canPostToChat,
  canReopenComplaint,
} from "@/lib/gov/authorize";
import { AssigneeManager } from "@/components/gov/assignee-manager";
import { ChatPanel } from "@/components/gov/chat-panel";
import { chatParticipants, listChatMessages } from "@/lib/gov/chat";
import { listDepartmentMembers } from "@/lib/gov/store";
import { getComplaintForOfficer, listStageProgress } from "@/lib/gov/complaints";
import { formatSla, formatTimestamp, humanizeCategory, isOverdue } from "@/lib/gov/format";
import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";
import { getStageById } from "@/lib/gov/workflow";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Complaint" };
export const dynamic = "force-dynamic";

/*
 * One complaint, end to end: what the citizen reported, where it is in the
 * department's workflow, and the controls for whoever is allowed to move it.
 *
 * getComplaintForOfficer() returns null both for a complaint that does not
 * exist and for one outside this officer's scope; notFound() renders the same
 * page for both, so an officer cannot probe for ids in other departments.
 */
export default async function GovComplaintPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { officer } = await requireOfficer();
  const { reportId } = await params;

  const complaint = await getComplaintForOfficer(reportId, officer);
  if (!complaint) notFound();

  const assignment = complaint.assignment;
  const progress = assignment ? await listStageProgress(assignment.id) : [];

  // The current stage's own requirements drive which inputs the advance form
  // shows — they belong to the stage, not to the page.
  const currentStage = assignment?.currentStageId
    ? await getStageById(assignment.currentStageId)
    : null;

  const scope = assignment
    ? {
        orgId: assignment.orgId,
        deptId: assignment.deptId,
        assigneeIds: assignment.assignees.map((a) => a.officerId),
      }
    : null;

  /*
   * The discussion and its membership are loaded here, on the server, so the
   * panel paints with real content on first render instead of a skeleton that
   * swaps a moment later. Only fetched once the complaint is routed — there is
   * no group before that.
   */
  const [messages, participants, deptMembers] = assignment
    ? await Promise.all([
        listChatMessages(reportId),
        chatParticipants(assignment.orgId, assignment.deptId, scope!.assigneeIds),
        listDepartmentMembers(assignment.deptId),
      ])
    : [[], [], []];

  const overdue = isOverdue(assignment?.stageEnteredAt ?? null, assignment?.slaHours ?? null);

  return (
    <ToastProvider>
      <GovShell officer={officer} backHref={ROLE_HOME[officer.role]}>
        <GovPageHeading
          title={complaint.title ?? t.gov.complaint.noTitle}
          subtitle={complaint.locationLabel ?? undefined}
        />

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardBody>
                <CardEyebrow>{t.gov.complaint.detailsEyebrow}</CardEyebrow>
                <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink/85">
                  {complaint.description ?? t.gov.complaint.noDescription}
                </p>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Detail
                    label={t.gov.complaint.categoryLabel}
                    value={humanizeCategory(complaint.category)}
                  />
                  <Detail label={t.gov.complaint.severityLabel} value={complaint.severity} />
                  <Detail
                    label={t.gov.complaint.locationLabel}
                    value={complaint.locationLabel}
                  />
                  <Detail
                    label={t.gov.complaint.submittedLabel}
                    value={formatTimestamp(complaint.submittedAt)}
                  />
                </dl>
              </CardBody>
            </Card>

            {assignment ? (
              <Card>
                <CardBody>
                  <CardEyebrow>{t.gov.complaint.timelineEyebrow}</CardEyebrow>

                  {progress.length === 0 ? (
                    <p className="mt-3 text-[0.9375rem] text-muted">
                      {t.gov.complaint.notStarted}
                    </p>
                  ) : (
                    <ol className="mt-4 space-y-4">
                      {progress.map((entry) => (
                        <li key={entry.id} className="flex gap-3">
                          <span
                            className={
                              entry.completedAt
                                ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-civic-100 text-civic-700"
                                : "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface"
                            }
                            aria-hidden="true"
                          >
                            {entry.completedAt ? <Check className="size-3.5" /> : null}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-[0.9375rem] font-semibold text-ink">
                              {entry.stageName}
                            </p>
                            <p className="mt-0.5 text-[0.8125rem] text-muted">
                              {formatTimestamp(entry.enteredAt)}
                              {entry.completedByOfficerName
                                ? ` · ${entry.completedByOfficerName}`
                                : ""}
                            </p>
                            {entry.note ? (
                              <p className="mt-1.5 text-[0.875rem] leading-snug text-ink/75">
                                {entry.note}
                              </p>
                            ) : null}
                            {entry.photoUrl ? (
                              <a
                                href={entry.photoUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mt-1.5 inline-block text-[0.8125rem] font-medium text-civic-600 underline underline-offset-2"
                              >
                                {t.gov.complaint.photoUrlLabel}
                              </a>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardBody>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            {assignment ? (
              <Card>
                <CardBody>
                  <CardTitle>{assignment.deptName}</CardTitle>
                  <dl className="mt-4 space-y-3">
                    <Detail
                      label={t.gov.complaint.assignedLabel}
                      value={
                        assignment.assignees.length === 0
                          ? t.gov.dept.unassigned
                          : assignment.assignees.map((a) => a.name).join(", ")
                      }
                    />
                    <Detail
                      label={t.gov.complaint.stageLabel}
                      value={
                        assignment.isResolved
                          ? t.gov.complaint.resolvedBadge
                          : assignment.currentStageName
                      }
                    />
                    {assignment.slaHours !== null && !assignment.isResolved ? (
                      <Detail
                        label={t.gov.complaint.dueIn}
                        value={formatSla(assignment.slaHours)}
                        tone={overdue ? "danger" : undefined}
                      />
                    ) : null}
                  </dl>
                </CardBody>
              </Card>
            ) : null}

            {complaint.rating ? (
              <Card className={complaint.needsAttention ? "border-danger/25" : undefined}>
                <CardBody>
                  <CardEyebrow>{t.gov.complaint.ratingEyebrow}</CardEyebrow>
                  <p className="mt-2 flex items-center gap-1.5 text-[1.0625rem] font-semibold text-ink">
                    <Star className="size-4 text-amber-500" aria-hidden="true" />
                    {complaint.rating.stars} {t.gov.complaint.ratingStars}
                  </p>
                  {complaint.rating.comment ? (
                    <p className="mt-2 text-[0.875rem] leading-relaxed text-ink/75">
                      {complaint.rating.comment}
                    </p>
                  ) : null}
                  {complaint.needsAttention ? (
                    <p className="mt-3 text-[0.8125rem] font-semibold text-danger">
                      {t.gov.dept.lowRating}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}

            {assignment && scope ? (
              <AssigneeManager
                reportId={complaint.reportId}
                initialAssignees={assignment.assignees}
                candidates={deptMembers.filter((m) => m.role === "member")}
                canManage={canManageAssignees(officer, scope)}
              />
            ) : null}

            {assignment && scope ? (
              <StageAdvance
                reportId={complaint.reportId}
                stageName={assignment.currentStageName}
                requiresPhoto={currentStage?.requiresPhoto ?? false}
                requiresNote={currentStage?.requiresNote ?? false}
                isResolved={assignment.isResolved}
                canAdvance={canAdvanceStage(officer, scope)}
                canReopen={canReopenComplaint(officer, scope)}
              />
            ) : null}
          </div>
        </div>

        {assignment && scope ? (
          <div className="mt-4">
            <ChatPanel
              reportId={complaint.reportId}
              currentOfficerId={officer.id}
              initialMessages={messages}
              initialParticipants={participants}
              canPost={canPostToChat(officer, scope)}
            />
          </div>
        ) : (
          <Card className="mt-4 border-dashed shadow-none">
            <CardBody className="py-8 text-center">
              <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
                {t.gov.chat.notRoutedTitle}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
                {t.gov.chat.notRoutedBody}
              </p>
            </CardBody>
          </Card>
        )}
      </GovShell>
    </ToastProvider>
  );
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd
        className={
          tone === "danger"
            ? "mt-1 text-[0.9375rem] font-semibold text-danger"
            : "mt-1 text-[0.9375rem] text-ink"
        }
      >
        {value ?? t.gov.common.none}
      </dd>
    </div>
  );
}
