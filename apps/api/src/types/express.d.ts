import type { SessionClaims } from '../lib/auth';

declare global {
  namespace Express {
    interface Request {
      auth?: SessionClaims;
    }
  }
}

export {};
