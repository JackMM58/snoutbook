import type { Service, Size, SizeTable } from './types';

export const SIZES: readonly Size[] = ['S', 'M', 'L', 'XL'];

export const SIZE_LABELS: SizeTable<string> = {
  S: 'Small (under 20 lb)',
  M: 'Medium (20–49 lb)',
  L: 'Large (50–89 lb)',
  XL: 'X-Large (90 lb and up)',
};

export function sizeForWeight(weightLbs: number | null | undefined): Size {
  // Unknown weight quotes as medium; the groomer corrects it at check-in.
  if (weightLbs == null || !Number.isFinite(weightLbs) || weightLbs <= 0) return 'M';
  if (weightLbs < 20) return 'S';
  if (weightLbs < 50) return 'M';
  if (weightLbs < 90) return 'L';
  return 'XL';
}

export function servicePrice(service: Pick<Service, 'pricesCents'>, size: Size): number {
  return service.pricesCents[size];
}

export function serviceDuration(service: Pick<Service, 'durationsMinutes'>, size: Size): number {
  return service.durationsMinutes[size];
}

export function priceRange(service: Pick<Service, 'pricesCents'>): { minCents: number; maxCents: number } {
  const prices = SIZES.map((size) => service.pricesCents[size]);
  return { minCents: Math.min(...prices), maxCents: Math.max(...prices) };
}
