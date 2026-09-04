import { Redirect } from "expo-router";

import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";

/*
 * The gate: wait for the session, then send the user to the right place.
 *
 * Signed out now goes to the landing page rather than straight to a password
 * field. A first-time visitor needs to know what CivicAI is, that reporting is
 * free, and that authority staff have their own way in — the sign-in form
 * answers none of that.
 */
export default function Index() {
  const { me, loading } = useSession();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return <Redirect href={me ? "/home" : "/welcome"} />;
}
