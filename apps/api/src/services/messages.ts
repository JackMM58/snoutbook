
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
