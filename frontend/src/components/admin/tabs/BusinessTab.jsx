import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

export function BusinessTab({ days }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/business?days=${days}`)
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError(t('errors.generic')))
      .finally(() => setLoading(false));
  }, [days, t]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!data) return null;

  const mrrDKK = (data.mrr_cents / 100).toFixed(0);

  return (
    <div className="admin-tab">
      <div className="stat-grid">
        <Stat label={t('admin.business.totalUsers')} value={data.users.total_users} />
        <Stat label={t('admin.business.activeUsers')} value={data.users.active_users} />
        <Stat label={t('admin.business.newSignups')} value={data.users.new_signups} />
        <Stat label={t('admin.business.paidUsers')} value={data.users.paid_users} />
        <Stat label={t('admin.business.mrr')} value={`${mrrDKK} DKK`} />
        <Stat label={t('admin.business.totalProjects')} value={data.projects.total} />
        <Stat label="Tier 1 projects" value={data.projects.tier1} />
        <Stat label="Tier 2 projects" value={data.projects.tier2} />
        <Stat label={t('admin.business.completionRate')} value={`${data.projects.completion_rate_pct}%`} />
        <Stat label="Output language DA" value={data.projects.lang_da} />
        <Stat label="Output language EN" value={data.projects.lang_en} />
      </div>

      <h3>{t('admin.business.topUsers')}</h3>
      <table className="admin-table">
        <thead>
          <tr><th>Email</th><th>Projects</th></tr>
        </thead>
        <tbody>
          {data.top_users.map((u) => (
            <tr key={u.id}><td>{u.email}</td><td>{u.project_count}</td></tr>
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
