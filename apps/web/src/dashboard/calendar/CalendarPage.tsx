import { useState } from 'react';
import { addDays, type AppointmentStatus, type CalendarAppointment, type StaffMember } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { ErrorNote } from '../../components/ui';
import { formatDay, todayIn } from '../../lib/format';
import { useSession } from '../../lib/session';
import { AppointmentPanel } from './AppointmentCard';
import { DayView, type CalendarColumn } from './DayView';

export function CalendarPage() {
  const { business, plan } = useSession();
  const tz = business.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [selected, setSelected] = useState<CalendarAppointment>();
  const [actionError, setActionError] = useState<string>();

  const appointments = useApi<{ appointments: CalendarAppointment[] }>(`/appointments?from=${date}&to=${date}`);
  const staff = useApi<{ staff: StaffMember[] }>('/staff');

  const groomers = (staff.data?.staff ?? []).filter((s) => s.bookable);
  const columns: CalendarColumn[] = plan.groomerColumns
    ? groomers.map((g) => ({ id: g.id, name: g.name, color: g.color }))
    : [{ id: groomers[0]?.id ?? 'all', name: business.name, color: groomers[0]?.color ?? '#4f7cac' }];

  async function setStatus(appt: CalendarAppointment, status: AppointmentStatus) {
    setActionError(undefined);
    try {
      await api(`/appointments/${appt.id}/status`, { method: 'POST', json: { status } });
      setSelected(undefined);
      appointments.reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="calendar-page">
      <div className="calendar-toolbar">
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setDate(todayIn(tz))}>
            Today
          </button>
          <button type="button" className="btn btn-secondary" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            ‹
          </button>
          <button type="button" className="btn btn-secondary" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            ›
          </button>
        </div>
        <h1 className="calendar-title">{formatDay(date, 'long')}</h1>
      </div>

      <ErrorNote error={appointments.error ?? staff.error ?? actionError} />

      <DayView
        date={date}
        timeZone={tz}
        columns={columns}
        appointments={appointments.data?.appointments ?? []}
        onSelect={setSelected}
      />

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
