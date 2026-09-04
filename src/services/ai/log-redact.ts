/*
 * Turning a model request into something safe to write down.
 *
 * Deliberately free of "server-only" and of any Node import, so the rules that
 * decide what reaches disk can be tested directly — the same split as
 * env-schema.ts beside env.ts. This is the half worth testing: a mistake here
 * writes a citizen's CNIC photograph into a log file, and that is not the kind
 * of bug anyone wants to find by reading the output afterwards.
 */

/*
 * One very long prompt or a runaway response should not be able to produce a
 * gigabyte log file. Truncation is marked so a shortened entry can never be
 * mistaken for the whole thing.
 */
export const MAX_TEXT = 20_000;

export function clip(value: string): string {
  if (value.length <= MAX_TEXT) return value;
  return `${value.slice(0, MAX_TEXT)}\n…[truncated ${value.length - MAX_TEXT} more characters]`;
}

/** A part of a request, reduced to something safe and readable. */
export type LoggedPart =
  | { kind: "text"; text: string }
  | { kind: "binary"; mimeType: string; bytes: number };

/**
 * Flattens a request's message parts into text and binary summaries.
 *
 * Binary parts are reduced to their type and size and NEVER carry their data.
 * A CNIC photograph is several megabytes of base64; writing it out would bury
 * the prompt it belongs to, and it is the single most sensitive thing passing
 * through here.
 *
 * The shape varies by provider and by call — a bare part, an array of parts,
 * `{ role, parts }` (Gemini's shape, kept so old log lines still parse), or
 * OpenAI's `{ role, content: [{ type: "text" | "image_url", … }] }` — so this
 * walks whatever it is given rather than assuming one of them.
 */
export function summariseContents(contents: unknown): LoggedPart[] {
  const out: LoggedPart[] = [];

  const visitPart = (part: unknown) => {
    if (!part || typeof part !== "object") return;
    const record = part as Record<string, unknown>;

    if (typeof record.text === "string") {
      out.push({ kind: "text", text: clip(record.text) });
      return;
    }

    /*
     * OpenAI sends images as a data: URL inside image_url. Only its size and
     * declared type are kept — the base64 payload is a photograph of somebody's
     * identity card and must never reach a log file.
     */
    const imageUrl = record.image_url as Record<string, unknown> | undefined;
    if (imageUrl && typeof imageUrl.url === "string") {
      const url = imageUrl.url;
      const comma = url.indexOf(",");
      const isDataUrl = url.startsWith("data:") && comma > 0;
      out.push({
        kind: "binary",
        mimeType: isDataUrl ? url.slice(5, url.indexOf(";")) || "unknown" : "url",
        bytes: isDataUrl ? Math.round(((url.length - comma - 1) * 3) / 4) : 0,
      });
      return;
    }

    // Gemini's shape, kept so previously written log lines still parse.
    const inline = record.inlineData as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === "string") {
      out.push({
        kind: "binary",
        mimeType: typeof inline.mimeType === "string" ? inline.mimeType : "unknown",
        // base64 is 4 characters per 3 bytes; close enough to report a size.
        bytes: Math.round((inline.data.length * 3) / 4),
      });
    }
  };

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (Array.isArray(record.parts)) {
      record.parts.forEach(visitPart);
      return;
    }
    if (Array.isArray(record.content)) {
      record.content.forEach(visitPart);
      return;
    }
    // A message whose content is a plain string, as OpenAI allows.
    if (typeof record.content === "string") {
      out.push({ kind: "text", text: clip(record.content) });
      return;
    }
    visitPart(node);
  };

  visit(contents);
  return out;
}
