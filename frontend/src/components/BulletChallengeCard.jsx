const STRINGS = {
  da: {
    evidence:     'Forskning',
    qualification:'Præcisér',
    suggestion:   'Foreslået omformulering:',
    accept:       'Brug forslaget',
    dismiss:      'Behold min formulering',
  },
  en: {
    evidence:     'Research',
    qualification:'Clarify',
    suggestion:   'Suggested reformulation:',
    accept:       'Use suggestion',
    dismiss:      'Keep mine',
  },
};

/**
 * Inline challenge card shown below a bullet or note input.
 * Props:
 *   challenge  — {type, text, citation, suggestion, source}
 *   language   — 'da' | 'en'
 *   onAccept(suggestion) — replace the bullet/note with suggestion
 *   onDismiss()          — hide this challenge
 */
export function BulletChallengeCard({ challenge, onAccept, onDismiss, language }) {
  const t = STRINGS[language === 'en' ? 'en' : 'da'];
  const isEvidence = challenge.type === 'evidence';

  return (
    <div className={`bullet-challenge-card bullet-challenge-${challenge.type}`}>
      <div className="bullet-challenge-header">
        <span className={`bullet-challenge-badge badge-type-${challenge.type}`}>
          {isEvidence ? '🔬' : '💭'} {isEvidence ? t.evidence : t.qualification}
        </span>
        <p className="bullet-challenge-text">{challenge.text}</p>
      </div>

      {isEvidence && challenge.citation && (
        <p className="bullet-challenge-citation">{challenge.citation}</p>
      )}

      {challenge.suggestion && (
        <div className="bullet-challenge-suggestion">
          <span className="bullet-challenge-suggestion-label">{t.suggestion}</span>
          <span className="bullet-challenge-suggestion-text">{challenge.suggestion}</span>
        </div>
      )}

      <div className="bullet-challenge-actions">
        <button
          type="button"
          className="btn-accept-suggestion"
          onClick={() => onAccept(challenge.suggestion)}
        >
          {t.accept}
        </button>
        <button
          type="button"
          className="btn-dismiss-challenge"
          onClick={onDismiss}
        >
          {t.dismiss}
        </button>
      </div>
    </div>
  );
}
