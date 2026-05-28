import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BusinessTab } from './tabs/BusinessTab';
import { OperationalTab } from './tabs/OperationalTab';
import { ProductTab } from './tabs/ProductTab';

const TABS = ['business', 'operational', 'product'];
const DAY_OPTIONS = [7, 30, 90];

export function AdminDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('business');
  const [days, setDays] = useState(30);

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
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
      </div>
    </div>
  );
}
