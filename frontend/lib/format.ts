// Formatting helpers for numeric display.

const MINUS = "−"; // true minus, not hyphen

export function formatPct(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatSignedDelta(value: number, digits = 1): string {
  if (value >= 0) return `+${(value * 100).toFixed(digits)}%`;
  return `${MINUS}${(Math.abs(value) * 100).toFixed(digits)}%`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}
