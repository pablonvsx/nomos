import {
  dialogReducer,
  initialDialogState,
  pressDialogButton,
  type DialogState,
} from "../dialog-state";

type Options = { title: string };

function apply(state: DialogState<Options>, ...actions: Parameters<typeof dialogReducer<Options>>[1][]) {
  return actions.reduce((acc, action) => dialogReducer(acc, action), state);
}

describe("dialogReducer", () => {
  it("show makes the dialog visible with its options", () => {
    const state = apply(initialDialogState<Options>(), { type: "show", options: { title: "A" } });
    expect(state).toEqual({ visible: true, options: { title: "A" } });
  });

  it("hide keeps the options so the content doesn't blank while animating out", () => {
    const state = apply(
      initialDialogState<Options>(),
      { type: "show", options: { title: "A" } },
      { type: "hide" },
    );
    expect(state).toEqual({ visible: false, options: { title: "A" } });
  });

  it("clearOptions after a hide drops the options", () => {
    const state = apply(
      initialDialogState<Options>(),
      { type: "show", options: { title: "A" } },
      { type: "hide" },
      { type: "clearOptions" },
    );
    expect(state).toEqual({ visible: false, options: null });
  });

  it("a stale clearOptions does not wipe a dialog shown in the meantime", () => {
    const state = apply(
      initialDialogState<Options>(),
      { type: "show", options: { title: "A" } },
      { type: "hide" },
      { type: "show", options: { title: "B" } },
      { type: "clearOptions" },
    );
    expect(state).toEqual({ visible: true, options: { title: "B" } });
  });
});

describe("pressDialogButton", () => {
  it("hides first, then runs the button callback", () => {
    const calls: string[] = [];
    pressDialogButton(
      () => calls.push("onPress"),
      () => calls.push("hide"),
    );
    expect(calls).toEqual(["hide", "onPress"]);
  });

  it("lets a button open the next dialog (alert OK -> confirm): the follow-up stays visible", () => {
    let state = apply(initialDialogState<Options>(), { type: "show", options: { title: "alert" } });
    const dispatch = (action: Parameters<typeof dialogReducer<Options>>[1]) => {
      state = dialogReducer(state, action);
    };

    pressDialogButton(
      () => dispatch({ type: "show", options: { title: "confirm" } }),
      () => dispatch({ type: "hide" }),
    );

    expect(state).toEqual({ visible: true, options: { title: "confirm" } });
  });

  it("documents the old order: showing before hiding closes the follow-up dialog", () => {
    let state = apply(initialDialogState<Options>(), { type: "show", options: { title: "alert" } });
    const dispatch = (action: Parameters<typeof dialogReducer<Options>>[1]) => {
      state = dialogReducer(state, action);
    };

    // old order: onPress() then hide()
    dispatch({ type: "show", options: { title: "confirm" } });
    dispatch({ type: "hide" });

    expect(state.visible).toBe(false);
  });

  it("a button that does not open anything leaves the dialog hidden", () => {
    let state = apply(initialDialogState<Options>(), { type: "show", options: { title: "alert" } });
    pressDialogButton(
      () => {},
      () => {
        state = dialogReducer(state, { type: "hide" });
      },
    );
    expect(state.visible).toBe(false);
  });
});
