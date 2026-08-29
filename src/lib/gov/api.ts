import { NextResponse } from "next/server";

import { getOfficer, type OfficerContext } from "./session";

/*
 * The government API's response envelope, in one place.
 *
 * Identical in shape to the citizen side's ({ success, data } /
 * { success, message, reason }) so a single client-side unwrap works against
 * both, and so nothing about a gov route surprises someone who has read the
 * citizen routes.
 *
 * `reason` is a stable machine code the UI branches on; `message` is the
 * sentence a person reads. Neither ever carries a stack trace.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(message: string, status: number, reason?: string) {
  return NextResponse.json({ success: false, message, reason }, { status });
}

export const unauthorized = () => fail("Please sign in.", 401, "unauthenticated");

/**
 * The single "you can't see this" answer.
 *
 * 404 rather than 403, everywhere, matching the citizen side: a 403 confirms
 * the row exists, which tells an officer that a complaint id belongs to some
 * other department. Not found and not yours are indistinguishable from
 * outside on purpose.
 */
export const notFound = (message = "Not found.") => fail(message, 404, "not_found");

export const badRequest = (message: string, reason = "invalid") => fail(message, 400, reason);

/** Zod rejected the body. Nothing is written; 422 per the ticket's validation rule. */
export const unprocessable = (message: string, reason = "validation_failed") =>
  fail(message, 422, reason);

/** Parses a JSON body, returning null when the request isn't readable JSON at all. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Wraps a handler with the officer guard so no route re-implements it.
 *
 * A signed-in citizen with no officer record gets the same 401 as someone
 * with no session: having a CivicAI account is not government access.
 */
export function withOfficer(
  handler: (context: OfficerContext, request: Request) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    const context = await getOfficer();
    if (!context) return unauthorized();
    return handler(context, request);
  };
}
