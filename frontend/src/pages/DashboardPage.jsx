import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/TopBar';
import api from '../lib/api';

function daysRemaining(deletedAt) {
  const expiry = new Date(new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

function fmtDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DashboardPage() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [filter, setFilter]                 = useState('all');
  const [projects, setProjects]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [trashLoading, setTrashLoading]     = useState(false);
  const [trashLoaded, setTrashLoaded]       = useState(false);

  const locale = i18n.language === 'da' ? 'da-DK' : 'en-GB';

  useEffect(() => {
    api.get('/projects')
      .then((res) => setProjects(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function loadTrash() {
    if (trashLoaded) { setFilter('trash'); return; }
    setFilter('trash');
    setTrashLoading(true);
    api.get('/projects/trash')
      .then((res) => { setTrashedProjects(res.data); setTrashLoaded(true); })
      .catch(() => {})
      .finally(() => setTrashLoading(false));
  }

  async function startProject(tier) {
    try {
      const { data } = await api.post('/projects', { name: t('dashboard.untitled'), tier });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteProject(e, id, name) {
    e.stopPropagation();
    if (!window.confirm(t('dashboard.confirmDelete', { name }))) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert(t('dashboard.deleteFailure'));
    }
  }

  async function handleRestoreProject(e, id) {
    e.stopPropagation();
    try {
      await api.patch(`/projects/${id}/restore`);
      setTrashedProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert(t('dashboard.restoreFailure'));
    }
  }

  const draftCount = projects.filter((p) => p.status === 'draft').length;
  const doneCount  = projects.filter((p) => p.status === 'completed').length;

  function visibleProjects() {
    if (filter === 'trash') return trashedProjects;
    if (filter === 'draft') return projects.filter((p) => p.status === 'draft');
    if (filter === 'done')  return projects.filter((p) => p.status === 'completed');
    return projects;
  }

  const rows = visibleProjects();
  const showSpinner = (filter === 'trash' && trashLoading) || (filter !== 'trash' && loading);

  return (
    <div className="app s-dashboard">
      <TopBar active="projects" />

      <main>
        <div className="dash">
          {/* Hero */}
          <div className="dash-hero">
            <h1>
              {user?.email
                ? t('dashboard.greeting', { name: user.email.split('@')[0] })
                : t('dashboard.greeting_no_name')}
            </h1>
            <div className="summary">
              <strong>{projects.length}</strong>
              {' '}{t('dashboard.projectsTotal')}
              {doneCount > 0 && (
                <>, <strong style={{ display: 'inline' }}>{doneCount}</strong> {t('dashboard.completedCount')}</>
              )}
              {isAdmin && (
                <>
                  <br />
                  <button
                    className="link-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => navigate('/admin')}
                  >
                    {t('dashboard.adminLink')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tier cards */}
          <div className="tier-row">
            <div className="tier-card t1" onClick={() => startProject(1)}>
              <div className="label">{t('dashboard.tier1Label')}</div>
              <h3>{t('dashboard.tier1Title')}</h3>
              <div className="stat">
                <span className="num">5–10</span>
                {t('dashboard.tier1StatUnit')}
              </div>
              <p>{t('dashboard.tier1Desc')}</p>
              <div className="deliverables">
                <span className="pill">{t('dashboard.tier1Deliverable1')}</span>
                <span className="pill">{t('dashboard.tier1Deliverable2')}</span>
                <span className="pill">{t('dashboard.tier1Deliverable3')}</span>
              </div>
              <div className="btn-row">
                <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); startProject(1); }}>
                  {t('dashboard.tier1Cta')} <span className="arrow">→</span>
                </button>
                <span className="micro">
                  {t('dashboard.tier1DraftCount', { count: draftCount })}
                </span>
              </div>
            </div>

            <div className="tier-card t2">
              <div className="label">{t('dashboard.tier2Label')}</div>
              <h3>{t('dashboard.tier2Title')}</h3>
              <div className="stat">
                <span className="num">+</span>
                {t('dashboard.tier2StatUnit')}
              </div>
              <p>{t('dashboard.tier2Desc')}</p>
              <div className="deliverables">
                <span className="pill">{t('dashboard.tier2Deliverable1')}</span>
                <span className="pill">{t('dashboard.tier2Deliverable2')}</span>
                <span className="pill">{t('dashboard.tier2Deliverable3')}</span>
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-on-dark"
                  onClick={(e) => { e.stopPropagation(); startProject(2); }}
                >
                  {t('dashboard.tier2Cta')} <span className="arrow">→</span>
                </button>
                <span className="micro">{t('dashboard.tier2ComingSoon')}</span>
              </div>
            </div>
          </div>

          {/* Project list */}
          <section className="recent">
            <div className="recent-head">
              <h2>{t('dashboard.recentProjects')}</h2>
              <div className="filter">
                <button
                  className={filter === 'all' ? 'active' : ''}
                  onClick={() => setFilter('all')}
                >
                  {t('dashboard.filterAll')}
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'draft' ? 'active' : ''}
                  onClick={() => setFilter('draft')}
                >
                  {t('dashboard.filterDrafts')}
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'done' ? 'active' : ''}
                  onClick={() => setFilter('done')}
                >
                  {t('dashboard.filterDone')}
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'trash' ? 'active' : ''}
                  onClick={loadTrash}
                >
                  {t('dashboard.filterTrash')}
                </button>
              </div>
            </div>

            {showSpinner && (
              <div className="dash-empty">{t('dashboard.loadingText')}</div>
            )}

            {!showSpinner && rows.length === 0 && (
              <div className="dash-empty">
                {filter === 'trash'   ? t('dashboard.emptyTrash')
                : filter === 'draft'  ? t('dashboard.emptyDrafts')
                : filter === 'done'   ? t('dashboard.emptyDone')
                : t('dashboard.emptyAll')}
              </div>
            )}

            {!showSpinner && rows.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('dashboard.colTitle')}</th>
                    <th>{t('dashboard.colFormat')}</th>
                    <th>{t('dashboard.colStatus')}</th>
                    <th style={{ textAlign: 'right' }}>
                      {filter === 'trash' ? t('dashboard.colExpiry') : t('dashboard.colUpdated')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => filter !== 'trash' && navigate(`/projects/${p.id}`)}
                      style={filter === 'trash' ? { cursor: 'default' } : undefined}
                    >
                      <td>
                        <span className="t-title">{p.name || t('dashboard.untitled')}</span>
                      </td>
                      <td>
                        <span className="t-tag">
                          Tier {p.tier} · {(p.output_language || 'da').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {filter === 'trash' ? (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            onClick={(e) => handleRestoreProject(e, p.id)}
                          >
                            {t('dashboard.restoreBtn')}
                          </button>
                        ) : (
                          <span className="status">
                            <span className={`dot ${p.status === 'completed' ? 'done' : 'draft'}`} />
                            {p.status === 'completed'
                              ? t('dashboard.status.completed')
                              : t('dashboard.status.draft')}
                          </span>
                        )}
                      </td>
                      <td>
                        {filter === 'trash' ? (
                          <span style={{ fontSize: 13 }}>
                            {t('dashboard.day', { count: daysRemaining(p.deleted_at) })}
                          </span>
                        ) : (
                          <>
                            <span style={{ marginRight: 16 }}>{fmtDate(p.updated_at, locale)}</span>
                            <button
                              className="delete-project-btn"
                              onClick={(e) => handleDeleteProject(e, p.id, p.name)}
                              title={t('dashboard.deleteBtn')}
                            >
                              {t('dashboard.deleteBtn')}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
