import { guardPress, resolveModalActions } from "../modal-actions";

describe("resolveModalActions", () => {
  it("splits into two columns when there is a cancel action", () => {
    expect(resolveModalActions({ hasCancel: true })).toEqual({
      layout: "split",
      confirmBlocked: false,
      cancelBlocked: false,
    });
  });

  it("uses a single centered action without cancel", () => {
    expect(resolveModalActions({ hasCancel: false }).layout).toBe("single");
  });

  it("blocks only the confirm button when confirmDisabled", () => {
    const state = resolveModalActions({ hasCancel: true, confirmDisabled: true });
    expect(state.confirmBlocked).toBe(true);
    expect(state.cancelBlocked).toBe(false);
  });

  it("blocks both buttons while loading", () => {
    const state = resolveModalActions({ hasCancel: true, loading: true });
    expect(state.confirmBlocked).toBe(true);
    expect(state.cancelBlocked).toBe(true);
  });
});

describe("guardPress", () => {
  it("calls the handler when not blocked", () => {
    const handler = jest.fn();
    guardPress(handler, false)();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores presses when blocked", () => {
    const handler = jest.fn();
    guardPress(handler, true)();
    expect(handler).not.toHaveBeenCalled();
  });
});
