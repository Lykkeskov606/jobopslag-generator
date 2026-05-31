import { useState } from 'react';
import { runCompletenessCheck } from '../lib/completenessRules.js';

const STRINGS = {
  da: {
    title: 'Har du husket?',
    subtitle_one: 'element mangler typisk i jobopslag — udfyld eller fortsæt alligevel',
    subtitle_other: 'elementer mangler typisk i jobopslag — udfyld eller fortsæt alligevel',
    skip_label: 'Ikke relevant for denne rolle',
    back: '← Rediger input',
    generate_with: (n) => `Generer med ${n} note${n !== 1 ? 'r' : ''} →`,
    generate_anyway: 'Generer alligevel →',
    addressed: (n, total) => `${n} af ${total} udfyldt`,
  },
  en: {
    title: 'Did you remember?',
    subtitle_one: 'element is often missing from job postings — add details or generate anyway',
    subtitle_other: 'elements are often missing from job postings — add details or generate anyway',
    skip_label: 'Not relevant for this role',
    back: '← Edit input',
    generate_with: (n) => `Generate with ${n} note${n !== 1 ? 's' : ''} →`,
    generate_anyway: 'Generate anyway →',
    addressed: (n, total) => `${n} of ${total} addressed`,
  },
};

/**
 * Shared input-quality micro-step shown between form input and AI generation.
 * Analyses the user's bullets and flags typically-missing elements.
 * Does NOT block generation — always shows a "generate anyway" path.
 *
 * Props:
 *   jobTitle, bullets, location  — current form values
 *   language                     — 'da' | 'en'
 *   onBack()                     — go back to edit the input form
 *   onProceed(extraBullets: str[]) — proceed to generation with optional extra context
 */
export function InputCompletenessCheck({ jobTitle, bullets, location, language, onBack, onProceed }) {
  const lang = language === 'en' ? 'en' : 'da';
  const t = STRINGS[lang];
  const missing = runCompletenessCheck({ jobTitle, bullets, location, language });

  const [notes, setNotes] = useState({});   // id -> text
  const [skipped, setSkipped] = useState(new Set()); // ids dismissed as not relevant

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

  // Nothing is missing — shouldn't normally be shown, but handle gracefully
  if (missing.length === 0) {
    onProceed([]);
    return null;
  }

  return (
    <div className="checklist-panel card">
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
        {missing.map((check) => {
          const label = check.label[lang];
          const why = check.why[lang];
          const placeholder = check.placeholder[lang];
          const isSkipped = skipped.has(check.id);
          const noteValue = notes[check.id] || '';

          return (
            <div key={check.id} className={`checklist-item${isSkipped ? ' checklist-item-skipped' : ''}`}>
              <div className="checklist-item-top">
                <div className="checklist-item-meta">
                  <span className="checklist-item-label">{label}</span>
                  {!isSkipped && <span className="checklist-item-why">{why}</span>}
                </div>
                <label className="checklist-skip-label">
                  <input
                    type="checkbox"
                    checked={isSkipped}
                    onChange={() => toggleSkip(check.id)}
                  />
                  <span>{t.skip_label}</span>
                </label>
              </div>
              {!isSkipped && (
                <input
                  type="text"
                  className={`form-input checklist-note-input${noteValue.trim() ? ' note-filled' : ''}`}
                  value={noteValue}
                  onChange={(e) => setNote(check.id, e.target.value)}
                  placeholder={placeholder}
                  maxLength={200}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="checklist-footer">
        <span className="checklist-addressed">{t.addressed(addressedCount, missing.length)}</span>
        <div className="checklist-actions">
          <button type="button" className="link-btn" onClick={onBack}>
            {t.back}
          </button>
          <button type="button" className="generate-btn" onClick={proceed}>
            {addressedCount > 0 ? t.generate_with(addressedCount) : t.generate_anyway}
          </button>
        </div>
      </div>
    </div>
  );
}
