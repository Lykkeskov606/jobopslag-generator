import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

export default function TopBar({ active }) {
  const { user, logout } = useAuth();
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const initials = user?.email ? user.email[0].toUpperCase() : '?';
  const isDA = i18n.language === 'da';

  function toggleLang() {
    i18n.changeLanguage(isDA ? 'en' : 'da');
  }

  return (
    <header className="topbar">
      <Link className="brand" to="/dashboard">
        <span className="mark">j</span>
        <span className="name">Jobopslag<sup>v1.5</sup></span>
      </Link>

      <nav className="topnav">
        <Link
          to="/dashboard"
          className={active === 'projects' ? 'active' : ''}
        >
          Projekter
        </Link>

        <span className="divider" />

        <button
          className="lang-toggle"
          onClick={toggleLang}
          aria-label="Skift sprog"
        >
          <span className={isDA ? 'on' : 'off'}>DA</span>
          <span className="sep">/</span>
          <span className={!isDA ? 'on' : 'off'}>EN</span>
        </button>

        {user && (
          <>
            <span className="divider" />
            <span
              className="avatar"
              title={user.email}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/account')}
            >
              {initials}
            </span>
          </>
        )}
      </nav>
    </header>
  );
}
