import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

export function LoginForm({ onSuccess, onSwitchToRegister }) {
  const { t } = useTranslation();
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
      setError(err.response?.data?.error || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form">
      <h1>{t('auth.loginTitle')}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? '...' : t('auth.login')}
        </button>
      </form>
      <p>
        {t('auth.dontHaveAccount')}{' '}
        <button type="button" className="link-btn" onClick={onSwitchToRegister}>
          {t('auth.register')}
        </button>
      </p>
    </div>
  );
}
