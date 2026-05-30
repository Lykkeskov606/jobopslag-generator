import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Tier1Page } from './Tier1Page';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then((res) => setProject(res.data))
      .catch((err) => {
        if (err.response?.status === 404) navigate('/dashboard', { replace: true });
        else setError('Failed to load project.');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="project-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-loading">
        <p className="error-text">{error}</p>
        <button className="link-btn" onClick={() => navigate('/dashboard')}>← Dashboard</button>
      </div>
    );
  }

  if (!project) return null;

  return (
    <ErrorBoundary>
      {project.tier === 1 ? (
        <Tier1Page project={project} />
      ) : (
        <div style={{ padding: '2rem' }}>
          <button className="link-btn" onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <h2 style={{ marginTop: '1rem' }}>Full Recruitment Project — coming soon</h2>
        </div>
      )}
    </ErrorBoundary>
  );
}
