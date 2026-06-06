import { useState } from 'react';
import { runCompletenessCheck } from '../lib/completenessRules.js';
import { useBulletChallenges } from '../hooks/useBulletChallenges.js';
import { BulletChallengeCard } from './BulletChallengeCard.jsx';
import Steps from './Steps.jsx';

const STRINGS = {
  da: {
    title: 'Har du husket?',
    subtitle_one: 'Ét element mangler typisk i opslag som dette — udfyld eller fortsæt alligevel.',
    subtitle_other: (n) => `${n} elementer mangler typisk i opslag som dette — udfyld eller fortsæt alligevel.`,
    all_clear: 'Alt ser godt ud',
    all_clear_sub: 'Ingen manglende elementer fundet i dit input.',
    skip_label: 'Ikke relevant for denne rolle',
    back: 'Rediger input',
    generate_with: (n) => `Generer med ${n} note${n !== 1 ? 'r' : ''} →`,
    generate_anyway: 'Generer alligevel →',
    generate_ready: 'Generer jobopslag →',
    generate_checking: 'Tjekker noter…',
    addressed: (n, total) => `${n} af ${total} udfyldt`,
  },
  en: {
    title: 'Did you remember?',
    subtitle_one: 'One element is often missing from job postings — add details or generate anyway.',
    subtitle_other: (n) => `${n} elements are often missing from job postings — add details or generate anyway.`,
    all_clear: 'All checks passed',
    all_clear_sub: 'No missing elements found in your input.',
    skip_label: 'Not relevant for this role',
    back: 'Edit input',
    generate_with: (n) => `Generate with ${n} note${n !== 1 ? 's' : ''} →`,
    generate_anyway: 'Generate anyway →',
    generate_ready: 'Generate job posting →',
    generate_checking: 'Checking notes…',
    addressed: (n, total) => `${n} of ${total} addressed`,
  },
};

const STEPS = [
  { label: 'Input', state: 'done' },
  { label: 'Tjek', state: 'active', n: 2 },
  { label: 'Generer', state: 'default', n: 3 },
  { label: 'Download', state: 'default', n: 4 },
];

/**
 * Completeness micro-step between form input and AI generation.
 * Analyses bullets for missing elements and shows per-note challenges.
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
    onProceed(extraBullets);
  }

  const progressPct = missing.length > 0
    ? Math.round((addressedCount / missing.length) * 100)
    : 100;

  return (
    <div className="work">
      {/* Back + steps */}
      <div className="work-top">
        <button type="button" className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t.back}
        </button>
        <div className="hide-mobile">
          <Steps steps={STEPS} />
        </div>
      </div>

      {/* Intro */}
      <section className="intro">
        <div className="eyebrow">
          {lang === 'da' ? 'Trin 2 af 4' : 'Step 2 of 4'}
        </div>
        {missing.length === 0 ? (
          <>
            <h1>{t.all_clear}</h1>
            <p>{t.all_clear_sub}</p>
          </>
        ) : (
          <>
            <h1>{t.title}</h1>
            <p>
              {missing.length === 1
                ? t.subtitle_one
                : t.subtitle_other(missing.length)}
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
                    {lang === 'da' ? 'Udfyldt' : 'Filled in'}
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
                    {t.skip_label}
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
                  <strong>{addressedCount} af {missing.length}</strong> udfyldt
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
            {noteLoadingIndices.size > 0
              ? t.generate_checking
              : (missing.length > 0
                  ? (addressedCount > 0 ? t.generate_with(addressedCount) : t.generate_anyway)
                  : t.generate_ready)}
          </button>
        </div>
      </div>
    </div>
  );
}
