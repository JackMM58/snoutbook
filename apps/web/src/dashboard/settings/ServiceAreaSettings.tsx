import { useEffect, useState } from 'react';
import type { StaffMember, Van } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Button, Card, ErrorNote, Field } from '../../components/ui';
import { useSession } from '../../lib/session';

export function ServiceAreaSettings() {
  const { plan } = useSession();
  const area = useApi<{ zips: string[] }>(plan.serviceArea ? '/settings/service-area' : null);
  const vans = useApi<{ vans: Van[] }>(plan.serviceArea ? '/settings/vans' : null);
  const staff = useApi<{ staff: StaffMember[] }>('/staff');
  const [zipText, setZipText] = useState('');
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (area.data) setZipText(area.data.zips.join(', '));
  }, [area.data]);

  if (!plan.serviceArea) return <Card title="Service area"><p>Service areas are part of the Mobile plan.</p></Card>;

  async function saveZips() {
    const zips = zipText.split(/[\s,]+/).filter(Boolean);
    const bad = zips.filter((z) => !/^\d{5}$/.test(z));
    if (bad.length > 0) {
      setError(`These don't look like ZIP codes: ${bad.join(', ')}`);
      return;
    }
    setError(undefined);
    try {
      await api('/settings/service-area', { method: 'PUT', json: { zips } });
      setSaved(true);
      area.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Card title="Service area">
        <p className="muted">Clients booking online must have an address in one of these ZIP codes.</p>
        <Field label="ZIP codes" hint="Separate with commas or spaces">
          <textarea value={zipText} onChange={(e) => { setZipText(e.target.value); setSaved(false); }} rows={4} />
        </Field>
        <ErrorNote error={error} />
        <div className="btn-row">
          <Button onClick={saveZips}>Save ZIP codes</Button>
          {saved && <span className="muted">Saved</span>}
        </div>
      </Card>

      <Card title="Vans">
        <p className="muted">
          Buffer minutes are kept free before and after every appointment on that van, for driving and setup.
        </p>
        <ErrorNote error={vans.error} />
        {vans.data?.vans.map((van) => (
          <VanRow key={van.id} van={van} staff={staff.data?.staff ?? []} onSaved={vans.reload} />
        ))}
        {vans.data && vans.data.vans.length < plan.maxVans && (
          <VanRow staff={staff.data?.staff ?? []} onSaved={vans.reload} />
        )}
      </Card>
    </>
  );
}

function VanRow({ van, staff, onSaved }: { van?: Van; staff: StaffMember[]; onSaved: () => void }) {
  const [name, setName] = useState(van?.name ?? '');
  const [staffId, setStaffId] = useState(van?.staffId ?? '');
  const [buffer, setBuffer] = useState(String(van?.bufferMinutes ?? 15));
  const [error, setError] = useState<string>();

  async function save() {
    setError(undefined);
    const body = { name, staffId: staffId || null, bufferMinutes: Number(buffer) };
    try {
      await api(van ? `/settings/vans/${van.id}` : '/settings/vans', { method: van ? 'PUT' : 'POST', json: body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="van-row form-grid">
      <Field label={van ? 'Van' : 'Add a van'}>
        <input value={name} placeholder="Van name" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Groomer">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">Unassigned</option>
          {staff
            .filter((s) => s.bookable)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Buffer minutes">
        <input type="number" min={0} max={180} step={5} value={buffer} onChange={(e) => setBuffer(e.target.value)} />
      </Field>
      <div className="form-actions">
        <Button variant="secondary" onClick={save} disabled={!name.trim()}>
          {van ? 'Save' : 'Add van'}
        </Button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
