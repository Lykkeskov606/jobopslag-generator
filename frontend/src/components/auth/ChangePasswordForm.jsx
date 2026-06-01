import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

export function ChangePasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (next.length < 8) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="change-password-form">
        <p className="auth-notice success-notice">{t('auth.passwordChanged')}</p>
        <button type="button" className="link-btn" onClick={() => setSuccess(false)}>
          {t('auth.changePassword')}
        </button>
      </div>
    );
  }

  return (
    <div className="change-password-form">
      <h2>{t('auth.changePasswordTitle')}</h2>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.currentPassword')}
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          {t('auth.newPassword')}
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            autoComplete="new-password"
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
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? '...' : t('auth.changePassword')}
        </button>
      </form>
    </div>
  );
}
