import { useState } from 'react';
import { addDays, type ReportGranularity, type SalonReport } from '@snoutbook/shared';
import { useApi } from '../../api/hooks';
import { Card, ErrorNote, Field, Loading } from '../../components/ui';
import { formatCents, formatCalendarDate, todayIn } from '../../lib/format';
import { useSession } from '../../lib/session';

type Preset = 'this_month' | 'last_month' | 'last_90';

function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'this_month':
      return { from: monthStart, to: today };
    case 'last_month': {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case 'last_90':
      return { from: addDays(today, -89), to: today };
  }
}

export function ReportsPage() {
  const { business, plan } = useSession();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const { from, to } = rangeFor(preset, todayIn(business.timezone));
  const { data, error, loading } = useApi<SalonReport>(
    plan.reports ? `/reports?from=${from}&to=${to}&granularity=${granularity}` : null,
  );

  if (!plan.reports) {
    return (
      <Card title="Reports">
        <p>Reports are part of the Salon plan.</p>
      </Card>
    );
  }

  return (
    <div className="reports">
      <header className="page-header">
        <h1>Reports</h1>
        <div className="report-controls">
          <Field label="Period">
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="last_90">Last 90 days</option>
            </select>
          </Field>
          <Field label="Group by">
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as ReportGranularity)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </Field>
        </div>
      </header>

      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Revenue</span>
              <span className="stat-value">{formatCents(data.totalRevenueCents)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Completed visits</span>
              <span className="stat-value">{data.completedCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Rebook rate</span>
              <span className="stat-value">{data.rebookRate === null ? '—' : `${Math.round(data.rebookRate * 100)}%`}</span>
            </div>
            <div className="stat">
              <span className="stat-label">No-shows</span>
              <span className="stat-value">{data.noShowCount}</span>
            </div>
          </div>

          <Card title="Revenue">
            {data.revenue.length === 0 ? (
              <p className="muted">No completed visits in this period.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week of' : 'Month'}</th>
                      <th className="num">Services</th>
                      <th className="num">Tips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenue.map((row) => (
                      <tr key={row.period}>
                        <td>{granularity === 'month' ? row.period.slice(0, 7) : formatCalendarDate(row.period)}</td>
                        <td className="num">{formatCents(row.revenueCents)}</td>
                        <td className="num">{formatCents(row.tipsCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
