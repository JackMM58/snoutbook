import type { PlanId } from './types';

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  /** Texts included each calendar month before overage applies. */
  smsQuota: number;
  maxGroomers: number;
  maxVans: number;
  /** One calendar column per groomer, staff roles. */
  groomerColumns: boolean;
  reports: boolean;
  /** Service-area ZIPs, client address and gate notes, buffer minutes per van. */
  serviceArea: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: 'solo',
    name: 'Solo',
    monthlyPriceCents: 2900,
    smsQuota: 300,
    maxGroomers: 1,
    maxVans: 0,
    groomerColumns: false,
    reports: false,
    serviceArea: false,
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile',
    monthlyPriceCents: 5900,
    smsQuota: 600,
    maxGroomers: 2,
    maxVans: 2,
    groomerColumns: false,
    reports: false,
    serviceArea: true,
  },
  salon: {
    id: 'salon',
    name: 'Salon',
    monthlyPriceCents: 9900,
    smsQuota: 1000,
    maxGroomers: 8,
    maxVans: 0,
    groomerColumns: true,
    reports: true,
    serviceArea: false,
  },
};

export const SMS_OVERAGE_CENTS = 4;
export const TRIAL_DAYS = 14;

/** Annual billing is 12 months for the price of 10. */
export function annualPriceCents(plan: Plan): number {
  return plan.monthlyPriceCents * 10;
}
