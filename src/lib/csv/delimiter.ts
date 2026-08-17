export const DELIMITER_CANDIDATES = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITER_CANDIDATES)[number];

/**
 * Counts a character in one line, ignoring anything inside double quotes.
 *
 * Quote-awareness is the whole point: `"Schmidt, Anna";"Berlin"` contains two
 * commas and one semicolon, and a naive count picks the comma — splitting the
 * name in half and shifting every column after it. That failure is silent,
 * which makes it worse than a crash.
 */
function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];

    if (c === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not a
      // delimiter boundary.
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && c === char) count += 1;
  }

  return count;
}

/**
 * Guesses the field delimiter from the first lines of a file.
 *
 * Scores each candidate on *consistency* rather than raw frequency: a real
 * delimiter appears the same number of times in every row, because every row
 * has the same number of columns. A comma that happens to appear inside some
 * addresses does not.
 *
 * Papaparse has its own auto-detection, but it leans towards the comma and
 * mis-reads the `;`-delimited files that Excel produces on a German locale —
 * exactly the case that matters most here.
 */
export function detectDelimiter(sample: string, fallback: Delimiter = ","): Delimiter {
  const lines = sample
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 20);

  if (lines.length === 0) return fallback;

  let best: { delimiter: Delimiter; score: number } | null = null;

  for (const delimiter of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const first = counts[0] ?? 0;

    // Absent from the header row: it is not the delimiter.
    if (first === 0) continue;

    const consistent = counts.every((count) => count === first);
    const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    const variance = counts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / counts.length;

    // Perfect consistency dominates; frequency only breaks ties. Dividing by
    // variance lets a slightly ragged file still pick a sensible winner.
    const score = (consistent ? 1000 : 0) + mean - variance;

    if (!best || score > best.score) best = { delimiter, score };
  }

  return best?.delimiter ?? fallback;
}
