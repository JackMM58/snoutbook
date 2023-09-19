import { Navigate, Route, Routes } from 'react-router-dom';
import { BookingConfirmed } from './booking/BookingConfirmed';
import { BookingPage } from './booking/BookingPage';
import { CalendarPage } from './dashboard/calendar/CalendarPage';
import { DashboardLayout } from './dashboard/DashboardLayout';
import { LoginPage } from './dashboard/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/book/:slug/confirmed" element={<BookingConfirmed />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<DashboardLayout />}>
        <Route index element={<Navigate to="calendar" replace />} />
        <Route path="calendar" element={<CalendarPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
