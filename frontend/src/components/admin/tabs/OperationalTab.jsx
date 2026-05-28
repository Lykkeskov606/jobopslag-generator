import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

export function OperationalTab({ days }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/operational?days=${days}`)
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError(t('errors.generic')))
      .finally(() => setLoading(false));
  }, [days, t]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!data) return null;

  const lat = data.latency;

  return (
    <div className="admin-tab">
      <h3>AI Latency</h3>
      <div className="stat-grid">
        <Stat label={t('admin.operational.latencyP50')} value={lat?.p50 ? `${Math.round(lat.p50)}ms` : '—'} />
        <Stat label={t('admin.operational.latencyP95')} value={lat?.p95 ? `${Math.round(lat.p95)}ms` : '—'} />
        <Stat label="P99" value={lat?.p99 ? `${Math.round(lat.p99)}ms` : '—'} />
        <Stat label="Avg" value={lat?.avg_ms ? `${Math.round(lat.avg_ms)}ms` : '—'} />
      </div>

      <h3>AI Cost by Output Type</h3>
      <table className="admin-table">
        <thead>
          <tr><th>Output type</th><th>Total (DKK)</th><th>Avg (øre)</th><th>Calls</th></tr>
        </thead>
        <tbody>
          {data.ai_cost.map((row, i) => (
            <tr key={i}>
              <td>{row.output_type || 'unknown'}</td>
              <td>{((row.total_cost_cents || 0) / 100).toFixed(2)}</td>
              <td>{row.avg_cost_cents ?? '—'}</td>
              <td>{row.total_calls}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('admin.operational.topErrors')}</h3>
      <table className="admin-table">
        <thead>
          <tr><th>Error</th><th>Occurrences</th></tr>
        </thead>
        <tbody>
          {data.top_errors.length === 0 && (
            <tr><td colSpan={2}>No errors recorded</td></tr>
          )}
          {data.top_errors.map((e, i) => (
            <tr key={i}><td>{e.error_type}</td><td>{e.occurrences}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
