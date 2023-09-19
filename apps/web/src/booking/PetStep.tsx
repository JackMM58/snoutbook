import { useState, type FormEvent } from 'react';
import type { Size } from '@snoutbook/shared';
import { api } from '../api/client';
import { Button, ErrorNote, Field } from '../components/ui';
import type { PetChoice, ReturningClient } from './BookingPage';

interface Props {
  slug: string;
  initialPet: PetChoice | undefined;
  initialReturning: ReturningClient | undefined;
  onContinue: (pet: PetChoice, returning: ReturningClient | undefined) => void;
}

interface LookupResult {
  firstName: string;
  pets: { id: string; name: string; size: Size }[];
}

export function PetStep({ slug, initialPet, initialReturning, onContinue }: Props) {
  const [mode, setMode] = useState<'new' | 'returning'>(initialReturning ? 'returning' : 'new');
  const [phone, setPhone] = useState(initialReturning?.phone ?? '');
  const [email, setEmail] = useState(initialReturning?.email ?? '');
  const [found, setFound] = useState<LookupResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(initialPet?.kind === 'new' ? initialPet.name : '');
  const [breed, setBreed] = useState(initialPet?.kind === 'new' ? initialPet.breed : '');
  const [weight, setWeight] = useState(initialPet?.kind === 'new' ? String(initialPet.weightLbs) : '');

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      setFound(await api<LookupResult>(`/public/${slug}/lookup`, { method: 'POST', json: { phone, email } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitNewPet(e: FormEvent) {
    e.preventDefault();
    const weightLbs = Number(weight);
    if (!name.trim() || !Number.isFinite(weightLbs) || weightLbs <= 0) {
      setError("Please add your pet's name and approximate weight.");
      return;
    }
    const returning = found ? { firstName: found.firstName, phone, email } : undefined;
    onContinue({ kind: 'new', name: name.trim(), breed: breed.trim(), weightLbs }, returning);
  }

  return (
    <section>
      <h2>Who's coming in?</h2>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'new'} onClick={() => setMode('new')}>
          New here
        </button>
        <button type="button" role="tab" aria-selected={mode === 'returning'} onClick={() => setMode('returning')}>
          I've been before
        </button>
      </div>

      {mode === 'returning' && !found && (
        <form onSubmit={lookup} className="form-grid">
          <Field label="Mobile number">
            <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              Find my pets
            </Button>
          </div>
        </form>
      )}

      {mode === 'returning' && found && (
        <>
          <p>Welcome back, {found.firstName}! Who are we seeing?</p>
          <ul className="choice-list">
            {found.pets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="choice"
                  onClick={() => onContinue({ kind: 'existing', id: p.id, name: p.name, size: p.size }, { firstName: found.firstName, phone, email })}
                >
                  <span className="choice-title">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted">Bringing someone new? Add them below.</p>
        </>
      )}

      {(mode === 'new' || found) && (
        <form onSubmit={submitNewPet} className="form-grid">
          <Field label="Pet's name">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Breed" hint="Optional">
            <input value={breed} onChange={(e) => setBreed(e.target.value)} />
          </Field>
          <Field label="Weight (lb)" hint="A rough guess is fine">
            <input type="number" inputMode="decimal" min="1" max="250" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button type="submit">Continue</Button>
          </div>
        </form>
      )}

      <ErrorNote error={error} />
    </section>
  );
}
