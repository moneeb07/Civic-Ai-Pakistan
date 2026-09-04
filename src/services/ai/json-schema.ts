/*
 * Making a JSON Schema acceptable to a provider's STRICT mode.
 *
 * Strict structured outputs are not merely a stronger version of "please
 * return JSON" — they impose rules the schema itself must satisfy before the
 * request is even considered:
 *
 *   - every object must carry "additionalProperties": false
 *   - every property must be listed in "required"
 *
 * A schema that breaks either is rejected with a 400 before the model sees the
 * image, which is how a working OpenAI key produced "We couldn't check this
 * picture" on a perfectly good photograph of a CNIC. The schemas in this app
 * were written against providers that enforce nothing, so several of them were
 * shaped for a world with no such rules.
 *
 * Rather than rewrite each schema by hand and hope the next one remembers, the
 * gate normalises whatever it is given. That keeps the RULE in one place: a
 * service describes the shape it wants, and adapting that description to what
 * a particular provider demands is the client's job, exactly as choosing
 * between json_schema, json_object and a prompt already is.
 *
 * WHY "REQUIRED EVERYWHERE" IS SAFE HERE
 * Listing every property as required sounds like it would change meaning, and
 * under other rules it would. Under strict mode it does not: optionality is
 * expressed by admitting null in the TYPE ("type": ["string", "null"]), not by
 * omission, and the model may still answer null for anything so declared. What
 * this removes is the model's licence to leave a field out entirely — which
 * was never wanted. The CNIC validator learned that the hard way and had
 * already forced one such field back into "required" by hand; this generalises
 * that fix rather than repeating it.
 *
 * Pure, free of "server-only", and separated from client.ts so it can be
 * tested directly — the same split as chains.ts beside model.ts.
 */

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a copy of `schema` that satisfies strict structured outputs.
 *
 * The input is never mutated: schemas are module-level constants in the
 * services, and quietly rewriting one would change what every LATER request
 * sends — including requests to providers that never asked for any of this.
 */
export function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (!isPlainObject(schema)) return schema;

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] = strictify(value);
  }

  /*
   * Only nodes that actually describe an object are touched. A node may
   * declare its type as ["object", "null"] to be nullable, which is still an
   * object for this purpose — hence the array check rather than an equality.
   */
  const type = out.type;
  const declaresObject =
    type === "object" || (Array.isArray(type) && type.includes("object"));

  if (declaresObject && isPlainObject(out.properties)) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }

  return out;
}
