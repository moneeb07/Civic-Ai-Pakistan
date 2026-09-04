import * as React from "react";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";
import { colors } from "@/theme";

/*
 * The signed-in shell: a bottom tab bar.
 *
 * Before this, every screen was pushed onto a stack and the only way back was
 * the header arrow, which made messages and notifications feel like dead ends
 * you had to remember to go and find. Tabs make the app's four places visible
 * at all times, which is what a phone user expects and what the citizen web
 * dashboard already does with its own bottom nav.
 *
 * The tab SET does not change between citizen and officer mode. That is
 * deliberate: mode is a view preference, not a permission, and a tab bar that
 * rearranged itself under someone when they flicked the switch would make the
 * app feel like it had swapped out beneath them. What each tab CONTAINS
 * changes; where it lives does not.
 *
 * This layout is also the auth boundary — one check here, rather than repeated
 * in every screen inside it.
 */
export default function TabsLayout() {
  const { me, loading } = useSession();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  // Signed out: back to the landing page, not the bare sign-in form.
  if (!me) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.civic600,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          // A comfortable thumb target on cheap Android handsets, matching the
          // 56px minimum the web app's bottom nav uses.
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "My reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/*
        The officer notification inbox is not a tab: it is officer-only, and a
        fifth tab that is empty for most citizens costs every citizen a thumb
        target. It stays reachable from the officer home screen, which is the
        only place it is relevant — and where the web puts it too (a bell in
        the gov header, not the citizen nav).
      */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
