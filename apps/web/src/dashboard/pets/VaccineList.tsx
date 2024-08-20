import { useState, type FormEvent } from 'react';
import { isExpired, VACCINE_LABELS, VACCINE_TYPES, type VaccineRecord, type VaccineType } from '@snoutbook/shared';
import { api } from '../../api/client';
import { Badge, Button, ErrorNote, Field } from '../../components/ui';
import { formatCalendarDate } from '../../lib/format';

interface Props {
  petId: string;
  vaccines: VaccineRecord[];
  onChange: () => void;
}

export function VaccineList({ petId, vaccines, onChange }: Props) {
  const [type, setType] = useState<VaccineType>('rabies');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append('type', type);
      body.append('expiresOn', expiresOn);
      if (file) body.append('file', file);
      await api(`/pets/${petId}/vaccines`, { method: 'POST', body });
      setExpiresOn('');
      setFile(null);
      form.reset();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this vaccine record?')) return;
    await api(`/vaccines/${id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <>
      {vaccines.length === 0 ? (
        <p className="muted">No vaccine records yet.</p>
      ) : (
        <ul className="vaccine-list">
          {vaccines.map((v) => (
            <li key={v.id}>
              <span className="vaccine-type">{VACCINE_LABELS[v.type]}</span>
              <span>Expires {formatCalendarDate(v.expiresOn)}</span>
              {isExpired(v) && <Badge tone="danger">Expired</Badge>}
              <span className="vaccine-actions">
                {v.fileUrl && (
                  <a href={v.fileUrl} target="_blank" rel="noreferrer">
                    {v.fileName ?? 'View file'}
                  </a>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => remove(v.id)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="form-grid vaccine-form" onSubmit={add}>
        <Field label="Vaccine">
          <select value={type} onChange={(e) => setType(e.target.value as VaccineType)}>
            {VACCINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VACCINE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expires on">
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
        </Field>
        <Field label="Certificate" hint="Photo or PDF, optional">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="form-actions">
          <Button type="submit" variant="secondary" disabled={busy}>
            Add record
          </Button>
        </div>
      </form>
      <ErrorNote error={error} />
    </>
  );
}
