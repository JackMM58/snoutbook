import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sizeForWeight, SIZE_LABELS, type CoatType, type Pet, type PetPhoto, type VaccineRecord } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Button, Card, ErrorNote, Field, Loading } from '../../components/ui';
import { formatDate, statusLabel } from '../../lib/format';
import { useSession } from '../../lib/session';
import { VaccineList } from './VaccineList';

interface PetProfile {
  pet: Pet;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    addressLine1: string | null;
    city: string | null;
    zip: string | null;
    gateNotes: string | null;
  };
  vaccines: VaccineRecord[];
  photos: PetPhoto[];
  visits: { id: string; startsAt: string; status: string; serviceName: string; groomerName: string }[];
}

const COAT_TYPES: CoatType[] = ['short', 'double', 'curly', 'wire', 'long', 'combination'];

export function PetProfilePage() {
  const { petId = '' } = useParams();
  const { business, plan } = useSession();
  const { data, error, loading, reload } = useApi<PetProfile>(`/pets/${petId}`);
  const [form, setForm] = useState<Pet>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data) setForm(data.pet);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error || !data || !form) return <ErrorNote error={error ?? 'Pet not found'} />;

  const { client, vaccines, photos, visits } = data;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const { id: _id, clientId: _clientId, ...body } = form;
      await api(`/pets/${petId}`, { method: 'PATCH', json: body });
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('photo', file);
      await api(`/pets/${petId}/photos`, { method: 'POST', body });
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="pet-profile">
      <header className="page-header">
        <div>
          <h1>{data.pet.name}</h1>
          <p className="muted">
            {[data.pet.breed, data.pet.weightLbs ? `${data.pet.weightLbs} lb · ${SIZE_LABELS[sizeForWeight(data.pet.weightLbs)]}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Link to="/app/calendar" className="btn btn-secondary">
          Back to calendar
        </Link>
      </header>

      <div className="profile-grid">
        <div>
          <Card title="Details">
            <form onSubmit={save} className="form-grid">
              <Field label="Name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Breed">
                <input value={form.breed ?? ''} onChange={(e) => setForm({ ...form, breed: e.target.value || null })} />
              </Field>
              <Field label="Weight (lb)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.weightLbs ?? ''}
                  onChange={(e) => setForm({ ...form, weightLbs: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
              <Field label="Coat">
                <select value={form.coatType ?? ''} onChange={(e) => setForm({ ...form, coatType: (e.target.value || null) as CoatType | null })}>
                  <option value="">—</option>
                  {COAT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c[0]!.toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Birthday">
                <input type="date" value={form.birthday ?? ''} onChange={(e) => setForm({ ...form, birthday: e.target.value || null })} />
              </Field>
              <div className="span-all">
                <Field label="Temperament notes" hint="Only your team sees these">
                  <textarea
                    value={form.temperamentNotes ?? ''}
                    onChange={(e) => setForm({ ...form, temperamentNotes: e.target.value || null })}
                  />
                </Field>
              </div>
              <ErrorNote error={saveError} />
              <div className="span-all">
                <Button type="submit" disabled={saving}>
                  Save
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Vaccines">
            <VaccineList petId={petId} vaccines={vaccines} onChange={reload} />
          </Card>

          <Card
            title="Photos"
            actions={
              <label className="btn btn-secondary">
                {uploading ? 'Uploading…' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                />
              </label>
            }
          >
            {photos.length === 0 ? (
              <p className="muted">No photos yet.</p>
            ) : (
              <ul className="photo-grid">
                {photos.map((p) => (
                  <li key={p.id}>
                    <img src={p.url} alt={p.caption ?? `${data.pet.name}`} loading="lazy" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside>
          <Card title="Owner">
            <p>
              <strong>
                {client.firstName} {client.lastName}
              </strong>
            </p>
            {client.phone && <p>{client.phone}</p>}
            {client.email && <p className="wrap-anywhere">{client.email}</p>}
            {plan.serviceArea && client.addressLine1 && (
              <p>
                {client.addressLine1}, {client.city} {client.zip}
              </p>
            )}
            {plan.serviceArea && client.gateNotes && (
              <p className="gate-notes">
                <strong>Gate/parking:</strong> {client.gateNotes}
              </p>
            )}
          </Card>
          <Card title="Recent visits">
            {visits.length === 0 ? (
              <p className="muted">No visits yet.</p>
            ) : (
              <ul className="visit-list">
                {visits.map((v) => (
                  <li key={v.id}>
                    <span>{formatDate(v.startsAt, business.timezone)}</span>
                    <span>
                      {v.serviceName} · {v.groomerName}
                    </span>
                    <span className="muted">{statusLabel(v.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
