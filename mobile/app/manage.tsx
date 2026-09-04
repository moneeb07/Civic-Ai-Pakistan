import * as React from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { DepartmentOption, OrganizationSummary, PendingInvite } from "@/api/types";
import { useSession } from "@/context/session";
import { Button, Empty, ErrorNote, Field, Loading, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The administrative chain, on a phone.
 *
 * Each tier creates the tier below it and invites the person who will run it:
 *
 *   platform admin -> creates an ORGANISATION, invites its org head
 *   org head       -> creates a DEPARTMENT,   invites its dept head
 *   dept head      -> invites MEMBERS into their own department
 *   member         -> creates nobody
 *
 * Which half of that a given officer sees is decided by their role, and every
 * endpoint behind these forms re-checks it server-side — the role check here
 * only avoids showing somebody a form that would be refused. Accounts are
 * never created directly: an invitation is issued, and the recipient sets
 * their own password when they redeem it.
 */
export default function ManageScreen() {
  const { me } = useSession();
  const officer = me?.officer.available ? me.officer : null;
  const role = officer?.role;
  const orgId = officer?.orgId ?? null;

  const orgs = useQuery<OrganizationSummary[]>(
    role === "platform_admin" ? "/api/gov/organizations" : null,
  );
  const depts = useQuery<DepartmentOption[]>(
    role === "org_head" && orgId ? `/api/gov/departments?orgId=${encodeURIComponent(orgId)}` : null,
  );
  const invites = useQuery<PendingInvite[]>(officer ? "/api/gov/invites" : null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Create-organisation form (platform admin only).
  const [orgName, setOrgName] = React.useState("");
  const [orgCode, setOrgCode] = React.useState("");

  // Create-department form (org head only).
  const [deptName, setDeptName] = React.useState("");

  // Invite form — the role invited is implied by who is inviting.
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteOrgId, setInviteOrgId] = React.useState<string | null>(null);

  if (!officer) {
    return (
      <Screen>
        <Empty
          title="Not an authority account"
          detail="This area is for officers issued an account by their authority."
        />
      </Screen>
    );
  }

  /** Who this officer is allowed to invite — mirrors canInvite() server-side. */
  const invitableRole =
    role === "platform_admin" ? "org_head" : role === "org_head" ? "dept_head" : role === "dept_head" ? "member" : null;

  async function createOrganization() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/gov/organizations", {
        method: "POST",
        body: { name: orgName.trim(), code: orgCode.trim().toUpperCase() },
      });
      setOrgName("");
      setOrgCode("");
      orgs.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function createDepartment() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      /*
       * Categories are left empty here deliberately. The web offers the full
       * checkbox list, but a department with none is a valid, documented
       * state ("may be empty until decided"), and picking ten checkboxes on a
       * phone to create a department is worse than setting them later on a
       * larger screen.
       */
      await api("/api/gov/departments", {
        method: "POST",
        body: { orgId, name: deptName.trim(), handlesCategories: [] },
      });
      setDeptName("");
      depts.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    if (!invitableRole) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/gov/invites", {
        method: "POST",
        body: {
          email: inviteEmail.trim().toLowerCase(),
          role: invitableRole,
          // A platform admin must say WHICH organisation; everyone else is
          // scoped to their own, so the server infers it.
          orgId: role === "platform_admin" ? inviteOrgId : orgId,
          deptId: role === "dept_head" ? officer!.deptId : null,
        },
      });
      setInviteEmail("");
      setInviteOrgId(null);
      invites.refresh();
      Alert.alert("Invitation created", "They can redeem it with the token from the server log.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  function confirmRevoke(invite: PendingInvite) {
    Alert.alert("Revoke this invitation?", `${invite.email} will no longer be able to use it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => void revoke(invite.id) },
    ]);
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/gov/invites/${id}`, { method: "DELETE" });
      invites.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const canInviteWithoutOrgPick = role !== "platform_admin" || inviteOrgId !== null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={invites.loading}
            onRefresh={() => {
              invites.refresh();
              orgs.refresh();
              depts.refresh();
            }}
          />
        }
      >
        <Text style={styles.title}>Manage</Text>
        <Text style={styles.subtitle}>
          {role === "platform_admin"
            ? "Create organisations and invite the people who will run them."
            : role === "org_head"
              ? "Create departments and invite their heads."
              : role === "dept_head"
                ? "Invite members into your department."
                : "Your account cannot issue invitations."}
        </Text>

        {error ? <ErrorNote message={error} /> : null}

        {/* -- Platform admin: organisations -------------------------------- */}
        {role === "platform_admin" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>NEW ORGANISATION</Text>
            <Field label="Name" value={orgName} onChangeText={setOrgName} placeholder="Capital Development Authority" />
            <Field
              label="Code"
              value={orgCode}
              /* Uppercased as typed: it appears in invitations and must be typeable. */
              onChangeText={(value) => setOrgCode(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="CDA"
            />
            <Button
              label="Create organisation"
              busy={busy}
              disabled={orgName.trim().length < 2 || orgCode.trim().length < 2}
              onPress={createOrganization}
            />

            {(orgs.data ?? []).length > 0 ? (
              <View style={styles.list}>
                {(orgs.data ?? []).map((org) => (
                  <View key={org.id} style={styles.listRow}>
                    <Ionicons name="business-outline" size={16} color={colors.civic700} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{org.name}</Text>
                      <Text style={styles.listHint}>{org.code}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* -- Org head: departments ---------------------------------------- */}
        {role === "org_head" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>NEW DEPARTMENT</Text>
            <Field label="Name" value={deptName} onChangeText={setDeptName} placeholder="Road & Infrastructure" />
            <Button
              label="Create department"
              busy={busy}
              disabled={deptName.trim().length < 2}
              onPress={createDepartment}
            />

            {(depts.data ?? []).length > 0 ? (
              <View style={styles.list}>
                {(depts.data ?? []).map((dept) => (
                  <View key={dept.id} style={styles.listRow}>
                    <Ionicons name="git-branch-outline" size={16} color={colors.civic700} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{dept.name}</Text>
                      {dept.hasWorkflow === false ? (
                        <Text style={styles.warn}>Workflow not set up yet</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* -- Invitations --------------------------------------------------- */}
        {invitableRole ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              INVITE A {invitableRole.replace("_", " ").toUpperCase()}
            </Text>
            <Field
              label="Email"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="name@authority.gov.pk"
            />

            {/* A platform admin invites into a specific organisation. */}
            {role === "platform_admin" ? (
              <>
                <Text style={styles.fieldLabel}>Organisation</Text>
                {(orgs.data ?? []).map((org) => (
                  <Pressable
                    key={org.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: inviteOrgId === org.id }}
                    onPress={() => setInviteOrgId(org.id)}
                    style={[styles.pickRow, inviteOrgId === org.id && styles.pickRowActive]}
                  >
                    <Ionicons
                      name={inviteOrgId === org.id ? "radio-button-on" : "radio-button-off"}
                      size={16}
                      color={inviteOrgId === org.id ? colors.civic600 : colors.muted}
                    />
                    <Text style={styles.listName}>{org.name}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Send invitation"
                busy={busy}
                disabled={!inviteEmail.includes("@") || !canInviteWithoutOrgPick}
                onPress={sendInvite}
              />
            </View>
          </View>
        ) : null}

        {/* -- Pending invitations ------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PENDING INVITATIONS</Text>
          {invites.loading && !invites.data ? <Loading /> : null}
          {(invites.data ?? []).length === 0 && !invites.loading ? (
            <Text style={styles.listHint}>None outstanding.</Text>
          ) : null}
          {(invites.data ?? []).map((invite) => (
            <View key={invite.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>{invite.email}</Text>
                <View style={styles.pillRow}>
                  <Pill text={invite.role.replace("_", " ")} tone="civic" />
                  {invite.deptName ? <Pill text={invite.deptName} /> : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Revoke invitation for ${invite.email}`}
                onPress={() => confirmRevoke(invite)}
                hitSlop={8}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 14, lineHeight: 20, color: colors.muted },
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.ink, marginBottom: 4 },
  list: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  listName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  listHint: { fontSize: 12, color: colors.muted, marginTop: 1 },
  warn: { fontSize: 11, color: colors.amber700, marginTop: 1 },
  pillRow: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pickRowActive: { opacity: 1 },
});
