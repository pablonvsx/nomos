import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { MODAL_PADDING_H, MODAL_PADDING_TOP, MODAL_TITLE_GAP } from "@/constants/modal-layout";
import { MODAL_RADIUS } from "@/constants/shape";
import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  TextInput,
  Text,
  useTheme,
  IconButton,
  Portal,
  Modal,
  HelperText,
} from "react-native-paper";
import { getLocalCollectorCode, setLocalCollectorCode } from "@/core/local-identity/collector-code";
import { useI18n } from "@/contexts/i18n-context";
import { ModalActions } from "@/components/ui/ModalActions";

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
        </View>

        {/* The footer owns the space around its button, and sits outside the padded content. */}
        <ModalActions
          confirmLabel={t("collectorCode.save")}
          onConfirm={handleSave}
          loading={saving}
          confirmDisabled={!code.trim()}
          confirmIcon="content-save-outline"
        />
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: MODAL_RADIUS,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    // The close button is 52dp tall, so 12 above puts the title 24 from the top, as in the dialogs.
    paddingTop: MODAL_PADDING_TOP - 12,
    paddingLeft: MODAL_PADDING_H,
    paddingRight: MODAL_PADDING_H - 12,
  },
  headerTitle: {
    flex: 1,
    ...MODAL_TITLE_STYLE,
  },
  content: {
    paddingHorizontal: MODAL_PADDING_H,
    paddingTop: MODAL_TITLE_GAP,
  },
  description: {
    marginBottom: 16,
    lineHeight: 22,
    textAlign: "justify",
  },
});
