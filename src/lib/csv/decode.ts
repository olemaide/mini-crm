export type DetectedEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

/**
 * Decodes an uploaded CSV to text, guessing the encoding.
 *
 * This is not academic. Excel on a German Windows machine exports CSV as
 * Windows-1252, and "Save as CSV UTF-8" prepends a byte-order mark. Decode
 * either as plain UTF-8 and you get `Ã¼` where `ü` should be, or a BOM glued to
 * the first column name so the header never matches. Half of a DACH customer's
 * files would fail at step one.
 *
 * The trick is `fatal: true`: a strict UTF-8 decoder throws on byte sequences
 * that are not valid UTF-8, and Windows-1252 text almost always contains some.
 * That makes the fallback a real test rather than a guess.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): {
  text: string;
  encoding: DetectedEncoding;
} {
  const bytes = new Uint8Array(buffer);

  // Byte-order marks are unambiguous — trust them and strip them, because a
  // leftover BOM becomes an invisible character in the first header cell.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "utf-8-bom",
    };
  }

  // Excel's "Unicode Text" export is UTF-16LE and tab-separated.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    // Not valid UTF-8. Windows-1252 is the overwhelmingly likely alternative
    // for a European spreadsheet export, and it can decode any byte sequence,
    // so this cannot fail in turn.
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
    };
  }
}
