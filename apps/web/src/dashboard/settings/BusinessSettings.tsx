import { useEffect, useState, type FormEvent } from 'react';
import { parseDollars, type BusinessSettings as Settings } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Button, Card, ErrorNote, Field, Loading } from '../../components/ui';

export function BusinessSettings() {
  const { data, error } = useApi<{ settings: Settings }>('/settings');
  const [form, setForm] = useState<Settings>();
  const [deposit, setDeposit] = useState('');
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm(data.settings);
    setDeposit(data.settings.depositCents ? (data.settings.depositCents / 100).toFixed(2) : '');
  }, [data]);

  if (error) return <ErrorNote error={error} />;
  if (!form) return <Loading />;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaveError(undefined);
    setSaved(false);
    const depositCents = deposit.trim() ? parseDollars(deposit) : null;
    if (deposit.trim() && depositCents === null) {
      setSaveError('Enter the deposit as a dollar amount, like 20 or 25.00');
      return;
    }
    try {
      const { settings } = await api<{ settings: Settings }>('/settings', {
        method: 'PUT',
        json: { name: form.name, phone: form.phone, timezone: form.timezone, depositCents, rebookAfterWeeks: form.rebookAfterWeeks },
      });
      setForm(settings);
      setSaved(true);
    } catch (err) {
      setSaveError((err as Error).message);
    }
  }

  return (
    <>
      <Card title="Business">
        <form className="form-grid" onSubmit={save}>
          <Field label="Business name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Phone" hint="Shown on reminders so clients can call to change a booking">
            <input type="tel" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} />
          </Field>
          <Field label="Timezone">
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'].map(
                (tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace('America/', '').replace('Pacific/', '').replace('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </Field>
          >
            <input
              inputMode="decimal"
              placeholder="$0.00"
              value={deposit}
              disabled={!form.stripeConnected}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
          <div className="span-all">
            <ErrorNote error={saveError} />
            <div className="btn-row">
              <Button type="submit">Save</Button>
              {saved && <span className="muted">Saved</span>}
            </div>
          </div>
        </form>
      </Card>

    </>
  );
}
