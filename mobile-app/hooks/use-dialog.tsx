import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Portal, Dialog, Button, Text, useTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { dialogReducer, initialDialogState, pressDialogButton } from "@/core/ui/dialog-state";

interface DialogButton {
  label: string;
  onPress: () => void;
  mode?: "text" | "outlined" | "contained" | "contained-tonal";
  style?: "default" | "destructive";
}

interface DialogOptions {
  title: string;
  message: string;
  buttons?: DialogButton[];
  dismissable?: boolean;
}

interface DialogContextType {
  showDialog: (options: DialogOptions) => void;
  hideDialog: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [{ visible, options }, dispatch] = useReducer(
    dialogReducer<DialogOptions>,
    initialDialogState<DialogOptions>(),
  );
  const clearOptionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Memoized: this context is consumed app-wide (useAlertDialog/useDialog),
  // and an unstable showDialog/hideDialog identity used to propagate into
  // every screen's useCallback/useFocusEffect deps, causing unrelated
  // re-renders (and, on screens like "Meu Nomos", a visible double
  // load/flicker on every focus) whenever DialogProvider itself re-rendered.
  const showDialog = useCallback((dialogOptions: DialogOptions) => {
    // Prevent a pending close animation cleanup from wiping a new dialog.
    if (clearOptionsTimeoutRef.current) {
      clearTimeout(clearOptionsTimeoutRef.current);
      clearOptionsTimeoutRef.current = null;
    }
    dispatch({ type: "show", options: dialogOptions });
  }, []);

  const hideDialog = useCallback(() => {
    if (clearOptionsTimeoutRef.current) {
      clearTimeout(clearOptionsTimeoutRef.current);
      clearOptionsTimeoutRef.current = null;
    }
    dispatch({ type: "hide" });
    clearOptionsTimeoutRef.current = setTimeout(() => {
      dispatch({ type: "clearOptions" });
      clearOptionsTimeoutRef.current = null;
    }, 300); // Wait for animation
  }, []);

  const handleButtonPress = (onPress: () => void) => {
    // Hide first, then the callback (see pressDialogButton): the callback may
    // open the next dialog, which hiding afterwards would immediately close.
    pressDialogButton(onPress, hideDialog);
  };

  const contextValue = useMemo(
    () => ({ showDialog, hideDialog }),
    [showDialog, hideDialog],
  );

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      <Portal>
        <Dialog
          visible={visible}
          onDismiss={options?.dismissable !== false ? hideDialog : undefined}
          style={{ backgroundColor: theme.colors.surface }}
        >
          {options?.title && (
            <Dialog.Title
              style={{
                color: theme.colors.onSurface,
                textAlign: "justify",
                fontSize: 19,
              }}
            >
              {options.title}
            </Dialog.Title>
          )}
          {options?.message && (
            <Dialog.Content>
              <Text
                variant="bodyMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "justify",
                }}
              >
                {options.message}
              </Text>
            </Dialog.Content>
          )}
          <Dialog.Actions>
            {options?.buttons && options.buttons.length > 0 ? (
              options.buttons.map((button, index) => (
                <Button
                  key={index}
                  mode={button.mode || "text"}
                  onPress={() => handleButtonPress(button.onPress)}
                  textColor={
                    button.style === "destructive"
                      ? theme.colors.error
                      : undefined
                  }
                >
                  {button.label}
                </Button>
              ))
            ) : (
              <Button mode="text" onPress={hideDialog}>
                OK
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </DialogContext.Provider>
  );
}

/**
 * Where a dialog can be shown from - Paper renders every <Portal> (Modal,
 * Dialog...) outside the app tree, as a sibling of the root DialogProvider's
 * own Portal, and stacks them in mount order:
 *
 * - A component rendered INSIDE a <Portal> that calls useAlertDialog() throws
 *   (no provider above it): wrap its content in a nested <DialogProvider>
 *   (see modules/generic/RepeatableGroupField.tsx).
 * - A screen/component that calls the hook in its own body but opens Portal
 *   dialogs it must show alerts over: export it through withDialogScope().
 *   The scoped provider's Portal mounts after the component's own, so the
 *   alert lands on top instead of behind.
 * - A Portal mounted later than the scoped provider (conditionally rendered
 *   modals) still stacks above it, and a dialog opened while a modal is
 *   closing is hidden by it: close the modal first, wait, then show
 *   (core/ui/close-then-show.ts).
 */
export function withDialogScope<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  function DialogScoped(props: P) {
    return (
      <DialogProvider>
        <Component {...props} />
      </DialogProvider>
    );
  }
  DialogScoped.displayName = `withDialogScope(${Component.displayName ?? Component.name ?? "Component"})`;
  return DialogScoped;
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

// Helper functions for common dialog patterns
export function useAlertDialog() {
  const { showDialog } = useDialog();
  const { t } = useI18n();

  const withFallback = (value: string | undefined, fallback: string) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  };

  const alert = useCallback(
    (title: string, message: string, onOk?: () => void) => {
      const safeTitle = withFallback(title, "Information");
      const safeMessage = withFallback(message, "Operation completed.");
      showDialog({
        title: safeTitle,
        message: safeMessage,
        buttons: [
          {
            label: "OK",
            onPress: onOk || (() => {}),
            mode: "text",
          },
        ],
      });
    },
    [showDialog],
  );

  const confirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      onCancel?: () => void,
      confirmLabel?: string,
      cancelLabel?: string,
      isDestructive: boolean = false,
    ) => {
      const safeTitle = withFallback(title, "Confirmation");
      const safeMessage = withFallback(message, "Do you want to continue?");
      const safeConfirmLabel = withFallback(confirmLabel, t("common.confirm"));
      const safeCancelLabel = withFallback(cancelLabel, t("common.cancel"));

      showDialog({
        title: safeTitle,
        message: safeMessage,
        buttons: [
          {
            label: safeCancelLabel,
            onPress: onCancel || (() => {}),
            mode: "text",
          },
          {
            label: safeConfirmLabel,
            onPress: onConfirm,
            mode: "text",
            style: isDestructive ? "destructive" : "default",
          },
        ],
        dismissable: false,
      });
    },
    [showDialog, t],
  );

  return useMemo(() => ({ alert, confirm }), [alert, confirm]);
}
