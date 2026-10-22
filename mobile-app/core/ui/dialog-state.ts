/**
 * Pure state + ordering rules behind hooks/use-dialog.tsx's DialogProvider,
 * kept free of react/react-native so they run under the node jest setup.
 */

export interface DialogState<O> {
  visible: boolean;
  options: O | null;
}

export type DialogAction<O> =
  | { type: "show"; options: O }
  | { type: "hide" }
  | { type: "clearOptions" };

export function initialDialogState<O>(): DialogState<O> {
  return { visible: false, options: null };
}

export function dialogReducer<O>(state: DialogState<O>, action: DialogAction<O>): DialogState<O> {
  switch (action.type) {
    case "show":
      return { visible: true, options: action.options };
    case "hide":
      // Options stay while the dialog animates out, so its content doesn't blank.
      return { ...state, visible: false };
    case "clearOptions":
      // Delayed cleanup after hide(): a dialog shown in the meantime must survive it.
      return state.visible ? state : { visible: false, options: null };
  }
}

/**
 * A dialog button press: hide the dialog FIRST, then run the button's
 * callback. The callback may open the next dialog (an alert's OK leading to a
 * confirm); hiding after it would immediately close that follow-up.
 */
export function pressDialogButton(onPress: () => void, hide: () => void): void {
  hide();
  onPress();
}
