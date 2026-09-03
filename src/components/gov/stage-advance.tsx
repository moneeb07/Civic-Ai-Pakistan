"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { GovField } from "@/components/gov/gov-field";
import { ConfirmDialog } from "@/components/gov/confirm-dialog";
import { InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Completing a stage.
 *
 * The photo and note inputs appear only when the current stage actually
 * requires them, and the submit button stays disabled until they are filled —
 * but the server enforces the same rule in advanceStage(), so a crafted
 * request cannot skip evidence a department decided it needs.
 *
 * `canReopen` renders the department head's reopen control, behind a
 * confirmation because it moves a closed complaint back into the queue.
 */
export function StageAdvance({
  reportId,
  stageName,
  requiresPhoto,
  requiresNote,
  isResolved,
  canAdvance,
  canReopen,
}: {
  reportId: string;
  stageName: string | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
  isResolved: boolean;
  canAdvance: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = React.useState(false);
  const [reopening, setReopening] = React.useState(false);

  const missingPhoto = requiresPhoto && photoUrl.trim().length === 0;
  const missingNote = requiresNote && note.trim().length === 0;

  async function advance() {
    setBusy(true);
    setError(null);

    try {
      const result = await api.advanceStage(reportId, {
        photoUrl: photoUrl.trim() || null,
        note: note.trim() || null,
      });
      toast.success(result.message);
      setPhotoUrl("");
      setNote("");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setReopening(true);
    try {
      const result = await api.reopenComplaint(reportId);
      toast.success(result.message);
      setConfirmReopen(false);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setReopening(false);
    }
  }

  if (isResolved) {
    return (
      <>
        <Card className="border-civic-200 bg-civic-50 shadow-none">
          <CardBody>
            <p className="text-[0.9375rem] leading-relaxed text-ink/75">
              {t.gov.complaint.resolvedNotice}
            </p>
            {canReopen ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() => setConfirmReopen(true)}
              >
                {t.gov.dept.reopen}
              </Button>
            ) : null}
          </CardBody>
        </Card>

        <ConfirmDialog
          open={confirmReopen}
          title={t.gov.dept.reopenConfirmTitle}
          body={t.gov.dept.reopenConfirmBody}
          confirmLabel={t.gov.dept.confirm}
          busy={reopening}
          onConfirm={reopen}
          onCancel={() => setConfirmReopen(false)}
        />
      </>
    );
  }

  if (!canAdvance) return null;

  return (
    <Card>
      <CardBody>
        <CardEyebrow>{t.gov.complaint.advanceTitle}</CardEyebrow>
        {stageName ? (
          <p className="mt-2 text-[0.9375rem] text-muted">
            {t.gov.complaint.stageLabel}: <span className="font-medium text-ink">{stageName}</span>
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          {error ? <InlineError message={error} /> : null}

          {requiresPhoto ? (
            <GovField
              id="advance-photo"
              label={t.gov.complaint.photoUrlLabel}
              type="url"
              inputMode="url"
              placeholder={t.gov.complaint.photoUrlPlaceholder}
              value={photoUrl}
              onChange={(event) => setPhotoUrl(event.target.value)}
              hint={t.gov.complaint.photoRequired}
              disabled={busy}
            />
          ) : null}

          {requiresNote ? (
            <GovField id="advance-note" label={t.gov.complaint.noteLabel} hint={t.gov.complaint.noteRequired}>
              <textarea
                id="advance-note"
                rows={3}
                value={note}
                placeholder={t.gov.complaint.notePlaceholder}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
                aria-describedby="advance-note-hint"
                className="w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 py-3 text-base text-ink shadow-[var(--shadow-field)] transition-colors placeholder:text-muted/70 focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
              />
            </GovField>
          ) : null}

          {!requiresPhoto && !requiresNote ? (
            <GovField id="advance-note-optional" label={`${t.gov.complaint.noteLabel} (${t.gov.common.optional})`}>
              <textarea
                id="advance-note-optional"
                rows={3}
                value={note}
                placeholder={t.gov.complaint.notePlaceholder}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
                className="w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 py-3 text-base text-ink shadow-[var(--shadow-field)] transition-colors placeholder:text-muted/70 focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
              />
            </GovField>
          ) : null}
        </div>

        <Button
          type="button"
          onClick={advance}
          disabled={missingPhoto || missingNote}
          loading={busy}
          className="mt-5"
        >
          {busy ? t.gov.complaint.advancing : t.gov.complaint.advance}
        </Button>
      </CardBody>
    </Card>
  );
}
