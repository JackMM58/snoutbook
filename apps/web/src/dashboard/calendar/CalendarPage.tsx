import { useState } from 'react';
import { addDays, weekdayOf, type AppointmentStatus, type CalendarAppointment, type StaffMember } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { ErrorNote } from '../../components/ui';
import { formatDay, todayIn } from '../../lib/format';
import { useSession } from '../../lib/session';
import { AppointmentPanel } from './AppointmentCard';
import { DayView, type CalendarColumn } from './DayView';
import { WeekView } from './WeekView';

type View = 'day' | 'week';

function weekStart(date: string): string {
  // Weeks start on Monday.
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export function CalendarPage() {
  const { business, plan } = useSession();
  const tz = business.timezone;
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(() => todayIn(tz));
  const [selected, setSelected] = useState<CalendarAppointment>();
  const [actionError, setActionError] = useState<string>();

  const from = view === 'day' ? date : weekStart(date);
  const to = view === 'day' ? date : addDays(from, 6);
  const appointments = useApi<{ appointments: CalendarAppointment[] }>(`/appointments?from=${from}&to=${to}`);
  const staff = useApi<{ staff: StaffMember[] }>('/staff');

  const groomers = (staff.data?.staff ?? []).filter((s) => s.bookable);
  const columns: CalendarColumn[] =
    plan.groomerColumns || groomers.length > 1
      ? groomers.map((g) => ({ id: g.id, name: g.name, color: g.color }))
      : [{ id: groomers[0]?.id ?? 'all', name: business.name, color: groomers[0]?.color ?? '#4f7cac' }];

  async function run(action: () => Promise<unknown>) {
    setActionError(undefined);
    try {
      await action();
      appointments.reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const move = (appt: CalendarAppointment, startsAt: string, groomerId: string) =>
    run(() => api(`/appointments/${appt.id}`, { method: 'PATCH', json: { startsAt, groomerId } }));

  const setStatus = (appt: CalendarAppointment, status: AppointmentStatus) =>
    run(async () => {
      await api(`/appointments/${appt.id}/status`, { method: 'POST', json: { status } });
      setSelected(undefined);
    });

  const step = view === 'day' ? 1 : 7;
  const title =
    view === 'day' ? formatDay(date, 'long') : `${formatDay(from)} – ${formatDay(to)}`;

  return (
    <div className="calendar-page">
      <div className="calendar-toolbar">
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setDate(todayIn(tz))}>
            Today
          </button>
          <button type="button" className="btn btn-secondary" aria-label="Previous" onClick={() => setDate(addDays(date, -step))}>
            ‹
          </button>
          <button type="button" className="btn btn-secondary" aria-label="Next" onClick={() => setDate(addDays(date, step))}>
            ›
          </button>
        </div>
        <h1 className="calendar-title">{title}</h1>
        <div className="segmented-control" role="tablist">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {v === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote error={appointments.error ?? staff.error ?? actionError} />

      {view === 'day' ? (
        <DayView
          date={date}
          timeZone={tz}
          columns={columns}
          appointments={appointments.data?.appointments ?? []}
          onMove={move}
          onSelect={setSelected}
        />
      ) : (
        <WeekView
          from={from}
          timeZone={tz}
          groomers={columns}
          appointments={appointments.data?.appointments ?? []}
          onMove={move}
          onSelect={setSelected}
        />
      )}

      {selected && (
        <AppointmentPanel
          appointment={selected}
          timeZone={tz}
          groomerName={groomers.find((g) => g.id === selected.groomerId)?.name}
          onStatus={(status) => setStatus(selected, status)}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
