import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/hooks';
import type { BookingInfo } from './BookingPage';
import './booking.css';

export function BookingConfirmed() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { data } = useApi<BookingInfo>(`/public/${slug}`);
  const name = data?.business.name ?? 'the salon';
  const depositCancelled = params.get('deposit') === 'cancelled';

  return (
    <div className="booking">
      <main className="booking-body confirmed">
        {depositCancelled ? (
          <>
            <h1>Your booking isn't finished</h1>
            <p>
              We didn't receive the deposit, so the time is only held for a few minutes. Go back to the payment page to finish,
              or contact {name}
              {data?.business.phone ? ` at ${data.business.phone}` : ''}.
            </p>
          </>
        ) : (
          <>
            <h1>You're booked!</h1>
            <p>
              Thanks for booking with {name}. We'll send a reminder by text and email two days before, and again a couple of
              hours before.
            </p>
          </>
        )}
        <Link to={`/book/${slug}`}>Book another appointment</Link>
      </main>
    </div>
  );
}
