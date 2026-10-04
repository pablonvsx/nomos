// Paper's Modal exit animation lasts 220 ms (DEFAULT_DURATION in
// react-native-paper's Modal.tsx). A fixed delay is used instead of
// InteractionManager.runAfterInteractions because that animation runs on the
// native driver, which RN does not register as an interaction, so
// runAfterInteractions would not wait for it. Same 300 ms used elsewhere
// (hooks/use-dialog.tsx, app/(tabs)/settings.tsx).
export const MODAL_CLOSE_DELAY_MS = 300;

export function waitForModalClose(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MODAL_CLOSE_DELAY_MS));
}
