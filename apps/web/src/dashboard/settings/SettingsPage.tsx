import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../../lib/session';

export function SettingsPage() {
  const { plan } = useSession();
  return (
    <div className="settings">
      <h1>Settings</h1>
      <nav className="tabs" aria-label="Settings">
        <NavLink to="business">Business</NavLink>
        <NavLink to="services">Services</NavLink>
        {plan.serviceArea && <NavLink to="service-area">Service area</NavLink>}
      </nav>
      <Outlet />
    </div>
  );
}
