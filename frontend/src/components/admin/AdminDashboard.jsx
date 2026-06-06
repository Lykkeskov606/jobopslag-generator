import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import TopBar from '../TopBar';
import { BusinessTab } from './tabs/BusinessTab';
import { OperationalTab } from './tabs/OperationalTab';
import { ProductTab } from './tabs/ProductTab';
import { ProjectsTab } from './tabs/ProjectsTab';

const TABS = ['business', 'operational', 'product', 'projects'];
const DAY_OPTIONS = [7, 30, 90];

export function AdminDashboard() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('business');
  const [days, setDays] = useState(30);

  return (
    <div className="app">
      <TopBar active="admin" />
      <div className="admin-dashboard">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/dashboard" className="link-back" style={{ fontSize: 14 }}>
            <span className="arrow">←</span> {t('nav.backToApp')}
          </Link>
          <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Admin</span>
        </div>
        <h1>{t('admin.title')}</h1>
        <div className="date-range-selector">
          <span>{t('admin.dateRange.label')}:</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              className={days === d ? 'active' : ''}
              onClick={() => setDays(d)}
            >
              {t(`admin.dateRange.${d}d`)}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`admin.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'business' && <BusinessTab days={days} />}
        {activeTab === 'operational' && <OperationalTab days={days} />}
        {activeTab === 'product' && <ProductTab days={days} />}
        {activeTab === 'projects' && <ProjectsTab />}
      </div>
    </div>
    </div>
  );
}
