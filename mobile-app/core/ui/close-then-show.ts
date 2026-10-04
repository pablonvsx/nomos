/**
 * "Close, wait, then show" for dialogs that follow a modal.
 *
 * Paper stacks Portals in mount order, so a dialog shown while a Paper
 * Modal/Dialog is still on screen (or still fading out) renders behind it.
 * Callers close the modal first, wait for its exit animation, and only then
 * show the dialog. Kept free of react-native/react imports so it runs under
 * the node jest setup; the real `wait` lives in wait-for-modal-close.ts.
 */

export interface CloseThenShowOptions {
  close: () => void;
  show: () => void;
  /** Resolves once the modal's exit animation is over. */
  wait: () => Promise<void>;
}

export async function closeModalThenShow({ close, show, wait }: CloseThenShowOptions): Promise<void> {
  close();
  await wait();
  show();
}

export interface RunThenCloseAndShowOptions<T> {
  run: () => Promise<T>;
  close: () => void;
  showOnSuccess: (result: T) => void;
  /** Called instead of closing when `run` fails; the modal stays open so the person can read the error. */
  onError: (error: unknown) => void;
  wait: () => Promise<void>;
}

export async function runThenCloseAndShow<T>({
  run,
  close,
  showOnSuccess,
  onError,
  wait,
}: RunThenCloseAndShowOptions<T>): Promise<void> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    onError(error);
    return;
  }
  // Outside the try on purpose: a failure while closing/showing is a UI
  // problem, not a failed operation, and must not be reported as one.
  await closeModalThenShow({ close, wait, show: () => showOnSuccess(result) });
}
