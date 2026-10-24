/**
 * A .zip starts with "PK" followed by 0x03 0x04 (a local file header), 0x05 0x06
 * (an empty archive) or 0x07 0x08 (a spanned archive marker). Pure, so it runs
 * under plain Node and is the one place that decides "is this a zip".
 */
const SIGNATURES: ReadonlyArray<readonly [number, number]> = [
  [0x03, 0x04],
  [0x05, 0x06],
  [0x07, 0x08],
];

/** Bytes needed to tell. */
export const ZIP_SIGNATURE_LENGTH = 4;

export function hasZipSignature(bytes: ArrayLike<number>): boolean {
  if (bytes.length < ZIP_SIGNATURE_LENGTH) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false; // "PK"
  return SIGNATURES.some(([a, b]) => bytes[2] === a && bytes[3] === b);
}
