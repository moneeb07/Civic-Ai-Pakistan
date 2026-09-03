import { Redirect } from "expo-router";

import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";

/** The gate: wait for the session, then send the user to the right place. */
export default function Index() {
  const { me, loading } = useSession();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return <Redirect href={me ? "/home" : "/sign-in"} />;
}
