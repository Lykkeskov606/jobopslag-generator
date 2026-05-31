import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects')
      .then((res) => setProjects(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function startProject(tier) {
    try {
      const name = tier === 1 ? 'Quick Job Post' : 'Full Recruitment Project';
      const { data } = await api.post('/projects', { name, tier });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteProject(e, id, name) {
    e.stopPropagation();
    if (!window.confirm(`Slet projektet "${name}"?\n\nDenne handling kan ikke fortrydes.`)) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Sletning fejlede — prøv igen.');
    }
  }

  return (
    <div className="dashboard-page">
      <nav className="top-nav">
        <span className="nav-brand">{t('app.name')}</span>
        <div className="nav-actions">
          {isAdmin && (
            <button className="link-btn" onClick={() => navigate('/admin')}>
              {t('nav.admin')}
            </button>
          )}
          <span className="nav-user">{user?.email}</span>
          <button className="link-btn" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <h1>{t('dashboard.title')}</h1>

        <div className="tier-cards">
          <div className="tier-card" onClick={() => startProject(1)}>
            <h2>{t('dashboard.tier1Title')}</h2>
            <p>{t('dashboard.tier1Desc')}</p>
            <button>{t('dashboard.newProject')}</button>
          </div>
          <div className="tier-card" onClick={() => startProject(2)}>
            <h2>{t('dashboard.tier2Title')}</h2>
            <p>{t('dashboard.tier2Desc')}</p>
            <button>{t('dashboard.newProject')}</button>
          </div>
        </div>

        {loading && <p>Loading...</p>}
        {!loading && projects.length === 0 && (
          <p className="empty-state">{t('dashboard.noProjects')}</p>
        )}
        {!loading && projects.length > 0 && (
          <ul className="project-list">
            {projects.map((p) => (
              <li
                key={p.id}
                className="project-item"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <span className="project-name">{p.name}</span>
                <span className={`project-status status-${p.status}`}>
                  {t(`dashboard.status.${p.status}`)}
                </span>
                <span className="project-meta">
                  Tier {p.tier} · {p.output_language.toUpperCase()} ·{' '}
                  {t('dashboard.lastUpdated')}: {new Date(p.updated_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="delete-project-btn"
                  onClick={(e) => handleDeleteProject(e, p.id, p.name)}
                  title="Slet projekt"
                >
                  Slet
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
