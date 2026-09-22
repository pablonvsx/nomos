import { describeRestoreError } from "../restore-error-messages";
import { UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

describe("describeRestoreError", () => {
  it("maps 'project already exists locally' to its specific key, without a technical detail", () => {
    expect(describeRestoreError(new Error("Este projeto já existe neste dispositivo."))).toEqual({
      key: "driveRestore.errorAlreadyExists",
    });
  });

  it("maps 'incomplete manifest' to its specific key, without a technical detail", () => {
    expect(describeRestoreError(new Error("manifest.json incompleto ou corrompido."))).toEqual({
      key: "driveRestore.errorIncompleteManifest",
    });
  });

  it("maps 'custom protocol not found' to its specific key, without a technical detail", () => {
    expect(
      describeRestoreError(new Error("Protocolo personalizado deste projeto não encontrado no Drive.")),
    ).toEqual({ key: "driveRestore.errorProtocolNotFound" });
  });

  it("maps UnsupportedPackageVersionError (instanceof, not string match) to its specific key, without a technical detail", () => {
    expect(describeRestoreError(new UnsupportedPackageVersionError())).toEqual({
      key: "driveRestore.errorUnsupportedFormatVersion",
    });
  });

  it("RED/GREEN: falls back to the generic key for any other error, but keeps the original message as technicalDetail instead of discarding it (audit finding IMPORTANTE 2)", () => {
    expect(describeRestoreError(new Error("Drive API error (500): oops"))).toEqual({
      key: "driveRestore.errorRestoring",
      technicalDetail: "Drive API error (500): oops",
    });
  });

  it("falls back to the generic key for a non-Error throw, technicalDetail is the stringified value", () => {
    expect(describeRestoreError("some string thrown directly")).toEqual({
      key: "driveRestore.errorRestoring",
      technicalDetail: "some string thrown directly",
    });
  });
});
