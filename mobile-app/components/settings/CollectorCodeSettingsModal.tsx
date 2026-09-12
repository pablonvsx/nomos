import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  TextInput,
  Text,
  Divider,
  useTheme,
  IconButton,
  Portal,
  Modal,
} from 'react-native-paper';
import { getLocalCollectorCode, setLocalCollectorCode } from '@/core/local-identity/collector-code';
import { useI18n } from '@/contexts/i18n-context';
import { useAlertDialog } from '@/hooks/use-dialog';
import { BUTTON_RADIUS } from '@/constants/shape';

interface CollectorCodeSettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSaved?: (code: string) => void;
}

export const CollectorCodeSettingsModal: React.FC<CollectorCodeSettingsModalProps> = ({
  visible,
  onDismiss,
  onSaved,
}) => {
  const theme = useTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadCode = async () => {
      try {
        const existing = await getLocalCollectorCode();
        setCode(existing ?? '');
      } catch (error) {
        console.error('Error loading local collector code:', error);
      }
    };

    if (visible) {
      loadCode();
    }
  }, [visible]);

  const handleSave = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 4) {
      alert(t('common.error'), t('settings.collectorCodeInvalid'));
      return;
    }

    try {
      setLoading(true);
      await setLocalCollectorCode(trimmed);
      onSaved?.(trimmed.toUpperCase());
      onDismiss();
    } catch (error) {
      console.error('Error saving local collector code:', error);
      alert(t('common.error'), t('settings.collectorCodeSaveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t('settings.collectorCodeTitle')}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <Divider />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('settings.collectorCodeDescription')}
          </Text>

          <TextInput
            mode="outlined"
            label={t('settings.collectorCodeLabel')}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            maxLength={4}
            autoCapitalize="characters"
            editable={!loading}
          />

          <Button
            mode="contained"
            onPress={handleSave}
            loading={loading}
            disabled={!code.trim()}
            style={[styles.saveButton, { borderRadius: BUTTON_RADIUS }]}
            icon="content-save-outline"
          >
            {t('settings.collectorCodeSave')}
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: 16,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontWeight: '600',
  },
  content: {
    maxHeight: '80%',
  },
  contentContainer: {
    padding: 16,
    paddingTop: 20,
  },
  description: {
    marginBottom: 16,
    lineHeight: 22,
  },
  saveButton: {
    marginTop: 16,
  },
});
