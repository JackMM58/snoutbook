import { SMS_OVERAGE_CENTS, type SmsUsageSummary } from '@snoutbook/shared';
import { useApi } from '../../api/hooks';
import { Card, ErrorNote, Loading } from '../../components/ui';
import { formatCents } from '../../lib/format';

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function SmsUsagePage() {
  const { data, error, loading } = useApi<{ usage: SmsUsageSummary }>('/settings/sms-usage');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error ?? 'Could not load usage'} />;

  const { usage } = data;
  const pct = Math.min(100, Math.round((usage.sent / usage.quota) * 100));

  return (
    <Card title={`Texts sent in ${monthName(usage.month)}`}>
      <p className="usage-figure">
        <strong>{usage.sent.toLocaleString()}</strong> of {usage.quota.toLocaleString()} included
      </p>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={usage.quota} aria-valuenow={usage.sent}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      {usage.overage > 0 ? (
        <p>
          {usage.overage.toLocaleString()} over · {formatCents(usage.overageCents)} so far
        </p>
      ) : (
        <p className="muted">{(usage.quota - usage.sent).toLocaleString()} left this month.</p>
      )}
      <p className="muted small">
        Reminders, rebook reminders and payment links all count. Extra texts are {formatCents(SMS_OVERAGE_CENTS)} each and are
        added to your next invoice.
      </p>
    </Card>
  );
}
