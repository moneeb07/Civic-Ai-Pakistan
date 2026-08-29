"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Confirmation for destructive or hard-to-undo actions, composed from the
 * existing Card and Button primitives — no dialog library.
 *
 * Focus is moved into the dialog on open and returned to whatever opened it on
 * close, and Tab is trapped inside while it is open, because a modal a
 * keyboard user can tab out of is a modal that has silently lost them.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = t.gov.dept.cancel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    // The shared Button primitive takes no ref, so the confirm action is found
    // by its data attribute rather than by editing a file the citizen side owns.
    panelRef.current?.querySelector<HTMLElement>("[data-confirm]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-5">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md"
      >
        <Card>
          <CardBody>
            <CardTitle id="confirm-dialog-title">{title}</CardTitle>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{body}</p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </Button>
              <Button
                data-confirm=""
                type="button"
                variant={destructive ? "danger" : "primary"}
                onClick={onConfirm}
                loading={busy}
              >
                {confirmLabel}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
