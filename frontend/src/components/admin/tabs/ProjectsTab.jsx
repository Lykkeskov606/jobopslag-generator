import { useEffect, useState } from 'react';
import api from '../../../lib/api';

const FILTERS = ['active', 'deleted', 'all'];

export function ProjectsTab() {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('active');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/projects?filter=${filter}`)
      .then((res) => setProjects(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete project "${name}"?\n\nMoves to trash (7-day recovery window).`)) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || 'Unknown error'));
    }
  }

  async function handleRestore(id, name) {
    if (!window.confirm(`Restore project "${name}"?`)) return;
    try {
      await api.patch(`/admin/projects/${id}/restore`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Restore failed: ' + (err.response?.data?.error || 'Unknown error'));
    }
  }

  const visible = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.owner_email.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  if (loading) return <p>Loading...</p>;

  const showDeletedCol = filter !== 'active';

  return (
    <div className="admin-tab">
      <div className="admin-projects-header">
        <h3>All projects ({projects.length})</h3>
        <div className="admin-projects-controls">
          <div className="admin-filter-tabs">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`admin-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="admin-search"
            placeholder="Filter by name or owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Updated</th>
            {showDeletedCol && <th>Deleted</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr><td colSpan={showDeletedCol ? 7 : 6}>{search ? 'No matches' : 'No projects'}</td></tr>
          )}
          {visible.map((p) => (
            <tr key={p.id} className={p.deleted_at ? 'row-deleted' : ''}>
              <td>{p.name}</td>
              <td className="admin-owner-email">{p.owner_email}</td>
              <td>Tier {p.tier}</td>
              <td><span className={`project-status status-${p.status}`}>{p.status}</span></td>
              <td>{new Date(p.updated_at).toLocaleDateString()}</td>
              {showDeletedCol && (
                <td>{p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : '—'}</td>
              )}
              <td>
                {p.deleted_at ? (
                  <button
                    type="button"
                    className="admin-restore-btn"
                    onClick={() => handleRestore(p.id, p.name)}
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-delete-btn"
                    onClick={() => handleDelete(p.id, p.name)}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
