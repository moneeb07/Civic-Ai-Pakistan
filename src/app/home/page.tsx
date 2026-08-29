import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Superseded by /dashboard. Kept so older links keep working. */
export default function HomePage() {
  redirect("/dashboard");
}
