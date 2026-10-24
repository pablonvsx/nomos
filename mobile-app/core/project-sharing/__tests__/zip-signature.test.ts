import { hasZipSignature } from "../zip-signature";

const bytes = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

describe("hasZipSignature", () => {
  it("accepts the three signatures a real .zip can start with", () => {
    expect(hasZipSignature([0x50, 0x4b, 0x03, 0x04])).toBe(true); // a normal archive
    expect(hasZipSignature([0x50, 0x4b, 0x05, 0x06])).toBe(true); // an empty archive
    expect(hasZipSignature([0x50, 0x4b, 0x07, 0x08])).toBe(true); // spanned
  });

  it("rejects a JSON file, which is what closed the app", () => {
    expect(hasZipSignature(bytes('{"project_uuid":"x"}'))).toBe(false);
    expect(hasZipSignature(bytes("[1,2,3]"))).toBe(false);
  });

  it("rejects other common files and anything too short to tell", () => {
    expect(hasZipSignature(bytes("%PDF-1.7"))).toBe(false);
    expect(hasZipSignature([0xff, 0xd8, 0xff, 0xe0])).toBe(false); // jpeg
    expect(hasZipSignature(bytes("PK"))).toBe(false);
    expect(hasZipSignature([])).toBe(false);
  });

  it("rejects 'PK' followed by something that is not a zip header", () => {
    expect(hasZipSignature(bytes("PKab"))).toBe(false);
  });
});
