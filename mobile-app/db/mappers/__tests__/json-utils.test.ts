import { parsePhotoUris } from "../json-utils";

describe("parsePhotoUris", () => {
  it("extracts uris from a JSON string of {uri,timestamp}[] (PhotoInput's current format)", () => {
    const raw = JSON.stringify([
      { uri: "file:///a.jpg", timestamp: 1000 },
      { uri: "file:///b.jpg", timestamp: 2000 },
    ]);
    expect(parsePhotoUris(raw)).toEqual(["file:///a.jpg", "file:///b.jpg"]);
  });

  it("extracts uris from a JSON string of string[] (legacy format)", () => {
    const raw = JSON.stringify(["file:///a.jpg", "file:///b.jpg"]);
    expect(parsePhotoUris(raw)).toEqual(["file:///a.jpg", "file:///b.jpg"]);
  });

  it("accepts an already-deserialized array (not just a JSON string)", () => {
    expect(parsePhotoUris([{ uri: "file:///a.jpg" }, "file:///b.jpg"])).toEqual([
      "file:///a.jpg",
      "file:///b.jpg",
    ]);
  });

  it("mixes string and object items in the same array", () => {
    const raw = JSON.stringify(["file:///a.jpg", { uri: "file:///b.jpg", timestamp: 1 }]);
    expect(parsePhotoUris(raw)).toEqual(["file:///a.jpg", "file:///b.jpg"]);
  });

  it("filters out items without a valid uri (object without uri, empty string, non-string uri)", () => {
    const raw = JSON.stringify([{ timestamp: 1 }, "", { uri: 123 }, { uri: "file:///ok.jpg" }]);
    expect(parsePhotoUris(raw)).toEqual(["file:///ok.jpg"]);
  });

  it("returns [] for null, undefined, empty string and invalid JSON", () => {
    expect(parsePhotoUris(null)).toEqual([]);
    expect(parsePhotoUris(undefined)).toEqual([]);
    expect(parsePhotoUris("")).toEqual([]);
    expect(parsePhotoUris("not json")).toEqual([]);
  });

  it("returns [] when the JSON deserializes to something that isn't an array", () => {
    expect(parsePhotoUris(JSON.stringify({ uri: "file:///a.jpg" }))).toEqual([]);
  });
});
