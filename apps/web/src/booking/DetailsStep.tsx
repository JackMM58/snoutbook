import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { servicePrice, type Service } from '@snoutbook/shared';
import { api, ApiError } from '../api/client';
import { Button, ErrorNote, Field } from '../components/ui';
import { formatCents, formatDate, formatTime } from '../lib/format';
import { petSize, type ChosenSlot, type PetChoice, type PublicBusiness, type ReturningClient } from './BookingPage';

interface Props {
  slug: string;
  business: PublicBusiness;
  service: Service;
  pet: PetChoice;
  slot: ChosenSlot;
  groomerName: string | undefined;
  returning: ReturningClient | undefined;
  onSlotTaken: () => void;
}

interface BookingResponse {
  appointmentId: string;
  checkoutUrl: string | null;
}

export function DetailsStep({ slug, business, service, pet, slot, groomerName, returning, onSlotTaken }: Props) {
  const navigate = useNavigate();
  const [client, setClient] = useState({
    firstName: returning?.firstName ?? '',
    lastName: '',
    phone: returning?.phone ?? '',
    email: returning?.email ?? '',
  });
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
  const [gateNotes, setGateNotes] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const estimate = servicePrice(service, petSize(pet));
  const set = (key: keyof typeof client) => (e: { target: { value: string } }) => setClient({ ...client, [key]: e.target.value });
  const setAddr = (key: keyof typeof address) => (e: { target: { value: string } }) => setAddress({ ...address, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<BookingResponse>(`/public/${slug}/bookings`, {
        method: 'POST',
        json: {
          serviceId: service.id,
          startsAt: slot.startsAt,
          groomerId: slot.groomerChoice,
          client: {
            ...client,
            address: business.collectsAddress ? { ...address, line2: address.line2 || undefined } : undefined,
            gateNotes: business.collectsAddress && gateNotes ? gateNotes : undefined,
          },
          pet: pet.kind === 'existing' ? { id: pet.id } : { name: pet.name, breed: pet.breed || undefined, weightLbs: pet.weightLbs },
        },
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      navigate(`/book/${slug}/confirmed?appointment=${result.appointmentId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slot_taken') {
        onSlotTaken();
        return;
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Your details</h2>

      <dl className="summary">
        <div>
          <dt>Service</dt>
          <dd>{service.name}</dd>
        </div>
        <div>
          <dt>Pet</dt>
          <dd>{pet.name}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {formatDate(slot.startsAt, business.timezone)} at {formatTime(slot.startsAt, business.timezone)}
          </dd>
        </div>
        {groomerName && (
          <div>
            <dt>Groomer</dt>
            <dd>
              {groomerName}
            </dd>
          </div>
        )}
        <div>
          <dt>Estimated price</dt>
          <dd>{formatCents(estimate)}</dd>
        </div>
      </dl>

      {returning ? (
        <p>
          Booking as {returning.firstName} ({returning.email}).
        </p>
      ) : (
        <div className="form-grid">
          <Field label="First name">
            <input autoComplete="given-name" value={client.firstName} onChange={set('firstName')} required />
          </Field>
          <Field label="Last name">
            <input autoComplete="family-name" value={client.lastName} onChange={set('lastName')} />
          </Field>
          <Field label="Mobile number" hint="We'll text your reminders here">
            <input type="tel" autoComplete="tel" value={client.phone} onChange={set('phone')} required />
          </Field>
          <Field label="Email">
            <input type="email" autoComplete="email" value={client.email} onChange={set('email')} required />
          </Field>
        </div>
      )}

      <ErrorNote error={error} />
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          Book appointment
        </Button>
      </div>
    </form>
  );
}
