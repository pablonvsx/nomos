/**
 * Pure rules for components/ui/ModalActions.tsx, kept free of react-native so
 * they run under the node jest setup.
 */

export interface ModalActionsInput {
  hasCancel: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  loading?: boolean;
}

export interface ModalActionsState {
  /** "split": two equal columns. "single": the confirm button centered at full width. */
  layout: "split" | "single";
  confirmBlocked: boolean;
  cancelBlocked: boolean;
}

export function resolveModalActions(input: ModalActionsInput): ModalActionsState {
  const loading = input.loading === true;
  return {
    layout: input.hasCancel ? "split" : "single",
    // While loading both buttons are blocked, which also prevents a double tap.
    confirmBlocked: loading || input.confirmDisabled === true,
    cancelBlocked: loading || input.cancelDisabled === true,
  };
}

/** Wraps a press handler so it is a no-op while its button is blocked. */
export function guardPress(handler: () => void, blocked: boolean): () => void {
  return () => {
    if (!blocked) handler();
  };
}
