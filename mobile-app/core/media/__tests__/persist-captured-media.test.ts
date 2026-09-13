// PhotoInput.tsx/AudioNotesInput.tsx used to store the raw cache/temp uri
// returned by expo-image-picker/expo-audio directly - the OS is free to
// reclaim that file at any time, silently losing the point's media by the
// time it's later exported/backed up (see core/project-sharing/export-points.ts's
// missingMedia counting). persistCapturedMedia copies it into Paths.document
// (persistent storage) right at capture time instead.
jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn(() => "uuid-mock") }));

const files = new Map<string, string>();

class FakeFile {
  readonly uri: string;

  constructor(...parts: Array<string | { uri: string }>) {
    this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  copy(destination: { uri: string }): void {
    const content = files.get(this.uri);
    if (content === undefined) {
      throw new Error(`FakeFile: source does not exist: ${this.uri}`);
    }
    files.set(destination.uri, content);
  }
}

jest.mock("expo-file-system", () => ({
  File: FakeFile,
  Paths: { document: "mock-document" },
}));

import { persistCapturedMedia } from "../persist-captured-media";

describe("persistCapturedMedia", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    files.clear();
  });

  it("copies the source file into Paths.document with a uuid-based name, preserving the extension", () => {
    files.set("file://cache/photo123.jpg", "PHOTO_BYTES");

    const result = persistCapturedMedia("file://cache/photo123.jpg", "photo");

    expect(result).toBe("mock-document/photo_uuid-mock.jpg");
    expect(files.get(result)).toBe("PHOTO_BYTES");
  });

  it("omits the extension when the source uri has none", () => {
    files.set("file://cache/noext", "AUDIO_BYTES");

    const result = persistCapturedMedia("file://cache/noext", "audio");

    expect(result).toBe("mock-document/audio_uuid-mock");
    expect(files.get(result)).toBe("AUDIO_BYTES");
  });

  it("falls back to the original uri and logs when the copy fails", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = persistCapturedMedia("file://cache/does-not-exist.jpg", "photo");

    expect(result).toBe("file://cache/does-not-exist.jpg");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error persisting captured media to permanent storage:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
