import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Divider, useTheme, IconButton, Portal, Modal, HelperText } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { useI18n } from "@/contexts/i18n-context";
import { ModalActions } from "@/components/ui/ModalActions";
import { makeEmailBreakable } from "@/core/ui/dialog-layout";
import type { GoogleAccount } from "@/core/google-auth/google-auth-service";

// Highlight for the connected e-mail. The app theme has no "success" color,
// so the green lives here, with a pair per color scheme.
const CONNECTED_GREEN = {
  lightBg: "#DFF3E4",
  lightFg: "#1B5E20",
  darkBg: "#1F3D26",
  darkFg: "#A5D6A7",
};

interface GoogleConnectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called once the account connects successfully, so a caller can resume
   * whatever action needed a connected account in the first place (section
   * 10.1) - used by projects.tsx and project-details/[id].tsx to
   * automatically retry the pending Drive action (activate backup, back up,
   * restore) once the account is connected. */
  onConnected?: (account: GoogleAccount) => void;
  /** Called after any connect or disconnect attempt finishes, so a caller that
   * shows the connection status can re-read it: this modal's useGoogleAccount()
   * state is its own, not the caller's. */
  onAccountChange?: () => void;
  /** Sign out before signing in so Android shows the account chooser instead of silently reusing the last account ("use another account" flow). */
  forceAccountChooser?: boolean;
}

export const GoogleConnectionModal: React.FC<GoogleConnectionModalProps> = ({
  visible,
  onDismiss,
  onConnected,
  onAccountChange,
  forceAccountChooser = false,
}) => {
  const theme = useTheme();
  const { t } = useI18n();
  const { account, isConnecting, error, unavailable, connect, disconnect, refresh } = useGoogleAccount();

  // Each useGoogleAccount() instance has its own state, so re-sync with the
  // native module whenever the modal opens (another screen may have changed
  // the connection since this one mounted).
  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  // onConnected fires from the sign-in itself (not from an account-state
  // effect), so opening the modal on an already-connected account or the
  // re-sync above can never be mistaken for a fresh connection.
  const handleConnect = async () => {
    const connected = await connect({ forceAccountChooser });
    onAccountChange?.();
    if (connected) onConnected?.(connected);
  };

  const handleDisconnect = async () => {
    await disconnect();
    onAccountChange?.();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        // Don't let a backdrop tap dismiss the modal mid sign-in: the result
        // would arrive with nobody listening for it.
        onDismiss={isConnecting ? undefined : onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("googleAccount.settingsItemTitle")}
          </Text>
          <IconButton icon="close" onPress={onDismiss} disabled={isConnecting} />
        </View>

        <Divider />

        <View style={styles.content}>
          {account ? (
            <>
              <Text
                variant="bodyMedium"
                style={[styles.connectedLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {t("googleAccount.connectedAs")}
              </Text>
              <View
                style={[
                  styles.emailChip,
                  { backgroundColor: theme.dark ? CONNECTED_GREEN.darkBg : CONNECTED_GREEN.lightBg },
                ]}
              >
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={18}
                  color={theme.dark ? CONNECTED_GREEN.darkFg : CONNECTED_GREEN.lightFg}
                />
                <Text
                  variant="bodyMedium"
                  selectable
                  style={[
                    styles.emailText,
                    { color: theme.dark ? CONNECTED_GREEN.darkFg : CONNECTED_GREEN.lightFg },
                  ]}
                >
                  {makeEmailBreakable(account.email)}
                </Text>
              </View>
              <ModalActions
                confirmLabel={t("googleAccount.disconnect")}
                onConfirm={handleDisconnect}
                loading={isConnecting}
                destructive
                style={styles.actionButton}
              />
            </>
          ) : (
            <>
              <Text
                variant="bodyMedium"
                style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              >
                {t("googleAccount.connectExplanation")}
              </Text>
              <ModalActions
                confirmLabel={t("googleAccount.connect")}
                onConfirm={handleConnect}
                loading={isConnecting}
                confirmIcon="google"
                style={styles.actionButton}
              />
            </>
          )}
          {error && (
            <HelperText type="error">
              {unavailable
                ? t("googleAccount.unavailable")
                : account
                  ? t("googleAccount.disconnectError")
                  : t("googleAccount.connectError")}
            </HelperText>
          )}
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
  },
  headerTitle: {
    flex: 1,
    ...MODAL_TITLE_STYLE,
  },
  content: {
    padding: 16,
    paddingTop: 20,
  },
  connectedLabel: {
    marginBottom: 8,
  },
  emailChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  emailText: {
    flexShrink: 1,
    fontWeight: "600",
  },
  description: {
    marginBottom: 20,
    lineHeight: 22,
    textAlign: "justify",
  },
  actionButton: {
    marginTop: 4,
  },
});
