import { SIZES, type Service } from '@snoutbook/shared';
import { api } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Badge, Button, Card, ErrorNote, Loading } from '../../components/ui';
import { formatCents, minutesLabel } from '../../lib/format';

export function ServicesSettings() {
  const services = useApi<{ services: Service[] }>('/services');

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

    </>
  );
}
