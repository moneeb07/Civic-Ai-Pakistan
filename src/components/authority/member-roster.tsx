import { categoryLabel } from "@/lib/authority/schema";
import type { MemberSummary } from "@/lib/authority/queries";

/*
 * The department roster.
 *
 * Flat on purpose. Everyone here is a member — there is no ordering by rank,
 * no titles and no reporting line, because none of that would change what any
 * of them can do. The Member ID is an identifier for finding and mentioning
 * someone, not a grade.
 */
export function MemberRoster({
  members,
  categories,
}: {
  members: MemberSummary[];
  categories?: string[];
}) {
  return (
    <div className="rounded-[18px] border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          Members{" "}
          <span className="font-normal text-muted">({members.length})</span>
        </h2>
        {categories && categories.length > 0 ? (
          <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
            Receives: {categories.map((c) => categoryLabel(c)).join(", ")}
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-line">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5"
          >
            <span className="text-[0.875rem] font-medium text-ink">
              {member.displayName}
            </span>
            <span className="font-mono text-[0.75rem] text-muted">
              {member.memberCode}
            </span>
          </li>
        ))}
        {members.length === 0 ? (
          <li className="px-4 py-6 text-center text-[0.875rem] text-muted">
            No members yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
