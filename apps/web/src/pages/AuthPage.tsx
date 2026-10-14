import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PanelsTopLeft } from 'lucide-react';
import { useAuth } from '../auth';
import { ErrorState } from '../components/ui';

export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, signIn, register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (register) {
        await createAccount(String(data.get('name')), String(data.get('email')), String(data.get('password')));
      } else {
        await signIn(String(data.get('email')), String(data.get('password')));
      }
      navigate('/');
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-backdrop">
      <section className="auth-panel">
        <Link to="/login" className="brand"><span className="brand-mark"><PanelsTopLeft size={19} /></span><span>fieldwork<span className="brand-dot">.</span></span></Link>
        <p className="eyebrow">YOUR TEAM, IN MOTION</p>
        <h1>{register ? 'Make room for good work.' : 'Welcome back.'}</h1>
        <p className="muted">{register ? 'Create your account and join a project workspace.' : 'Sign in to pick up where your team left off.'}</p>
        <form className="form-stack auth-form" onSubmit={(event) => void submit(event)}>
          {register && <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : 1} maxLength={72} required /></label>
          {error !== null && <ErrorState error={error} />}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to Fieldwork?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      </section>
    </main>
  );
}