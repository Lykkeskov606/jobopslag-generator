import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

function scorePassword(v) {
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-ZÆØÅ]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  return score;
}

const STRENGTH_LABELS = [
  'Brug mindst 8 tegn med tal og store bogstaver',
  'Svag adgangskode',
  'Nogenlunde — tilføj tal eller symboler',
  'God adgangskode',
  'Stærk adgangskode',
];

export function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const score = scorePassword(password);
  const strengthClass = password ? ` s${Math.max(1, score)}` : '';
  const strengthLabel = password ? STRENGTH_LABELS[score] : STRENGTH_LABELS[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Adgangskoden skal være mindst 8 tegn.');
      return;
    }
    if (password !== password2) {
      setError('Adgangskoderne stemmer ikke overens.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Oprettelse mislykkedes. Prøv igen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="head">
        <div className="eyebrow">Opret konto</div>
        <h2>Start gratis</h2>
        <p>
          Har du allerede en konto?{' '}
          <button type="button" className="link-act" onClick={onSwitchToLogin}>
            Log ind
          </button>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <p className="error-text">{error}</p>}

        <div className="field">
          <label htmlFor="rf-email">Arbejds-e-mail</label>
          <input
            className="input"
            id="rf-email"
            type="email"
            placeholder="navn@virksomhed.dk"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="rf-pw">Adgangskode</label>
          <input
            className="input"
            id="rf-pw"
            type="password"
            placeholder="Mindst 8 tegn"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className={`strength${strengthClass}`}>
            <span className="seg" />
            <span className="seg" />
            <span className="seg" />
            <span className="seg" />
          </div>
          <div className="strength-label">{strengthLabel}</div>
        </div>

        <div className="field">
          <label htmlFor="rf-pw2">Gentag adgangskode</label>
          <input
            className="input"
            id="rf-pw2"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />
        </div>

        <button
          className="btn btn-primary btn-lg btn-block"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Opretter…' : <>Opret konto <span className="arrow">→</span></>}
        </button>
      </form>

      <div className="legal">
        Ved at oprette en konto accepterer du vores{' '}
        <a href="#">vilkår</a> og{' '}
        <a href="#">privatlivspolitik</a>.
      </div>
    </div>
  );
}
