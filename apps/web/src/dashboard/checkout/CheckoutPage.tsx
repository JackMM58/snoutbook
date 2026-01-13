import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { parseDollars, tipFromPercent, type AddOn, type Bill, type PaymentMethod } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Button, Card, ErrorNote, Field, Loading } from '../../components/ui';
import { formatCents } from '../../lib/format';

interface CheckoutView {
  appointment: { id: string; status: string; petName: string; serviceName: string; clientName: string; petId: string };
  addOns: { id: string; addOnId: string; label: string; priceCents: number }[];
  bill: Bill;
  depositCents: number;
  payments: { id: string; method: PaymentMethod; amountCents: number; tipCents: number; status: string }[];
}

const TIP_PERCENTS = [0, 15, 20, 25];

export function CheckoutPage() {
  const { appointmentId = '' } = useParams();
  const navigate = useNavigate();
  const [tipCents, setTipCents] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('card_reader');
  const [readerId, setReaderId] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  const checkout = useApi<CheckoutView>(`/appointments/${appointmentId}/checkout?tipCents=${tipCents}`);
  const catalog = useApi<{ addOns: AddOn[] }>('/add-ons');
  const readers = useApi<{ readers: { id: string; label: string; status: string | null }[] }>(
    method === 'card_reader' ? '/card-readers' : null,
  );

  if (checkout.loading && !checkout.data) return <Loading />;
  if (!checkout.data) return <ErrorNote error={checkout.error ?? 'Checkout not available'} />;

  const { appointment, addOns, bill, payments } = checkout.data;
  const open = appointment.status === 'checked_in';
  const pending = payments.find((p) => p.status === 'pending');

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      checkout.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const addAddOn = (addOnId: string) =>
    act(() => api(`/appointments/${appointmentId}/add-ons`, { method: 'POST', json: { addOnId } }));
  const removeAddOn = (lineId: string) =>
    act(() => api(`/appointments/${appointmentId}/add-ons/${lineId}`, { method: 'DELETE' }));

  const pay = () =>
    act(async () => {
      const result = await api<{ status: string }>(`/appointments/${appointmentId}/payments`, {
        method: 'POST',
        json: method === 'card_reader' ? { method, tipCents, readerId } : { method, tipCents },
      });
      if (result.status === 'succeeded') {
        navigate('/app/calendar');
        return;
      }
      setNotice(method === 'payment_link' ? 'Payment link sent by text.' : 'Sent to the card reader. Ask the client to tap or insert.');
    });

  return (
    <div className="checkout">
      <header className="page-header">
        <div>
          <h1>Checkout</h1>
          <p className="muted">
            {appointment.petName} · {appointment.serviceName} · {appointment.clientName}
          </p>
        </div>
        <Link to="/app/calendar" className="btn btn-secondary">
          Back
        </Link>
      </header>

      {!open && <p className="muted">This appointment is {appointment.status.replace('_', ' ')}. Check it in to take payment.</p>}

      <div className="checkout-grid">
        <Card title="Bill">
          <div className="table-wrap">
            <table>
              <tbody>
                {bill.lines.map((line, i) => {
                  const addOn = i === 0 ? undefined : addOns[i - 1];
                  return (
                    <tr key={addOn?.id ?? 'service'}>
                      <td>{line.label}</td>
                      <td className="num">{formatCents(line.priceCents)}</td>
                      <td className="num">
                        {addOn && open && (
                          <button type="button" className="btn btn-ghost" onClick={() => removeAddOn(addOn.id)} disabled={busy}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <th>Subtotal</th>
                  <td className="num">{formatCents(bill.subtotalCents)}</td>
                  <td />
                </tr>
                {bill.depositCreditCents > 0 && (
                  <tr>
                    <td>Deposit paid online</td>
                    <td className="num">−{formatCents(bill.depositCreditCents)}</td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td>Tip</td>
                  <td className="num">{formatCents(bill.tipCents)}</td>
                  <td />
                </tr>
                <tr className="total-row">
                  <th>Total due</th>
                  <td className="num">{formatCents(bill.totalDueCents)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {open && (
          <div>
            <Card title="Add-ons">
              <div className="btn-row">
                {(catalog.data?.addOns ?? [])
                  .filter((a) => a.active)
                  .map((a) => (
                    <Button key={a.id} variant="secondary" disabled={busy} onClick={() => addAddOn(a.id)}>
                      + {a.label} {formatCents(a.priceCents)}
                    </Button>
                  ))}
              </div>
            </Card>

            <Card title="Tip">
              <div className="btn-row">
                {TIP_PERCENTS.map((pct) => {
                  const amount = tipFromPercent(bill.subtotalCents, pct);
                  return (
                    <Button
                      key={pct}
                      variant={tipCents === amount && !customTip ? 'primary' : 'secondary'}
                      onClick={() => {
                        setCustomTip('');
                        setTipCents(amount);
                      }}
                    >
                      {pct === 0 ? 'No tip' : `${pct}% · ${formatCents(amount)}`}
                    </Button>
                  );
                })}
              </div>
              <Field label="Custom tip">
                <input
                  inputMode="decimal"
                  placeholder="$0.00"
                  value={customTip}
                  onChange={(e) => {
                    setCustomTip(e.target.value);
                    const cents = parseDollars(e.target.value);
                    if (cents !== null) setTipCents(cents);
                  }}
                />
              </Field>
            </Card>

            <Card title="Payment">
              <div className="segmented-control" role="tablist">
                {(
                  [
                    ['card_reader', 'Card reader'],
                    ['payment_link', 'Text a link'],
                    ['cash', 'Cash'],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={method === value} onClick={() => setMethod(value)}>
                    {label}
                  </button>
                ))}
              </div>
              {method === 'card_reader' && (
                <Field label="Reader">
                  <select value={readerId} onChange={(e) => setReaderId(e.target.value)}>
                    <option value="">Choose a reader</option>
                    {(readers.data?.readers ?? []).map((r) => (
                      <option key={r.id} value={r.id} disabled={r.status === 'offline'}>
                        {r.label}
                        {r.status === 'offline' ? ' (offline)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {pending ? (
                <div className="pending-payment">
                  <p>Waiting for the {pending.method === 'card_reader' ? 'card reader' : 'client to pay the link'}…</p>
                  <div className="btn-row">
                    <Button variant="secondary" onClick={() => checkout.reload()}>
                      Refresh
                    </Button>
                    <Button variant="danger" onClick={() => act(() => api(`/payments/${pending.id}/cancel`, { method: 'POST' }))}>
                      Cancel payment
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={pay} disabled={busy || (method === 'card_reader' && !readerId)}>
                  {method === 'cash' ? `Record ${formatCents(bill.totalDueCents)} cash` : `Charge ${formatCents(bill.totalDueCents)}`}
                </Button>
              )}
              {notice && <p className="muted">{notice}</p>}
            </Card>
          </div>
        )}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
