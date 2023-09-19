import { useMemo, useState } from 'react';
import { addDays, zonedParts, type AvailabilitySlot, type Service, type Size } from '@snoutbook/shared';
import { useApi } from '../api/hooks';
import { ErrorNote, Loading } from '../components/ui';
import { formatDay, formatTime, todayIn } from '../lib/format';
import type { ChosenSlot, PublicBusiness } from './BookingPage';

interface Props {
  slug: string;
  business: PublicBusiness;
  service: Service;
  size: Size;
  groomers: { id: string; name: string }[];
  selected: ChosenSlot | undefined;
  onSelect: (slot: ChosenSlot) => void;
}

const DAYS_SHOWN = 14;

export function TimeStep({ slug, business, service, size, groomers, selected, onSelect }: Props) {
  const today = todayIn(business.timezone);
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today]);
  const [date, setDate] = useState(
    selected ? zonedParts(new Date(selected.startsAt), business.timezone).date : today,
  );
  const [groomerChoice, setGroomerChoice] = useState(selected?.groomerChoice ?? 'any');

  const params = new URLSearchParams({ serviceId: service.id, size, date, groomerId: groomerChoice });
  const { data, error, loading } = useApi<{ slots: AvailabilitySlot[] }>(`/public/${slug}/availability?${params}`);

  return (
    <section>
      <h2>Pick a time</h2>

      {groomers.length > 0 && (
        <div className="groomer-picker" role="radiogroup" aria-label="Groomer">
          {groomers.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={groomerChoice === g.id} onClick={() => setGroomerChoice(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className="day-strip" role="listbox" aria-label="Day">
        {days.map((d) => (
          <button key={d} type="button" role="option" aria-selected={d === date} onClick={() => setDate(d)}>
            {formatDay(d)}
          </button>
        ))}
      </div>

      {loading && <Loading />}
      <ErrorNote error={error} />
      {data && data.slots.length === 0 && <p className="muted">Nothing free on {formatDay(date, 'long')}. Try another day.</p>}
      {data && data.slots.length > 0 && (
        <ul className="slot-grid">
          {data.slots.map((slot) => (
            <li key={`${slot.startsAt}-${slot.groomerId}`}>
              <button
                type="button"
                className={selected?.startsAt === slot.startsAt ? 'selected' : ''}
                onClick={() => onSelect({ ...slot, groomerChoice })}
              >
                {formatTime(slot.startsAt, business.timezone)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
