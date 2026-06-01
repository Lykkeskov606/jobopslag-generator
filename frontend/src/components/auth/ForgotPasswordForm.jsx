import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

export function ForgotPasswordForm({ onBack }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      // Intentionally swallowed — always show the same success message
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="auth-form">
      <h1>{t('auth.forgotPasswordTitle')}</h1>

      {submitted ? (
        <>
          <p className="auth-notice">{t('auth.resetEmailSent')}</p>
          <button type="button" className="link-btn" onClick={onBack}>
            {t('auth.backToLogin')}
          </button>
        </>
      ) : (
        <>
          <p className="auth-desc">{t('auth.forgotPasswordDesc')}</p>
          <form onSubmit={handleSubmit}>
            <label>
              {t('auth.email')}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? '...' : t('auth.sendResetLink')}
            </button>
          </form>
          <p>
            <button type="button" className="link-btn" onClick={onBack}>
              {t('auth.backToLogin')}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
