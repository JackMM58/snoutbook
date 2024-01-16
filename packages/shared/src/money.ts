const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Parses "$25", "25.5", "25.50" into cents. Returns null for anything else. */
export function parseDollars(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
