// Formatting helpers for the numeric display primitive.

const MINUS = "−"; // true minus, not hyphen

export function formatSignedDelta(value: number, digits = 3): string {
  if (value >= 0) return `+${value.toFixed(digits)}`;
  return `${MINUS}${Math.abs(value).toFixed(digits)}`;
}

export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatGameDate(iso: string): string {
  // "2026-05-11T18:20:44Z" → "2026-05-11"
  return iso.slice(0, 10);
}

// Class-name combiner that tolerates undefined/false/null inputs.
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
