import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/auth/RegisterForm';
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm';

// TODO: Erstat med rigtige data fra admin-dashboard
// når tilstrækkelig brugsdata er tilgængelig
const STATS = {
  reducedBiasPercent: 34,  // placeholder
  minutesToComplete: 3,    // placeholder
  tagline: 'fra titel til færdigt opslag',
};

function LoginAside() {
  return (
    <>
      <div className="pitch">
        <div className="eyebrow">Evidensbaseret rekruttering</div>
        <h1>
          Skriv opslag der<br />
          tiltrækker de <em>rigtige</em><br />
          kandidater.
        </h1>
        <p>
          Vores AI udfordrer klichéer og kønsskævheder i realtid —
          mens du skriver, ikke bagefter.
        </p>
      </div>

      <div className="proof">
        <div className="stat">
          <span className="n">−{STATS.reducedBiasPercent} %</span>
          <span className="l">færre kønsskæve formuleringer</span>
        </div>
        <div className="stat">
          <span className="n">{STATS.minutesToComplete} min.</span>
          <span className="l">{STATS.tagline}</span>
        </div>
      </div>
    </>
  );
}

function RegisterAside() {
  return (
    <>
      <div className="pitch">
        <div className="eyebrow">Kom i gang på et minut</div>
        <h1>
          Bedre opslag,<br />
          fra <em>første</em> udkast.
        </h1>
        <ul className="checks">
          <li>
            <span className="ic">✓</span>
            <span className="tx">
              <strong>Evidensbaseret sparring</strong> mens du skriver — ikke bagefter
            </span>
          </li>
          <li>
            <span className="ic">✓</span>
            <span className="tx">
              <strong>Dansk og engelsk</strong> output fra samme input
            </span>
          </li>
          <li>
            <span className="ic">✓</span>
            <span className="tx">
              <strong>Færdige .docx-filer</strong> der følger jeres egen skabelon
            </span>
          </li>
        </ul>
      </div>
      <div />
    </>
  );
}

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const navigate = useNavigate();

  return (
    <div className="s-auth">
      <div className="auth">
        <aside className="auth-aside">
          <a className="brand" href="/">
            <span className="mark">j</span>
            <span className="name">Jobopslag<sup>v1.5</sup></span>
          </a>

          {mode === 'register' ? <RegisterAside /> : <LoginAside />}

          <span className="mark-bg" aria-hidden="true">j</span>
        </aside>

        <main className="auth-main">
          {mode === 'login' && (
            <LoginForm
              onSuccess={() => navigate('/dashboard')}
              onSwitchToRegister={() => setMode('register')}
              onForgotPassword={() => setMode('forgot')}
            />
          )}
          {mode === 'register' && (
            <RegisterForm
              onSuccess={() => navigate('/dashboard')}
              onSwitchToLogin={() => setMode('login')}
            />
          )}
          {mode === 'forgot' && (
            <ForgotPasswordForm onBack={() => setMode('login')} />
          )}
        </main>
      </div>
    </div>
  );
}
