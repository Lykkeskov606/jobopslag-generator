import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="not-found-page">
      <h1>404</h1>
      <p>{t('errors.notFound')}</p>
      <button onClick={() => navigate('/')}>Go home</button>
    </div>
  );
}
