import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

export function ProductTab({ days }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/product?days=${days}`)
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError(t('errors.generic')))
      .finally(() => setLoading(false));
  }, [days, t]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!data) return null;

  return (
    <div className="admin-tab">
      <h3>Output quality</h3>
      <div className="stat-grid">
        <Stat label={t('admin.product.downloadRate')} value={`${data.output_quality.download_rate_pct ?? 0}%`} />
        <Stat label="Downloaded" value={data.output_quality.downloaded} />
        <Stat label="Total projects" value={data.output_quality.total} />
      </div>

      <h3>{t('admin.product.biasRules')}</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Triggers</th>
            <th>Resolved</th>
            <th>Ignored</th>
            <th>{t('admin.product.resolveRate')}</th>
          </tr>
        </thead>
        <tbody>
          {data.bias_stats.length === 0 && (
            <tr><td colSpan={5}>No bias violations recorded yet</td></tr>
          )}
          {data.bias_stats.map((r, i) => (
            <tr key={i}>
              <td>{r.rule_triggered}</td>
              <td>{r.total_triggers}</td>
              <td>{r.resolved}</td>
              <td>{r.ignored}</td>
              <td>{r.resolve_rate_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('admin.product.funnelDropoff')} (Tier 2)</h3>
      <table className="admin-table">
        <thead>
          <tr><th>Step</th><th>Projects at step</th><th>Median minutes</th></tr>
        </thead>
        <tbody>
          {data.funnel.length === 0 && (
            <tr><td colSpan={3}>No Tier 2 projects yet</td></tr>
          )}
          {data.funnel.map((row, i) => (
            <tr key={i}>
              <td>{row.completion_step}</td>
              <td>{row.projects_at_step}</td>
              <td>{row.median_minutes ?? '—'}</td>
            </tr>
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
