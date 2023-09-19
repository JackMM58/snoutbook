import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Button, ErrorNote, Field } from '../components/ui';
import { setToken } from '../lib/session';
import './dashboard.css';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { token } = await api<{ token: string }>('/auth/login', { method: 'POST', json: { email, password } });
      setToken(token);
      navigate('/app/calendar');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>Sign in to Snoutbook</h1>
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" disabled={busy}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
