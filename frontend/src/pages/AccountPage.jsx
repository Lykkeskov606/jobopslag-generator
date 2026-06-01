import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ChangePasswordForm } from '../components/auth/ChangePasswordForm';

export function AccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dashboard-page">
      <nav className="top-nav">
        <span className="nav-brand">{t('app.name')}</span>
        <div className="nav-actions">
          <button className="link-btn" onClick={() => navigate('/dashboard')}>
            {t('nav.dashboard')}
          </button>
          <span className="nav-user">{user?.email}</span>
          <button className="link-btn" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <h1>{t('auth.account')}</h1>
        <div className="account-section">
          <ChangePasswordForm />
        </div>
      </main>
    </div>
  );
}
