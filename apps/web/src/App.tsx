import { Navigate, Route, Routes } from 'react-router-dom';
import { BookingConfirmed } from './booking/BookingConfirmed';
import { BookingPage } from './booking/BookingPage';
import { CalendarPage } from './dashboard/calendar/CalendarPage';
import { CheckoutPage } from './dashboard/checkout/CheckoutPage';
import { DashboardLayout } from './dashboard/DashboardLayout';
import { LoginPage } from './dashboard/LoginPage';
import { BusinessSettings } from './dashboard/settings/BusinessSettings';
import { ServiceAreaSettings } from './dashboard/settings/ServiceAreaSettings';
import { ServicesSettings } from './dashboard/settings/ServicesSettings';
import { SettingsPage } from './dashboard/settings/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/book/:slug/confirmed" element={<BookingConfirmed />} />
      <Route path="/paid" element={<p className="page-message">Thanks! Your payment went through.</p>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<DashboardLayout />}>
        <Route index element={<Navigate to="calendar" replace />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="checkout/:appointmentId" element={<CheckoutPage />} />
        <Route path="settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="business" replace />} />
          <Route path="business" element={<BusinessSettings />} />
          <Route path="services" element={<ServicesSettings />} />
          <Route path="service-area" element={<ServiceAreaSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
