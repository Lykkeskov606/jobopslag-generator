import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <p className="error-text">Invalid reset link — no token found.</p>
          <button type="button" className="link-btn" onClick={() => navigate('/login')}>
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h1>{t('auth.resetPasswordTitle')}</h1>

        {success ? (
          <>
            <p className="auth-notice success-notice">{t('auth.passwordResetSuccess')}</p>
            <button type="button" onClick={() => navigate('/login')}>
              {t('auth.login')}
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              {t('auth.newPassword')}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
                minLength={8}
              />
            </label>
            <label>
              {t('auth.confirmNewPassword')}
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? '...' : t('auth.setNewPassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
