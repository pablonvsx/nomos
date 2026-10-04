import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Button, Text, Divider, useTheme, IconButton, Portal, Modal, HelperText } from "react-native-paper";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";
import type { GoogleAccount } from "@/core/google-auth/google-auth-service";

interface GoogleConnectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called once the account connects successfully, so a caller can resume
   * whatever action needed a connected account in the first place (section
   * 10.1) - used by projects.tsx and project-details/[id].tsx to
   * automatically retry the pending Drive action (activate backup, back up,
   * restore) once the account is connected. */
  onConnected?: (account: GoogleAccount) => void;
  /** Sign out before signing in so Android shows the account chooser instead of silently reusing the last account ("use another account" flow). */
  forceAccountChooser?: boolean;
}

export const GoogleConnectionModal: React.FC<GoogleConnectionModalProps> = ({
  visible,
  onDismiss,
  onConnected,
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
    if (connected) onConnected?.(connected);
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
                style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              >
                {t("googleAccount.connectedAs", { email: account.email })}
              </Text>
              <Button
                mode="outlined"
                onPress={disconnect}
                loading={isConnecting}
                disabled={isConnecting}
                style={[styles.actionButton, { borderRadius: BUTTON_RADIUS }]}
              >
                {t("googleAccount.disconnect")}
              </Button>
            </>
          ) : (
            <>
              <Text
                variant="bodyMedium"
                style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              >
                {t("googleAccount.connectExplanation")}
              </Text>
              <Button
                mode="contained"
                onPress={handleConnect}
                loading={isConnecting}
                disabled={isConnecting}
                style={[styles.actionButton, { borderRadius: BUTTON_RADIUS }]}
                icon="google"
              >
                {t("googleAccount.connect")}
              </Button>
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
    fontWeight: "600",
  },
  content: {
    padding: 16,
    paddingTop: 20,
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
