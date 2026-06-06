const STRINGS = {
  da: {
    evidence:     'Forskning',
    qualification:'Præcisér',
    suggestion:   'Forslag',
    accept:       'Brug forslaget',
    dismiss:      'Behold min formulering',
  },
  en: {
    evidence:     'Research',
    qualification:'Clarify',
    suggestion:   'Suggestion',
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
    <div className="challenge">
      <div className="c-head">
        <span className={`c-label${!isEvidence ? ' precise' : ''}`}>
          {isEvidence ? t.evidence : t.qualification}
        </span>
      </div>

      <p className="c-problem">{challenge.text}</p>

      {isEvidence && challenge.citation && (
        <p className="c-cite">{challenge.citation}</p>
      )}

      {challenge.suggestion && (
        <div className="c-suggest">
          <span className="tag">{t.suggestion}</span>
          <span className="text">{challenge.suggestion}</span>
        </div>
      )}

      <div className="c-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onAccept(challenge.suggestion)}
        >
          {t.accept}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDismiss}
        >
          {t.dismiss}
        </button>
      </div>
    </div>
  );
}
