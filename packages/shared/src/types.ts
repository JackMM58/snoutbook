// Wire types shared by the API and the web app. Timestamps are ISO strings,
// calendar dates are 'YYYY-MM-DD', money is integer cents.

export type PlanId = 'solo' | 'mobile' | 'salon';

export type Size = 'S' | 'M' | 'L' | 'XL';
export type SizeTable<T> = Record<Size, T>;

export type StaffRole = 'owner' | 'manager' | 'groomer';

export const APPOINTMENT_STATUSES = ['booked', 'checked_in', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type AppointmentSource = 'online' | 'dashboard';

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  timezone: string;
  phone: string | null;
}

export interface BusinessSettings {
  name: string;
  phone: string | null;
  timezone: string;
  depositCents: number | null;
  rebookAfterWeeks: number | null;
  stripeConnected: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  color: string;
  bookable: boolean;
  sortOrder: number;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  smsOptOut: boolean;
}

export interface Pet {
  id: string;
  clientId: string;
  name: string;
  breed: string | null;
  weightLbs: number | null;
  temperamentNotes: string | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  pricesCents: SizeTable<number>;
  durationsMinutes: SizeTable<number>;
  active: boolean;
}

export interface Appointment {
  id: string;
  clientId: string;
  petId: string;
  serviceId: string;
  groomerId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  size: Size;
  quotedPriceCents: number;
  source: AppointmentSource;
  notes: string | null;
}

export interface CalendarAppointment extends Appointment {
  clientName: string;
  petName: string;
  serviceName: string;
}

export interface AvailabilitySlot {
  startsAt: string;
  groomerId: string;
}

export interface SmsUsageSummary {
  month: string;
  sent: number;
  quota: number;
  overage: number;
  overageCents: number;
}
