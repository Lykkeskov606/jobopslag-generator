import { useTranslation } from 'react-i18next';

/**
 * Inline challenge card shown below a bullet or note input.
 * Props:
 *   challenge  — {type, text, citation, suggestion, source}
 *   language   — 'da' | 'en' (output language, kept for future use)
 *   onAccept(suggestion) — replace the bullet/note with suggestion
 *   onDismiss()          — hide this challenge
 */
export function BulletChallengeCard({ challenge, onAccept, onDismiss, language }) {
  const { t } = useTranslation();
  const isEvidence = challenge.type === 'evidence';

  return (
    <div className="challenge">
      <div className="c-head">
        <span className={`c-label${!isEvidence ? ' precise' : ''}`}>
          {isEvidence ? t('challenge.evidence') : t('challenge.qualify')}
        </span>
      </div>

      <p className="c-problem">{challenge.text}</p>

      {isEvidence && challenge.citation && (
        <p className="c-cite">{challenge.citation}</p>
      )}

      {challenge.suggestion && (
        <div className="c-suggest">
          <span className="tag">{t('challenge.suggestion')}</span>
          <span className="text">{challenge.suggestion}</span>
        </div>
      )}

      <div className="c-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onAccept(challenge.suggestion)}
        >
          {t('challenge.accept')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDismiss}
        >
          {t('challenge.dismiss')}
        </button>
      </div>
    </div>
  );
}
