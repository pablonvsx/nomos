import React, { useEffect, useRef } from "react";
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
}

export const GoogleConnectionModal: React.FC<GoogleConnectionModalProps> = ({
  visible,
  onDismiss,
  onConnected,
}) => {
  const theme = useTheme();
  const { t } = useI18n();
  const { account, isConnecting, error, unavailable, connect, disconnect } = useGoogleAccount();
  const previousAccount = useRef<GoogleAccount | null>(null);

  useEffect(() => {
    if (account && !previousAccount.current) {
      onConnected?.(account);
    }
    previousAccount.current = account;
  }, [account, onConnected]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("googleAccount.settingsItemTitle")}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
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
                onPress={connect}
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
