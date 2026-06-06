import { useState } from 'react';
import api from '../../lib/api';

export function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      // Always show the same success message to avoid email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="auth-card">
        <div className="head">
          <div className="eyebrow">Nulstil adgangskode</div>
          <h2>Tjek din indbakke</h2>
          <p>Har du allerede en konto? <button type="button" className="link-act" onClick={onBack}>Log ind</button></p>
        </div>
        <div className="auth-notice success-notice">
          Vi har sendt et nulstillingslink til <strong>{email}</strong>. Linket er gyldigt i 30 minutter.
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={onBack}
        >
          ← Tilbage til login
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="head">
        <div className="eyebrow">Nulstil adgangskode</div>
        <h2>Glemt adgangskode?</h2>
        <p>Husk den alligevel? <button type="button" className="link-act" onClick={onBack}>Log ind</button></p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="fp-email">E-mail</label>
          <input
            className="input"
            id="fp-email"
            type="email"
            placeholder="navn@virksomhed.dk"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button
          className="btn btn-primary btn-lg btn-block"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Sender…' : <>Send nulstillingslink <span className="arrow">→</span></>}
        </button>
      </form>
    </div>
  );
}
