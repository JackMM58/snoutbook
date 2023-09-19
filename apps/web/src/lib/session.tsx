import { createContext, useContext } from 'react';
import type { BusinessSummary, Plan, StaffRole } from '@snoutbook/shared';

const TOKEN_KEY = 'snoutbook.session';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export interface Session {
  staff: { id: string; name: string; email: string; role: StaffRole };
  business: BusinessSummary;
  plan: Plan;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside the dashboard');
  return session;
}

export function canManage(session: Session): boolean {
  return session.staff.role === 'owner' || session.staff.role === 'manager';
}
