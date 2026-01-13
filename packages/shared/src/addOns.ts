import { formatCents } from './money';
import type { AddOnKey } from './types';

export interface AddOnDefinition {
  key: AddOnKey;
  label: string;
  defaultPriceCents: number;
  minPriceCents?: number;
  maxPriceCents?: number;
}

// Every business gets this list; they set their own prices and switch items off.
// Add-ons go on the bill at checkout.
export const ADD_ON_CATALOG: readonly AddOnDefinition[] = [
  { key: 'de_shed', label: 'De-shed treatment', defaultPriceCents: 2000 },
  { key: 'nail_grind', label: 'Nail grind', defaultPriceCents: 1200 },
  { key: 'teeth_brushing', label: 'Teeth brushing', defaultPriceCents: 1000 },
  { key: 'flea_bath', label: 'Flea bath', defaultPriceCents: 1800 },
  { key: 'matting_fee', label: 'Matting fee', defaultPriceCents: 2500, minPriceCents: 1500, maxPriceCents: 4000 },
];

export function addOnDefinition(key: AddOnKey): AddOnDefinition {
  const def = ADD_ON_CATALOG.find((item) => item.key === key);
  if (!def) throw new Error(`Unknown add-on: ${key}`);
  return def;
}

export function addOnPriceError(key: AddOnKey, priceCents: number): string | null {
  const def = addOnDefinition(key);
  if (!Number.isInteger(priceCents) || priceCents < 0) return 'Enter a price in whole cents';
  if (def.minPriceCents != null && priceCents < def.minPriceCents) {
    return `${def.label} must be at least ${formatCents(def.minPriceCents)}`;
  }
  if (def.maxPriceCents != null && priceCents > def.maxPriceCents) {
    return `${def.label} can be at most ${formatCents(def.maxPriceCents)}`;
  }
  return null;
}
