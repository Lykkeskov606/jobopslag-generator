import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { runCompletenessCheck } from '../lib/completenessRules.js';
import { useBulletChallenges } from '../hooks/useBulletChallenges.js';
import { BulletChallengeCard } from './BulletChallengeCard.jsx';
import Steps from './Steps.jsx';

/**
 * Completeness micro-step between form input and AI generation.
 * Analyses bullets for missing elements and shows per-note challenges.
 *
 * Props:
 *   jobTitle, bullets, location, workMode  — current form values
 *   language                               — 'da' | 'en' (output language)
 *   projectId                              — for the challenge API call
 *   onBack()                               — go back to edit the input form
 *   onProceed(extraBullets)               — proceed with optional extra context
 */
export function InputCompletenessCheck({
  jobTitle, bullets, location, workMode = '', department = '', teamComposition = '', language, projectId,
  onBack, onProceed,
  steps: stepsProp = null,
  excludeIds = [],
  titleOverride = null,
  subtitleOverride = null,
}) {
  const { t, i18n } = useTranslation();
  const lang = language === 'en' ? 'en' : 'da';
  const allMissing = runCompletenessCheck({ jobTitle, bullets, location, workMode, department, teamComposition, language });
  const missing = excludeIds.length ? allMissing.filter((c) => !excludeIds.includes(c.id)) : allMissing;

  const [notes, setNotes]     = useState({});
  const [skipped, setSkipped] = useState(new Set());

  const noteValues = missing.map((check) => {
    const value = notes[check.id] || '';
    if (!value.trim()) return '';
    return `${check.label[lang]}: ${value}`;
  });

  const {
    challengeMap: noteChallengeMap,
    loadingIndices: noteLoadingIndices,
    dismiss: dismissNoteChallenge,
    markApproved: markNoteApproved,
  } = useBulletChallenges({
    projectId,
    jobTitle,
    bullets: noteValues,
    language,
    debounceMs: 1800,
  });

  function acceptNoteChallenge(noteIndex, suggestion) {
    const check = missing[noteIndex];
    if (check && suggestion?.trim()) {
      const labeledSuggestion = `${check.label[lang]}: ${suggestion.trim()}`;
      markNoteApproved(noteIndex, labeledSuggestion);
      setNoteValue(check.id, suggestion.trim());
    }
    dismissNoteChallenge(noteIndex);
  }

  function toggleSkip(id) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setNoteValue(id, value) {
    setNotes((prev) => ({ ...prev, [id]: value }));
  }

  const filledNotes = Object.entries(notes).filter(([id, v]) => v.trim() && !skipped.has(id));
  const addressedCount = filledNotes.length;

  function proceed() {
    const extraBullets = filledNotes.map(([id, text]) => {
      const check = missing.find((c) => c.id === id);
      const label = check?.label[lang] ?? id;
      return `${label}: ${text.trim()}`;
    });
    onProceed(extraBullets, { skippedIds: [...skipped] });
  }

  const progressPct = missing.length > 0
    ? Math.round((addressedCount / missing.length) * 100)
    : 100;

  const defaultSteps = [
    { label: t('steps.input'), state: 'done' },
    { label: t('steps.check'), state: 'active', n: 2 },
    { label: t('steps.generate'), state: 'default', n: 3 },
    { label: t('steps.download'), state: 'default', n: 4 },
  ];
  const steps = stepsProp ?? defaultSteps;

  let generateLabel;
  if (noteLoadingIndices.size > 0) {
    generateLabel = t('completeness.checking');
  } else if (missing.length === 0) {
    generateLabel = t('completeness.generateReady');
  } else if (addressedCount > 0) {
    generateLabel = t('completeness.generateWith', { count: addressedCount });
  } else {
    generateLabel = t('completeness.generateAnyway');
  }

  return (
    <div className="work">
      {/* Back + steps */}
      <div className="work-top">
        <button type="button" className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t('completeness.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={steps} />
        </div>
      </div>

      {/* Intro */}
      <section className="intro">
        <div className="eyebrow">{t('completeness.step')}</div>
        {missing.length === 0 ? (
          <>
            <h1>{titleOverride ?? t('completeness.allClear')}</h1>
            <p>{t('completeness.allClearSub')}</p>
          </>
        ) : (
          <>
            <h1>{titleOverride ?? (i18n.language === 'da' ? 'Har du husket?' : 'Did you remember?')}</h1>
            <p>
              {subtitleOverride ?? (
                missing.length === 1
                  ? t('completeness.subtitleSingle')
                  : t('completeness.subtitlePlural', { n: missing.length })
              )}
            </p>
          </>
        )}
      </section>

      {/* Cards grid */}
      {missing.length > 0 && (
        <div className="checklist">
          {missing.map((check, noteIndex) => {
            const label       = check.label[lang];
            const why         = check.why[lang];
            const placeholder = check.placeholder[lang];
            const isSkipped   = skipped.has(check.id);
            const noteValue   = notes[check.id] || '';
            const challenge   = noteChallengeMap[noteIndex];
            const isLoading   = noteLoadingIndices.has(noteIndex) && noteValue.trim();
            const isFilled    = noteValue.trim() && !isSkipped;

            return (
              <div
                key={check.id}
                className={`ccard${isSkipped ? ' skipped' : isFilled ? ' filled' : ''}`}
              >
                <div className="c-num">{noteIndex + 1}.</div>
                <h3>{label}</h3>
                <p className="why">{why}</p>

                {isFilled && (
                  <div className="done-flag">
                    <span className="ok">✓</span>
                    {t('completeness.filled')}
                  </div>
                )}

                {!isSkipped && (
                  <>
                    <div className="note-row">
                      <input
                        type="text"
                        className="input"
                        value={noteValue}
                        onChange={(e) => setNoteValue(check.id, e.target.value)}
                        onPaste={(e) => { const el = e.target; setTimeout(() => setNoteValue(check.id, el.value), 0); }}
                        placeholder={placeholder}
                        maxLength={200}
                      />
                      {isLoading && (
                        <span className="bullet-loading-dot" aria-hidden="true" />
                      )}
                    </div>
                    {challenge && !isLoading && (
                      <BulletChallengeCard
                        challenge={challenge}
                        language={language}
                        onAccept={(suggestion) => acceptNoteChallenge(noteIndex, suggestion)}
                        onDismiss={() => dismissNoteChallenge(noteIndex)}
                      />
                    )}
                  </>
                )}

                <div className="c-foot">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={isSkipped}
                      onChange={() => toggleSkip(check.id)}
                    />
                    <span className="box" />
                    {t('completeness.skipLabel')}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="actionbar">
        <div className="actionbar-inner">
          <div className="left">
            {missing.length > 0 && (
              <div className="progress-meter">
                <div className="track">
                  <div className="fill" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="label">
                  {t('completeness.progress', { done: addressedCount, total: missing.length })}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={proceed}
            disabled={noteLoadingIndices.size > 0}
          >
            {generateLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
