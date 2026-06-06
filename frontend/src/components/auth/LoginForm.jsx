import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export function LoginForm({ onSuccess, onSwitchToRegister, onForgotPassword }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Login mislykkedes. Tjek din e-mail og adgangskode.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="head">
        <div className="eyebrow">Log ind</div>
        <h2>Velkommen tilbage</h2>
        <p>
          Ingen konto?{' '}
          <button type="button" className="link-act" onClick={onSwitchToRegister}>
            Opret gratis
          </button>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <p className="error-text">{error}</p>}

        <div className="field">
          <label htmlFor="lf-email">E-mail</label>
          <input
            className="input"
            id="lf-email"
            type="email"
            placeholder="navn@virksomhed.dk"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <div className="field-row">
            <label htmlFor="lf-pw">Adgangskode</label>
            <button type="button" className="forgot" onClick={onForgotPassword}>
              Glemt adgangskode?
            </button>
          </div>
          <input
            className="input"
            id="lf-pw"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          className="btn btn-primary btn-lg btn-block"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logger ind…' : <>Log ind <span className="arrow">→</span></>}
        </button>
      </form>
    </div>
  );
}
