import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function AdminPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!isAdmin) {
    navigate('/dashboard');
    return null;
  }

  return (
    <ErrorBoundary>
      <AdminDashboard />
    </ErrorBoundary>
  );
}
