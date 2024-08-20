import { localDateString } from './time';
import type { VaccineRecord, VaccineType } from './types';

export const VACCINE_LABELS: Record<VaccineType, string> = {
  rabies: 'Rabies',
  dhpp: 'DHPP',
  bordetella: 'Bordetella',
};

export const VACCINE_TYPES = Object.keys(VACCINE_LABELS) as VaccineType[];

/** A record is good through the end of its expiry date. */
export function isExpired(record: Pick<VaccineRecord, 'expiresOn'>, today: Date = new Date()): boolean {
  return record.expiresOn < localDateString(today);
}
