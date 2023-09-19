import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../api/hooks';
import { ErrorNote, Loading } from '../components/ui';
import { canManage, clearToken, getToken, SessionContext, type Session } from '../lib/session';
import './dashboard.css';

export function DashboardLayout() {
  const navigate = useNavigate();
  const token = getToken();
  const { data: session, error, loading } = useApi<Session>(token ? '/auth/me' : null);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <div className="dash-loading"><Loading /></div>;
  if (error || !session) return <ErrorNote error={error ?? 'Could not load your account'} />;

  const manager = canManage(session);

  return (
    <SessionContext.Provider value={session}>
      <div className="dash">
        <header className="dash-topbar">
          <div className="dash-brand">
            <strong>{session.business.name}</strong>
            <span className="muted">{session.plan.name} plan</span>
          </div>
          <nav className="dash-nav" aria-label="Main">
            <NavLink to="/app/calendar">Calendar</NavLink>
          </nav>
          <div className="dash-user">
            <span className="muted">{session.staff.name}</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearToken();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </SessionContext.Provider>
  );
}
