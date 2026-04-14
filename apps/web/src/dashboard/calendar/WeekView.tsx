import { useState } from 'react';
import { addDays, zonedParts, type CalendarAppointment } from '@snoutbook/shared';
import { formatDay } from '../../lib/format';
import { AppointmentCard } from './AppointmentCard';
import { GRID_HEIGHT, lanes, placement, TimeGutter, type CalendarColumn } from './DayView';
import { useDragMove, type MoveHandler } from './useDragMove';

interface Props {
  from: string;
  timeZone: string;
  groomers: CalendarColumn[];
  appointments: CalendarAppointment[];
  onMove: MoveHandler;
  onSelect: (appt: CalendarAppointment) => void;
}

export function WeekView({ from, timeZone, groomers, appointments, onMove, onSelect }: Props) {
  const [groomerFilter, setGroomerFilter] = useState('all');
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const visible = appointments.filter((a) => groomerFilter === 'all' || a.groomerId === groomerFilter);
  const { cardProps, columnProps } = useDragMove(visible, timeZone, onMove);
  const colorOf = (groomerId: string) => groomers.find((g) => g.id === groomerId)?.color ?? '#4f7cac';

  return (
    <>
      {groomers.length > 1 && (
        <label className="week-filter">
          <span className="field-label">Showing</span>
          <select value={groomerFilter} onChange={(e) => setGroomerFilter(e.target.value)}>
            <option value="all">All groomers</option>
            {groomers.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="calendar-scroll">
        <div className="calendar-grid" style={{ gridTemplateColumns: '3.5rem repeat(7, minmax(7.5rem, 1fr))' }}>
          <div className="calendar-corner" />
          {days.map((d) => (
            <div key={d} className="calendar-column-head">
              {formatDay(d)}
            </div>
          ))}

          <TimeGutter />
          {days.map((d) => {
            const mine = visible.filter((a) => zonedParts(new Date(a.startsAt), timeZone).date === d);
            const layout = lanes(mine);
            return (
              <div key={d} className="calendar-column" style={{ height: GRID_HEIGHT }} {...columnProps(d, d, null)}>
                {mine.map((appt) => {
                  const { top, height } = placement(appt, timeZone);
                  const { lane, of } = layout.get(appt.id) ?? { lane: 0, of: 1 };
                  return (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      timeZone={timeZone}
                      color={colorOf(appt.groomerId)}
                      compact
                      style={{ top, height, left: `${(lane / of) * 100}%`, width: `${100 / of}%` }}
                      onSelect={() => onSelect(appt)}
                      {...cardProps(appt)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
