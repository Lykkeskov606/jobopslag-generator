import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';

function daysRemaining(deletedAt) {
  const expiry = new Date(new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [view, setView]                   = useState('active'); // 'active' | 'trash'
  const [projects, setProjects]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [trashLoading, setTrashLoading]   = useState(false);

  useEffect(() => {
    api.get('/projects')
      .then((res) => setProjects(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function loadTrash() {
    setView('trash');
    setTrashLoading(true);
    api.get('/projects/trash')
      .then((res) => setTrashedProjects(res.data))
      .catch(() => {})
      .finally(() => setTrashLoading(false));
  }

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
    if (!window.confirm(
      `Slet projektet "${name}"?\n\nDet flyttes til papirkurven og slettes permanent efter 7 dage.`
    )) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Sletning fejlede — prøv igen.');
    }
  }

  async function handleRestoreProject(e, id) {
    e.stopPropagation();
    try {
      await api.patch(`/projects/${id}/restore`);
      setTrashedProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Gendannelse fejlede — prøv igen.');
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
          <button className="link-btn" onClick={() => navigate('/account')}>{t('nav.account')}</button>
          <button className="link-btn" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <h1>{t('dashboard.title')}</h1>

        {view === 'active' && (
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
        )}

        {/* View toggle */}
        <div className="dashboard-view-toggle">
          <button
            type="button"
            className={`view-toggle-btn ${view === 'active' ? 'active' : ''}`}
            onClick={() => setView('active')}
          >
            {t('dashboard.title')}
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${view === 'trash' ? 'active' : ''}`}
            onClick={loadTrash}
          >
            🗑 {t('dashboard.trash')}
          </button>
        </div>

        {/* Active projects */}
        {view === 'active' && (
          <>
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
          </>
        )}

        {/* Trash */}
        {view === 'trash' && (
          <>
            <p className="trash-note">{t('dashboard.trashNote')}</p>
            {trashLoading && <p>Loading...</p>}
            {!trashLoading && trashedProjects.length === 0 && (
              <p className="empty-state">{t('dashboard.noTrashedProjects')}</p>
            )}
            {!trashLoading && trashedProjects.length > 0 && (
              <ul className="project-list">
                {trashedProjects.map((p) => {
                  const days = daysRemaining(p.deleted_at);
                  return (
                    <li key={p.id} className="project-item project-item-trashed">
                      <span className="project-name">{p.name}</span>
                      <span className="project-days-left">
                        {days} {t('dashboard.daysLeft')}
                      </span>
                      <span className="project-meta">
                        Tier {p.tier} · {t('dashboard.deletedAt')}: {new Date(p.deleted_at).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        className="restore-project-btn"
                        onClick={(e) => handleRestoreProject(e, p.id)}
                      >
                        {t('dashboard.restore')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
