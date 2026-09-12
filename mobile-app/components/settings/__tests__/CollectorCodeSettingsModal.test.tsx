// COLLAB_MODEL_V2_REFERENCE.md section 11: the collector code must be
// exactly 4 characters - not optional, not 2-4. Proves the modal's save
// validation accepts exactly 4 and rejects 3 (and, symmetrically, would
// reject 5, but the field's maxLength={4} already makes typing a 5th
// character impossible, so 3-vs-4 is the meaningful boundary to test here).
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";

jest.mock("@/contexts/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, currentLanguage: "pt", setLanguage: jest.fn() }),
}));

const mockAlert = jest.fn();
jest.mock("@/hooks/use-dialog", () => ({
  useAlertDialog: () => ({ alert: mockAlert, confirm: jest.fn() }),
}));

const mockGetLocalCollectorCode = jest.fn();
const mockSetLocalCollectorCode = jest.fn();
jest.mock("@/core/local-identity/collector-code", () => ({
  getLocalCollectorCode: (...args: unknown[]) => mockGetLocalCollectorCode(...args),
  setLocalCollectorCode: (...args: unknown[]) => mockSetLocalCollectorCode(...args),
}));

import { CollectorCodeSettingsModal } from "../CollectorCodeSettingsModal";

describe("CollectorCodeSettingsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalCollectorCode.mockResolvedValue(null);
    mockSetLocalCollectorCode.mockResolvedValue(undefined);
  });

  it("accepts exactly 4 characters and saves them uppercased", async () => {
    const onSaved = jest.fn();

    await render(
      <PaperProvider>
        <CollectorCodeSettingsModal visible onDismiss={jest.fn()} onSaved={onSaved} />
      </PaperProvider>,
    );

    const input = await screen.findByTestId("text-input-outlined");
    fireEvent.changeText(input, "ps01");
    await waitFor(() => expect(input.props.value).toBe("PS01"));

    fireEvent.press(screen.getByText("settings.collectorCodeSave"));

    await waitFor(() => expect(mockSetLocalCollectorCode).toHaveBeenCalledWith("PS01"));
    expect(mockAlert).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("PS01");
  });

  it("rejects a 3-character code with a clear message, without saving", async () => {
    await render(
      <PaperProvider>
        <CollectorCodeSettingsModal visible onDismiss={jest.fn()} />
      </PaperProvider>,
    );

    const input = await screen.findByTestId("text-input-outlined");
    fireEvent.changeText(input, "abc");
    await waitFor(() => expect(input.props.value).toBe("ABC"));

    fireEvent.press(screen.getByText("settings.collectorCodeSave"));

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith("common.error", "settings.collectorCodeInvalid"),
    );
    expect(mockSetLocalCollectorCode).not.toHaveBeenCalled();
  });
});
