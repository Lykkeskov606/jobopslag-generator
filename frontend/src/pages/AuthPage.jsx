import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/auth/RegisterForm';

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      {mode === 'login' ? (
        <LoginForm
          onSuccess={() => navigate('/dashboard')}
          onSwitchToRegister={() => setMode('register')}
        />
      ) : (
        <RegisterForm
          onSuccess={() => navigate('/dashboard')}
          onSwitchToLogin={() => setMode('login')}
        />
      )}
    </div>
  );
}
