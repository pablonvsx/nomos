import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  Text,
  Divider,
  useTheme,
  IconButton,
  Chip,
  Portal,
  Modal,
} from 'react-native-paper';
import { useI18n } from '@/contexts/i18n-context';
import { BUTTON_RADIUS } from '@/constants/shape';
import type { GoogleAccount } from '@/core/google-auth/google-auth-service';

interface GoogleAccountSettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  account: GoogleAccount | null;
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const GoogleAccountSettingsModal: React.FC<GoogleAccountSettingsModalProps> = ({
  visible,
  onDismiss,
  account,
  isConnecting,
  error,
  onConnect,
  onDisconnect,
}) => {
  const theme = useTheme();
  const { t } = useI18n();

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
            {t('settings.googleAccountTitle')}
          </Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <Divider />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Description */}
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('settings.googleAccountModalDescription')}
          </Text>

          {/* Status */}
          <Text
            variant="labelSmall"
            style={[styles.sectionLabel, { color: theme.colors.primary }]}
          >
            {t('settings.connectionStatus').toUpperCase()}
          </Text>

          <Chip
            style={[
              styles.statusChip,
              {
                backgroundColor: account
                  ? (theme.dark ? 'rgba(76, 175, 80, 0.30)' : 'rgba(76, 175, 80, 0.15)')
                  : theme.colors.errorContainer,
              },
            ]}
            textStyle={{
              color: account
                ? (theme.dark ? '#a5d6a7' : '#2e7d32')
                : theme.colors.onErrorContainer,
            }}
          >
            {account ? t('settings.connected') : t('settings.notConnected')}
          </Chip>

          {account && (
            <Text
              variant="bodySmall"
              style={[styles.accountEmail, { color: theme.colors.onSurfaceVariant }]}
            >
              {t('settings.googleAccountConnectedDesc', { email: account.email })}
            </Text>
          )}

          {!account && error && (
            <Text
              variant="bodySmall"
              style={[styles.errorText, { color: theme.colors.error }]}
            >
              {error}
            </Text>
          )}

          <Divider style={styles.divider} />

          {/* Actions */}
          <Button
            mode={account ? 'outlined' : 'contained'}
            onPress={account ? onDisconnect : onConnect}
            loading={isConnecting}
            disabled={isConnecting}
            style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
            icon="google"
            textColor={account ? theme.colors.error : undefined}
          >
            {account ? t('settings.googleAccountDisconnect') : t('settings.googleAccountConnect')}
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
  },
  accountEmail: {
    marginTop: 8,
  },
  errorText: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 20,
  },
  button: {
    marginBottom: 4,
  },
});
