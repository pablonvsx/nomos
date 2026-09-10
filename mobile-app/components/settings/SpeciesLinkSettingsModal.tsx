import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';
import {
  Button,
  TextInput,
  Text,
  Divider,
  useTheme,
  IconButton,
  Chip,
  Portal,
  Modal,
  Surface,
  Dialog,
} from 'react-native-paper';
import { APIKeyManager } from '@/core/species-catalog/api-key-manager';
import {
  checkSpeciesLinkApiKeyValidity,
  SpeciesLinkApiKeyValidation,
} from '@/core/species-catalog/specieslink';
import { useI18n } from '@/contexts/i18n-context';
import { BUTTON_RADIUS } from '@/constants/shape';

interface SpeciesLinkSettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const SpeciesLinkSettingsModal: React.FC<SpeciesLinkSettingsModalProps> = ({
  visible,
  onDismiss,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [validating, setValidating] = useState(false);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null);

  const alert = (title: string, message: string) => setInfoDialog({ title, message });

  const invalidReasonMessage = (result: Extract<SpeciesLinkApiKeyValidation, { valid: false }>) => {
    switch (result.reason) {
      case 'invalid_key':
        return t('species.invalidOrExpiredKey');
      case 'rate_limited':
        return t('species.rateLimitExceeded');
      default:
        return t('species.searchError');
    }
  };

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const existingKey = await APIKeyManager.getSpeciesLinkApiKey();
        if (existingKey) {
          setApiKey(existingKey);
          setIsConfigured(true);
        }
      } catch (error) {
        console.error('Error loading SpeciesLink API key:', error);
      }
    };

    if (visible) {
      loadApiKey();
    }
  }, [visible]);

  const handleValidateApiKey = async () => {
    if (!apiKey.trim()) {
      alert(t('species.warning'), t('species.enterValidApiKey'));
      return;
    }

    try {
      setValidating(true);
      const result = await checkSpeciesLinkApiKeyValidity(apiKey.trim());

      if (result.valid) {
        alert(t('species.success'), t('species.apiKeyValidated'));
      } else {
        alert(t('species.warning'), invalidReasonMessage(result));
      }
    } finally {
      setValidating(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      alert(t('species.warning'), t('species.enterApiKey'));
      return;
    }

    try {
      setLoading(true);
      const result = await checkSpeciesLinkApiKeyValidity(apiKey.trim());

      if (!result.valid) {
        alert(t('species.warning'), invalidReasonMessage(result));
        return;
      }

      await APIKeyManager.setSpeciesLinkApiKey(apiKey.trim());
      setIsConfigured(true);
      alert(t('species.success'), t('species.apiKeySaved'));
    } catch {
      alert(t('species.warning'), t('species.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveApiKey = () => {
    setRemoveConfirmVisible(true);
  };

  const confirmRemoveApiKey = async () => {
    setRemoveConfirmVisible(false);
    try {
      setLoading(true);
      await APIKeyManager.removeSpeciesLinkApiKey();
      setApiKey('');
      setIsConfigured(false);
      alert(t('species.success'), t('species.apiKeyRemoved'));
    } catch {
      alert(t('species.warning'), t('species.removeKeyFailed'));
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
        {/* Header */}
        <View style={styles.header}>
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {t('species.speciesLinkIntegration')}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <Divider />

        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Description */}
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('species.speciesLinkDescription')}
          </Text>

          {/* Status */}
          <Text
            variant="labelSmall"
            style={[styles.sectionLabel, { color: theme.colors.primary }]}
          >
            {t('species.configStatus').toUpperCase()}
          </Text>

          <Chip
            style={[
              styles.statusChip,
              {
                backgroundColor: isConfigured
                  ? (theme.dark ? 'rgba(76, 175, 80, 0.30)' : 'rgba(76, 175, 80, 0.15)')
                  : theme.colors.errorContainer,
              },
            ]}
            textStyle={{
              color: isConfigured
                ? (theme.dark ? '#a5d6a7' : '#2e7d32')
                : theme.colors.onErrorContainer,
            }}
          >
            {isConfigured ? t('species.configured') : t('species.notConfigured')}
          </Chip>

          <Divider style={styles.divider} />

          {/* API Key Input */}
          <Text
            variant="labelSmall"
            style={[styles.sectionLabel, { color: theme.colors.primary }]}
          >
            {t('species.apiKeyTitle').toUpperCase()}
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              mode="outlined"
              label={t('species.pasteApiKey')}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!apiKey || apiKey.length === 0}
              editable={!loading && !validating}
              placeholder={t('species.apiKeyExample')}
              style={styles.inputFlex}
              right={
                apiKey ? (
                  <TextInput.Icon
                    icon="close-circle-outline"
                    onPress={() => setApiKey('')}
                  />
                ) : undefined
              }
            />

            {isConfigured && (
              <IconButton
                icon="delete-outline"
                iconColor={theme.colors.error}
                mode="outlined"
                onPress={handleRemoveApiKey}
                disabled={loading}
              />
            )}
          </View>

          <Text
            variant="bodySmall"
            style={[styles.securityNote, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('species.securityNote')}
          </Text>

          <Divider style={styles.divider} />

          {/* How to get key */}
          <Text
            variant="labelSmall"
            style={[styles.sectionLabel, { color: theme.colors.primary }]}
          >
            {t('species.howToGetApiKey').toUpperCase()}
          </Text>

          <Surface style={[styles.helpCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <Text
              variant="bodySmall"
              style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}
            >
              {'1. '}{t('species.apiKeyStep1')}{': '}
              <Text
                style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}
                onPress={() => Linking.openURL('https://specieslink.net/aut/profile/apikeys')}
              >
                specieslink.net/aut/profile/apikeys
              </Text>
              {'\n2. '}{t('species.apiKeyStep2')}
              {'\n3. '}{t('species.apiKeyStep3')}
              {'\n4. '}{t('species.apiKeyStep4')}
              {'\n5. '}{t('species.apiKeyStep5')}
              {'\n6. '}{t('species.apiKeyStep6')}
              {'\n7. '}{t('species.apiKeyStep7')}
            </Text>
          </Surface>

          <Divider style={styles.divider} />

          {/* Actions */}
          <View style={styles.buttonRow}>
            <Button
              mode="outlined"
              onPress={handleValidateApiKey}
              loading={validating}
              disabled={!apiKey.trim() || loading}
              style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
              icon="check-circle-outline"
            >
              {t('species.validateKey')}
            </Button>

            <Button
              mode="contained"
              onPress={handleSaveApiKey}
              loading={loading}
              disabled={!apiKey.trim() || validating}
              style={[styles.buttonHalf, { borderRadius: BUTTON_RADIUS }]}
              icon="content-save-outline"
            >
              {t('species.saveKey')}
            </Button>
          </View>
        </ScrollView>
      </Modal>

      <Dialog
        visible={removeConfirmVisible}
        onDismiss={() => setRemoveConfirmVisible(false)}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Dialog.Title style={{ color: theme.colors.onSurface }}>
          {t('species.confirmRemoval')}
        </Dialog.Title>
        <Dialog.Content>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t('species.confirmRemovalMessage')}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button mode="text" onPress={() => setRemoveConfirmVisible(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            mode="text"
            textColor={theme.colors.error}
            onPress={confirmRemoveApiKey}
          >
            {t('common.remove')}
          </Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog
        visible={infoDialog !== null}
        onDismiss={() => setInfoDialog(null)}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Dialog.Title style={{ color: theme.colors.onSurface }}>
          {infoDialog?.title}
        </Dialog.Title>
        <Dialog.Content>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {infoDialog?.message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button mode="text" onPress={() => setInfoDialog(null)}>
            OK
          </Button>
        </Dialog.Actions>
      </Dialog>
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
  contentContainer: {
    padding: 16,
    paddingTop: 20,
  },
  description: {
    marginBottom: 20,
    lineHeight: 22,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  divider: {
    marginVertical: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  inputFlex: {
    flex: 1,
  },
  securityNote: {
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'justify',
  },
  helpCard: {
    borderRadius: 8,
    padding: 12,
  },
  helpText: {
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  buttonHalf: {
    flex: 1,
  },
});
