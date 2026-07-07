import { useEffect, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AppointmentStatus, CalendarAppointment } from '@snoutbook/shared';
import { Badge, Button } from '../../components/ui';
import { formatCents, formatDate, formatTime, statusLabel } from '../../lib/format';

interface CardProps {
  appointment: CalendarAppointment;
  timeZone: string;
  color: string;
  style: CSSProperties;
  compact?: boolean;
  draggable: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onSelect: () => void;
}

const STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'success' | 'danger' | 'warning'> = {
  booked: 'neutral',
  checked_in: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

export function AppointmentCard({ appointment: a, timeZone, color, style, compact, draggable, onDragStart, onSelect }: CardProps) {
  return (
    <button
      type="button"
      className={`appt-card status-${a.status}`}
      style={{ ...style, borderLeftColor: color }}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onSelect}
    >
      <span className="appt-time">
        {formatTime(a.startsAt, timeZone)}
        {!compact && ` – ${formatTime(a.endsAt, timeZone)}`}
      </span>
      <span className="appt-pet">{a.petName}</span>
      {!compact && (
        <span className="appt-meta">
          {a.serviceName} · {a.clientName}
        </span>
      )}
      {a.status !== 'booked' && <Badge tone={STATUS_TONE[a.status]}>{statusLabel(a.status)}</Badge>}
    </button>
  );
}

interface PanelProps {
  appointment: CalendarAppointment;
  timeZone: string;
  groomerName: string | undefined;
  onStatus: (status: AppointmentStatus) => void;
  onClose: () => void;
}

export function AppointmentPanel({ appointment: a, timeZone, groomerName, onStatus, onClose }: PanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="appt-title" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2 id="appt-title">
            {a.petName} · {a.serviceName}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <dl className="detail-list">
          <dt>When</dt>
          <dd>
            {formatDate(a.startsAt, timeZone)}, {formatTime(a.startsAt, timeZone)} – {formatTime(a.endsAt, timeZone)}
          </dd>
          <dt>Client</dt>
          <dd>{a.clientName}</dd>
          {groomerName && (
            <>
              <dt>Groomer</dt>
              <dd>
                {groomerName}
                {a.anyGroomer && <span className="muted"> · booked as first available</span>}
              </dd>
            </>
          )}
          <dt>Quoted</dt>
          <dd>
            {formatCents(a.quotedPriceCents)} ({a.size})
          </dd>
          <dt>Status</dt>
          <dd>{statusLabel(a.status)}</dd>
          {a.notes && (
            <>
              <dt>Notes</dt>
              <dd>{a.notes}</dd>
            </>
          )}
        </dl>

        <div className="btn-row sheet-actions">
          {a.status === 'booked' && (
            <>
              <Button onClick={() => onStatus('checked_in')}>Check in</Button>
              <Button variant="secondary" onClick={() => onStatus('no_show')}>
                No-show
              </Button>
              <Button variant="danger" onClick={() => onStatus('cancelled')}>
                Cancel
              </Button>
            </>
          )}
          {a.status === 'checked_in' && (
            <Link className="btn btn-primary" to={`/app/checkout/${a.id}`}>
              Checkout
            </Link>
          )}
          {a.status === 'no_show' && (
            <Button variant="secondary" onClick={() => onStatus('booked')}>
              Undo no-show
            </Button>
          )}
          <Link className="btn btn-secondary" to={`/app/pets/${a.petId}`}>
            Pet profile
          </Link>
        </div>
      </div>
    </div>
  );
}
