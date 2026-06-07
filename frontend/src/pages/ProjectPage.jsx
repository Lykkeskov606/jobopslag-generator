import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Tier1Page } from './Tier1Page';
import { Tier2Page } from './Tier2Page';
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
        if (err.response?.status === 404) setError('not_found');
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

  if (error === 'not_found') {
    return (
      <div className="project-loading">
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Projekt ikke fundet</p>
        <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>
          Opslaget eksisterer ikke, eller er blevet slettet. Tjek papirkurven på dashboardet.
        </p>
        <button className="link-btn" onClick={() => navigate('/dashboard')}>← Tilbage til dashboard</button>
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
        <Tier2Page project={project} />
      )}
    </ErrorBoundary>
  );
}
