"use client";

import { useStepAnnouncement } from "@/components/assisted/use-voice-guidance";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/**
 * Speaks the welcome line, but only for citizens who turned voice guidance on.
 * Renders nothing.
 */
export function SuccessAnnouncement() {
  useStepAnnouncement(t.voice.success);
  return null;
}
