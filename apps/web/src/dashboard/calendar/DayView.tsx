import { zonedParts, type CalendarAppointment } from '@snoutbook/shared';
import { AppointmentCard } from './AppointmentCard';
import { DAY_END_HOUR, DAY_START_HOUR, PX_PER_MINUTE, useDragMove, type MoveHandler } from './useDragMove';

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
  onMove: MoveHandler;
  onSelect: (appt: CalendarAppointment) => void;
}

export const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
export const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60 * PX_PER_MINUTE;

export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

/** Top offset and height in px for a card, clipped to the visible hours. */
export function placement(appt: CalendarAppointment, timeZone: string): { top: number; height: number } {
  const start = zonedParts(new Date(appt.startsAt), timeZone).minuteOfDay;
  const duration = (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) / 60_000;
  const top = Math.max(0, (start - DAY_START_HOUR * 60) * PX_PER_MINUTE);
  return { top, height: Math.max(20, Math.min(duration * PX_PER_MINUTE, GRID_HEIGHT - top)) };
}

/** Side-by-side lanes for overlapping appointments in one column. */
export function lanes(appts: CalendarAppointment[]): Map<string, { lane: number; of: number }> {
  const sorted = [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const result = new Map<string, { lane: number; of: number }>();
  let cluster: CalendarAppointment[] = [];
  let clusterEnd = 0;
  let laneEnds: number[] = [];

  const flush = () => {
    for (const a of cluster) result.set(a.id, { lane: result.get(a.id)!.lane, of: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const appt of sorted) {
    const start = new Date(appt.startsAt).getTime();
    const end = new Date(appt.endsAt).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    result.set(appt.id, { lane, of: 0 });
    cluster.push(appt);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

export function TimeGutter() {
  return (
    <div className="time-gutter" style={{ height: GRID_HEIGHT }}>
      {HOURS.map((h) => (
        <span key={h} style={{ top: (h - DAY_START_HOUR) * 60 * PX_PER_MINUTE }}>
          {hourLabel(h)}
        </span>
      ))}
    </div>
  );
}

export function DayView({ date, timeZone, columns, appointments, onMove, onSelect }: Props) {
  const { cardProps, columnProps } = useDragMove(appointments, timeZone, onMove);
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

        <TimeGutter />
        {columns.map((col) => {
          const mine = appointments.filter((a) => single || a.groomerId === col.id);
          const layout = lanes(mine);
          return (
            <div key={col.id} className="calendar-column" style={{ height: GRID_HEIGHT }} {...columnProps(col.id, date, single ? null : col.id)}>
              {mine.map((appt) => {
                const { top, height } = placement(appt, timeZone);
                const { lane, of } = layout.get(appt.id) ?? { lane: 0, of: 1 };
                return (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    timeZone={timeZone}
                    color={col.color}
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
  );
}
