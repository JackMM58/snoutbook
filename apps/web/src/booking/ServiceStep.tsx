import { priceRange, SIZES, type Service } from '@snoutbook/shared';
import { formatCents, minutesLabel } from '../lib/format';

interface Props {
  services: Service[];
  selectedId: string | undefined;
  onSelect: (service: Service) => void;
}

export function ServiceStep({ services, selectedId, onSelect }: Props) {
  if (services.length === 0) {
    return <p className="muted">No services are bookable online right now. Please call to book.</p>;
  }
  return (
    <section>
      <h2>What would you like to book?</h2>
      <ul className="choice-list">
        {services.map((service) => {
          const { minCents, maxCents } = priceRange(service);
          const durations = SIZES.map((s) => service.durationsMinutes[s]);
          return (
            <li key={service.id}>
              <button
                type="button"
                className={`choice ${service.id === selectedId ? 'selected' : ''}`}
                onClick={() => onSelect(service)}
              >
                <span className="choice-title">{service.name}</span>
                {service.description && <span className="choice-detail">{service.description}</span>}
                <span className="choice-meta">
                  {minCents === maxCents ? formatCents(minCents) : `${formatCents(minCents)}–${formatCents(maxCents)}`} by size ·{' '}
                  {minutesLabel(Math.min(...durations))}
                  {Math.max(...durations) !== Math.min(...durations) && `–${minutesLabel(Math.max(...durations))}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
