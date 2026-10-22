import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  Button,
  TextInput,
  Text,
  Divider,
  useTheme,
  IconButton,
  Portal,
  Modal,
  HelperText,
} from "react-native-paper";
import { getLocalCollectorCode, setLocalCollectorCode } from "@/core/local-identity/collector-code";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

interface CollectorCodeModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called after a successful save, in addition to closing the modal. */
  onSaved?: (code: string) => void;
}

export const CollectorCodeModal: React.FC<CollectorCodeModalProps> = ({
  visible,
  onDismiss,
  onSaved,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    getLocalCollectorCode().then((existing) => setCode(existing ?? ""));
  }, [visible]);

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);
      const normalized = code.trim().toUpperCase();
      await setLocalCollectorCode(normalized);
      onSaved?.(normalized);
      onDismiss();
    } catch {
      setError(t("collectorCode.invalidLength"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t("collectorCode.modalTitle")}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <Divider />

        <View style={styles.content}>
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
          >
            {t("collectorCode.description")}
          </Text>

          <TextInput
            mode="outlined"
            label={t("collectorCode.inputLabel")}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            maxLength={4}
            autoCapitalize="characters"
            editable={!saving}
          />
          {error && <HelperText type="error">{error}</HelperText>}

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={!code.trim()}
            style={[styles.saveButton, { borderRadius: BUTTON_RADIUS }]}
            icon="content-save-outline"
          >
            {t("collectorCode.save")}
          </Button>
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
  saveButton: {
    marginTop: 16,
  },
});
