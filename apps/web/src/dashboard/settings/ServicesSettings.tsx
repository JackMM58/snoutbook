import { useState } from 'react';
import { addOnDefinition, addOnPriceError, parseDollars, SIZES, type AddOn, type Service } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Badge, Button, Card, ErrorNote, Loading } from '../../components/ui';
import { formatCents, minutesLabel } from '../../lib/format';

export function ServicesSettings() {
  const services = useApi<{ services: Service[] }>('/services');
  const addOns = useApi<{ addOns: AddOn[] }>('/add-ons');

  return (
    <>
      <Card title="Services">
        {services.loading && <Loading />}
        <ErrorNote error={services.error} />
        {services.data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  {SIZES.map((s) => (
                    <th key={s} className="num">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.data.services.map((svc) => (
                  <tr key={svc.id}>
                    <td>
                      {svc.name} {!svc.active && <Badge>Hidden</Badge>}
                    </td>
                    {SIZES.map((s) => (
                      <td key={s} className="num">
                        {formatCents(svc.pricesCents[s])}
                        <br />
                        <span className="muted">{minutesLabel(svc.durationsMinutes[s])}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Add-ons">
        <p className="muted">Add-ons are added to the bill at checkout.</p>
        {addOns.data?.addOns.map((a) => <AddOnRow key={a.id} addOn={a} onSaved={addOns.reload} />)}
      </Card>
    </>
  );
}

function AddOnRow({ addOn, onSaved }: { addOn: AddOn; onSaved: () => void }) {
  const def = addOnDefinition(addOn.key);
  const [price, setPrice] = useState((addOn.priceCents / 100).toFixed(2));
  const [active, setActive] = useState(addOn.active);
  const [error, setError] = useState<string>();

  async function save() {
    const cents = parseDollars(price);
    const problem = cents === null ? 'Enter a dollar amount' : addOnPriceError(addOn.key, cents);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    try {
      await api(`/add-ons/${addOn.id}`, { method: 'PUT', json: { priceCents: cents, active } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="addon-row">
      <label className="addon-name">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {addOn.label}
      </label>
      <input
        className="addon-price"
        inputMode="decimal"
        aria-label={`${addOn.label} price`}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      {def.minPriceCents != null && def.maxPriceCents != null && (
        <span className="muted">
          {formatCents(def.minPriceCents)}–{formatCents(def.maxPriceCents)}
        </span>
      )}
      <Button variant="secondary" onClick={save}>
        Save
      </Button>
      <ErrorNote error={error} />
    </div>
  );
}
