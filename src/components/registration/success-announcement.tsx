"use client";

import { useStepAnnouncement } from "@/components/assisted/use-voice-guidance";
import { useT } from "@/components/i18n/locale-provider";


/**
 * Speaks the welcome line, but only for citizens who turned voice guidance on.
 * Renders nothing.
 */
export function SuccessAnnouncement() {
  const t = useT();
  useStepAnnouncement(t.voice.success);
  return null;
}
