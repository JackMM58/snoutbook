import { zonedParts, type CalendarAppointment } from '@snoutbook/shared';
import { AppointmentCard } from './AppointmentCard';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const PX_PER_MINUTE = 1;

export interface CalendarColumn {
  id: string;
  name: string;
  color: string;
}

interface Props {
  date: string;
  timeZone: string;
  columns: CalendarColumn[];
  appointments: CalendarAppointment[];
  onSelect: (appt: CalendarAppointment) => void;
}

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60 * PX_PER_MINUTE;

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

function placement(appt: CalendarAppointment, timeZone: string): { top: number; height: number } {
  const start = zonedParts(new Date(appt.startsAt), timeZone).minuteOfDay;
  const duration = (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) / 60_000;
  const top = Math.max(0, (start - DAY_START_HOUR * 60) * PX_PER_MINUTE);
  return { top, height: Math.max(20, Math.min(duration * PX_PER_MINUTE, GRID_HEIGHT - top)) };
}

export function DayView({ date: _date, timeZone, columns, appointments, onSelect }: Props) {
  const single = columns.length === 1;

  return (
    <div className="calendar-scroll">
      <div className="calendar-grid" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(9rem, 1fr))` }}>
        <div className="calendar-corner" />
        {columns.map((col) => (
          <div key={col.id} className="calendar-column-head">
            <span className="swatch" style={{ background: col.color }} />
            {col.name}
          </div>
        ))}

        <div className="time-gutter" style={{ height: GRID_HEIGHT }}>
          {HOURS.map((h) => (
            <span key={h} style={{ top: (h - DAY_START_HOUR) * 60 * PX_PER_MINUTE }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
        {columns.map((col) => (
          <div key={col.id} className="calendar-column" style={{ height: GRID_HEIGHT }}>
            {appointments
              .filter((a) => single || a.groomerId === col.id)
              .map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  timeZone={timeZone}
                  color={col.color}
                  style={{ ...placement(appt, timeZone), left: 0, width: '100%' }}
                  draggable={false}
                  onSelect={() => onSelect(appt)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
