import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/TopBar';
import api from '../lib/api';

function daysRemaining(deletedAt) {
  const expiry = new Date(new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DashboardPage() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [filter, setFilter]                 = useState('all'); // 'all' | 'draft' | 'done' | 'trash'
  const [projects, setProjects]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [trashLoading, setTrashLoading]     = useState(false);
  const [trashLoaded, setTrashLoaded]       = useState(false);

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
      const name = tier === 1 ? 'Hurtigt opslag' : 'Fuldt rekrutteringsforløb';
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
                ? <>Hej, {user.email.split('@')[0]}.</>
                : 'Dine projekter.'}
            </h1>
            <div className="summary">
              <strong>{projects.length}</strong>
              opslag i alt
              {doneCount > 0 && (
                <>, <strong style={{ display: 'inline' }}>{doneCount}</strong> færdige</>
              )}
              {isAdmin && (
                <>
                  <br />
                  <button
                    className="link-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => navigate('/admin')}
                  >
                    Admin →
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tier cards */}
          <div className="tier-row">
            <div className="tier-card t1" onClick={() => startProject(1)}>
              <div className="label">Tier 1 · Hurtigt opslag</div>
              <h3>Jobopslag på 3 min.</h3>
              <div className="stat">
                <span className="num">5–10</span>
                punkter om rollen
              </div>
              <p>
                Du beskriver rollen med korte punkter. Vi udfordrer klichéer og kønsskævheder
                i realtid og genererer et færdigt opslag på dansk eller engelsk.
              </p>
              <div className="deliverables">
                <span className="pill">2 varianter</span>
                <span className="pill">.docx download</span>
                <span className="pill">Bias-tjek</span>
              </div>
              <div className="btn-row">
                <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); startProject(1); }}>
                  Nyt opslag <span className="arrow">→</span>
                </button>
                <span className="micro">{draftCount} kladde{draftCount !== 1 ? 'r' : ''}</span>
              </div>
            </div>

            <div className="tier-card t2">
              <div className="label">Tier 2 · Fuldt forløb</div>
              <h3>Komplet rekruttering.</h3>
              <div className="stat">
                <span className="num">+</span>
                stillingsbeskrivelse, screeningkriterier
              </div>
              <p>
                Inkluderer kompetenceprofil, screenigkriterier og interviewguide — alt hvad
                du behøver til en hel rekrutteringsproces.
              </p>
              <div className="deliverables">
                <span className="pill">Kompetenceprofil</span>
                <span className="pill">Screeningkriterier</span>
                <span className="pill">Interviewguide</span>
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-on-dark"
                  onClick={(e) => { e.stopPropagation(); startProject(2); }}
                >
                  Nyt forløb <span className="arrow">→</span>
                </button>
                <span className="micro">Kommer snart</span>
              </div>
            </div>
          </div>

          {/* Project list */}
          <section className="recent">
            <div className="recent-head">
              <h2>Seneste projekter</h2>
              <div className="filter">
                <button
                  className={filter === 'all' ? 'active' : ''}
                  onClick={() => setFilter('all')}
                >
                  Alle
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'draft' ? 'active' : ''}
                  onClick={() => setFilter('draft')}
                >
                  Kladder
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'done' ? 'active' : ''}
                  onClick={() => setFilter('done')}
                >
                  Færdige
                </button>
                <span className="sep">·</span>
                <button
                  className={filter === 'trash' ? 'active' : ''}
                  onClick={loadTrash}
                >
                  Papirkurv
                </button>
              </div>
            </div>

            {showSpinner && (
              <div className="dash-empty">Henter…</div>
            )}

            {!showSpinner && rows.length === 0 && (
              <div className="dash-empty">
                {filter === 'trash'
                  ? 'Papirkurven er tom.'
                  : filter === 'draft'
                  ? 'Ingen kladder.'
                  : filter === 'done'
                  ? 'Ingen færdige opslag endnu.'
                  : 'Ingen projekter endnu — opret dit første ovenfor.'}
              </div>
            )}

            {!showSpinner && rows.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Format</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>
                      {filter === 'trash' ? 'Slettes om' : 'Opdateret'}
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
                        <span className="t-title">{p.name}</span>
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
                            Gendan
                          </button>
                        ) : (
                          <span className="status">
                            <span className={`dot ${p.status === 'completed' ? 'done' : 'draft'}`} />
                            {p.status === 'completed' ? 'Færdig' : 'Kladde'}
                          </span>
                        )}
                      </td>
                      <td>
                        {filter === 'trash' ? (
                          <span style={{ fontSize: 13 }}>
                            {daysRemaining(p.deleted_at)} dag{daysRemaining(p.deleted_at) !== 1 ? 'e' : ''}
                          </span>
                        ) : (
                          <>
                            <span style={{ marginRight: 16 }}>{fmtDate(p.updated_at)}</span>
                            <button
                              className="delete-project-btn"
                              onClick={(e) => handleDeleteProject(e, p.id, p.name)}
                              title="Slet projekt"
                            >
                              Slet
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
