import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/*
 * Registration is now the multi-step flow at /register (identity -> contact ->
 * security -> address -> photo -> review). This route is kept so existing links
 * and bookmarks still land in the right place.
 */
export default function SignUpPage() {
  redirect("/register");
}
