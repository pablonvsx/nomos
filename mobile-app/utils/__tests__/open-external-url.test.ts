import { PROJECT_PAGE_URL } from "../../constants/links";
import { openExternalUrl } from "../open-external-url";

describe("PROJECT_PAGE_URL", () => {
  it("points to the project's GitHub Pages site", () => {
    expect(PROJECT_PAGE_URL).toBe("https://pablonvsx.github.io/nomos/");
  });
});

describe("openExternalUrl", () => {
  it("calls the opener with the given URL and reports success", async () => {
    const openURL = jest.fn().mockResolvedValue(undefined);

    await expect(openExternalUrl(PROJECT_PAGE_URL, openURL)).resolves.toBe(true);

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(PROJECT_PAGE_URL);
  });

  it("reports failure instead of throwing when the opener rejects", async () => {
    const openURL = jest.fn().mockRejectedValue(new Error("No Activity found to handle Intent"));

    await expect(openExternalUrl(PROJECT_PAGE_URL, openURL)).resolves.toBe(false);
  });

  it("reports failure when the opener throws synchronously", async () => {
    const openURL = jest.fn(() => {
      throw new Error("boom");
    });

    await expect(openExternalUrl(PROJECT_PAGE_URL, openURL)).resolves.toBe(false);
  });
});
