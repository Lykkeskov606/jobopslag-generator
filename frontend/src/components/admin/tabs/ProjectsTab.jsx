import { useEffect, useState } from 'react';
import api from '../../../lib/api';

export function ProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/admin/projects')
      .then((res) => setProjects(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete project "${name}"?\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || 'Unknown error'));
    }
  }

  const visible = filter
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          p.owner_email.toLowerCase().includes(filter.toLowerCase())
      )
    : projects;

  if (loading) return <p>Loading...</p>;

  return (
    <div className="admin-tab">
      <div className="admin-projects-header">
        <h3>All projects ({projects.length})</h3>
        <input
          type="text"
          className="admin-search"
          placeholder="Filter by name or owner…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr><td colSpan={6}>{filter ? 'No matches' : 'No projects'}</td></tr>
          )}
          {visible.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="admin-owner-email">{p.owner_email}</td>
              <td>Tier {p.tier}</td>
              <td><span className={`project-status status-${p.status}`}>{p.status}</span></td>
              <td>{new Date(p.updated_at).toLocaleDateString()}</td>
              <td>
                <button
                  type="button"
                  className="admin-delete-btn"
                  onClick={() => handleDelete(p.id, p.name)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
