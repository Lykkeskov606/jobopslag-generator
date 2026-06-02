import { useState } from 'react';
import { runCompletenessCheck } from '../lib/completenessRules.js';
import { useBulletChallenges } from '../hooks/useBulletChallenges.js';
import { BulletChallengeCard } from './BulletChallengeCard.jsx';

const STRINGS = {
  da: {
    title: 'Har du husket?',
    subtitle_one: 'element mangler typisk i jobopslag — udfyld eller fortsæt alligevel',
    subtitle_other: 'elementer mangler typisk i jobopslag — udfyld eller fortsæt alligevel',
    all_clear: 'Alle tjek er godkendt',
    all_clear_sub: 'Ingen manglende elementer fundet i dit input.',
    skip_label: 'Ikke relevant for denne rolle',
    back: '← Rediger input',
    generate_with: (n) => `Generer med ${n} note${n !== 1 ? 'r' : ''} →`,
    generate_anyway: 'Generer alligevel →',
    generate_ready: 'Generer jobopslag →',
    addressed: (n, total) => `${n} af ${total} udfyldt`,
  },
  en: {
    title: 'Did you remember?',
    subtitle_one: 'element is often missing from job postings — add details or generate anyway',
    subtitle_other: 'elements are often missing from job postings — add details or generate anyway',
    all_clear: 'All checks passed',
    all_clear_sub: 'No missing elements found in your input.',
    skip_label: 'Not relevant for this role',
    back: '← Edit input',
    generate_with: (n) => `Generate with ${n} note${n !== 1 ? 's' : ''} →`,
    generate_anyway: 'Generate anyway →',
    generate_ready: 'Generate job posting →',
    addressed: (n, total) => `${n} of ${total} addressed`,
  },
};

/**
 * Shared input-quality micro-step between form input and AI generation.
 * Analyses bullets for missing elements (completeness) and shows per-note
 * evidence/qualification challenges via the shared useBulletChallenges hook.
 *
 * Props:
 *   jobTitle, bullets, location  — current form values
 *   language                     — 'da' | 'en'
 *   projectId                    — for the challenge API call
 *   onBack()                     — go back to edit the input form
 *   onProceed(extraBullets)      — proceed to generation with optional extra context
 */
export function InputCompletenessCheck({
  jobTitle, bullets, location, language, projectId,
  onBack, onProceed,
}) {
  const lang = language === 'en' ? 'en' : 'da';
  const t = STRINGS[lang];
  const missing = runCompletenessCheck({ jobTitle, bullets, location, language });

  const [notes, setNotes]     = useState({});
  const [skipped, setSkipped] = useState(new Set());

  // Build note values with label prefix so Claude understands the context:
  // e.g. "Teamstørrelse: 6 personer" instead of bare "6 personer"
  const noteValues = missing.map((check) => {
    const value = notes[check.id] || '';
    if (!value.trim()) return '';
    return `${check.label[lang]}: ${value}`;
  });

  const {
    challengeMap: noteChallengeMap,
    loadingIndices: noteLoadingIndices,
    dismiss: dismissNoteChallenge,
  } = useBulletChallenges({
    projectId,
    jobTitle,
    bullets: noteValues,
    language,
    debounceMs: 1800,
  });

  function acceptNoteChallenge(noteIndex, suggestion) {
    const check = missing[noteIndex];
    if (check && suggestion?.trim()) setNote(check.id, suggestion.trim());
    dismissNoteChallenge(noteIndex);
  }

  const filledNotes = Object.entries(notes).filter(([id, v]) => v.trim() && !skipped.has(id));
  const addressedCount = filledNotes.length;
  const subtitle = missing.length === 1 ? t.subtitle_one : t.subtitle_other;

  function toggleSkip(id) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setNote(id, value) {
    setNotes((prev) => ({ ...prev, [id]: value }));
  }

  function proceed() {
    const extraBullets = filledNotes.map(([id, text]) => {
      const check = missing.find((c) => c.id === id);
      const label = check?.label[lang] ?? id;
      return `${label}: ${text.trim()}`;
    });
    onProceed(extraBullets);
  }

  return (
    <div className="checklist-panel card">
      {missing.length > 0 && (
        <>
          <div className="checklist-header">
            <div className="checklist-header-icon">💡</div>
            <div>
              <h3 className="checklist-title">{t.title}</h3>
              <p className="checklist-subtitle">
                <strong>{missing.length}</strong> {subtitle}
              </p>
            </div>
          </div>

          <div className="checklist-items">
            {missing.map((check, noteIndex) => {
              const label       = check.label[lang];
              const why         = check.why[lang];
              const placeholder = check.placeholder[lang];
              const isSkipped   = skipped.has(check.id);
              const noteValue   = notes[check.id] || '';
              const challenge   = noteChallengeMap[noteIndex];
              const isLoading   = noteLoadingIndices.has(noteIndex) && noteValue.trim();
              return (
                <div key={check.id} className={`checklist-item${isSkipped ? ' checklist-item-skipped' : ''}`}>
                  <div className="checklist-item-top">
                    <div className="checklist-item-meta">
                      <span className="checklist-item-label">{label}</span>
                      {!isSkipped && <span className="checklist-item-why">{why}</span>}
                    </div>
                    <label className="checklist-skip-label">
                      <input type="checkbox" checked={isSkipped} onChange={() => toggleSkip(check.id)} />
                      <span>{t.skip_label}</span>
                    </label>
                  </div>
                  {!isSkipped && (
                    <>
                      <div className="checklist-note-row">
                        <input
                          type="text"
                          className={`form-input checklist-note-input${noteValue.trim() ? ' note-filled' : ''}`}
                          value={noteValue}
                          onChange={(e) => setNote(check.id, e.target.value)}
                          placeholder={placeholder}
                          maxLength={200}
                        />
                        {isLoading && <span className="bullet-loading-dot" aria-hidden="true" />}
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {missing.length === 0 && (
        <div className="checklist-all-clear">
          <span className="checklist-all-clear-icon">✓</span>
          <div>
            <strong>{t.all_clear}</strong>
            <p>{t.all_clear_sub}</p>
          </div>
        </div>
      )}

      <div className="checklist-footer">
        {missing.length > 0 && (
          <span className="checklist-addressed">{t.addressed(addressedCount, missing.length)}</span>
        )}
        <div className="checklist-actions">
          <button type="button" className="link-btn" onClick={onBack}>
            {t.back}
          </button>
          <button type="button" className="generate-btn" onClick={proceed}>
            {missing.length > 0
              ? (addressedCount > 0 ? t.generate_with(addressedCount) : t.generate_anyway)
              : t.generate_ready}
          </button>
        </div>
      </div>
    </div>
  );
}
