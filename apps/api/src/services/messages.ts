import { formatCents } from '@snoutbook/shared';

export function formatVisitTime(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(startsAt);
}

function formatClockTime(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(startsAt);
}

export interface ReminderContext {
  businessName: string;
  businessPhone: string | null;
  clientFirstName: string;
  petName: string;
  serviceName: string;
  groomerName: string;
  startsAt: Date;
  timeZone: string;
  offsetHours: number;
}

function when(ctx: ReminderContext): string {
  return ctx.offsetHours <= 2
    ? `today at ${formatClockTime(ctx.startsAt, ctx.timeZone)}`
    : formatVisitTime(ctx.startsAt, ctx.timeZone);
}

export function appointmentReminderSms(ctx: ReminderContext): string {
  const change = ctx.businessPhone ? ` Need to change it? Call ${ctx.businessPhone}.` : '';
  return `${ctx.businessName}: ${ctx.petName}'s ${ctx.serviceName} is ${when(ctx)} with ${ctx.groomerName}.${change} Reply STOP to opt out.`;
}

export function appointmentReminderEmail(ctx: ReminderContext): { subject: string; textBody: string } {
  const change = ctx.businessPhone
    ? `If you need to change or cancel, please call us at ${ctx.businessPhone}.`
    : 'If you need to change or cancel, please get in touch with us.';
  return {
    subject: `Reminder: ${ctx.petName}'s appointment ${when(ctx)}`,
    textBody: [
      `Hi ${ctx.clientFirstName},`,
      '',
      `This is a reminder that ${ctx.petName} is booked for a ${ctx.serviceName} with ${ctx.groomerName} ${when(ctx)}.`,
      '',
      change,
      '',
      `See you soon,`,
      ctx.businessName,
    ].join('\n'),
  };
}

export interface RebookContext {
  businessName: string;
  clientFirstName: string;
  petName: string;
  weeks: number;
  bookingUrl: string;
}

export function rebookReminderSms(ctx: RebookContext): string {
  return `${ctx.businessName}: It's been ${ctx.weeks} weeks since ${ctx.petName}'s last groom. Book the next one: ${ctx.bookingUrl} Reply STOP to opt out.`;
}

export function rebookReminderEmail(ctx: RebookContext): { subject: string; textBody: string } {
  return {
    subject: `Time for ${ctx.petName}'s next groom?`,
    textBody: [
      `Hi ${ctx.clientFirstName},`,
      '',
      `It's been ${ctx.weeks} weeks since ${ctx.petName}'s last visit. You can book the next one here:`,
      ctx.bookingUrl,
      '',
      ctx.businessName,
    ].join('\n'),
  };
}

export function paymentLinkSms(businessName: string, amountCents: number, url: string): string {
  return `${businessName}: Your total today is ${formatCents(amountCents)}. Pay here: ${url}`;
}
