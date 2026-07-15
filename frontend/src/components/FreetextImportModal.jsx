import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';

/**
 * FreetextImportModal
 *
 * Props:
 *   language  – 'da' | 'en' (passed to parse endpoint for prompt selection)
 *   onAdd     – (bullets: string[]) => void  — called with approved bullets
 *   onClose   – () => void
 */
export function FreetextImportModal({ language, onAdd, onClose }) {
  const { t } = useTranslation();

  const [phase, setPhase] = useState('input'); // 'input' | 'loading' | 'review'
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]); // { text, selected, editing }
  const [error, setError] = useState(null);

  async function handleSuggest() {
    if (!text.trim()) return;
    setPhase('loading');
    setError(null);
    try {
      const { data } = await api.post('/generate/parse-bullets-from-freetext', {
        freetext: text,
        language,
      });
      const bullets = (data.bullets || []).filter(Boolean);
      if (!bullets.length) {
        setError(t('tier1.importFreetextNone'));
        setPhase('input');
        return;
      }
      setSuggestions(bullets.map((b) => ({ text: b, selected: true, editing: false })));
      setPhase('review');
    } catch {
      setError(t('tier1.importFreetextError'));
      setPhase('input');
    }
  }

  function toggleSelect(i) {
    setSuggestions((prev) => prev.map((s, j) => j === i ? { ...s, selected: !s.selected } : s));
  }

  function startEdit(i) {
    setSuggestions((prev) => prev.map((s, j) => j === i ? { ...s, editing: true } : s));
  }

  function commitEdit(i, val) {
    setSuggestions((prev) => prev.map((s, j) => j === i ? { ...s, text: val, editing: false } : s));
  }

  function removeSuggestion(i) {
    setSuggestions((prev) => prev.filter((_, j) => j !== i));
  }

  function handleAdd() {
    const chosen = suggestions.filter((s) => s.selected).map((s) => s.text.trim()).filter(Boolean);
    if (chosen.length) onAdd(chosen);
    onClose();
  }

  const selectedCount = suggestions.filter((s) => s.selected).length;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
        <div className="modal-head">
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('tier1.importFreetextTitle')}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Luk">×</button>
        </div>

        {phase === 'input' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--ink-2)' }}>
              {t('tier1.importFreetextSub')}
            </p>
            <textarea
              className="textarea"
              rows={9}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('tier1.importFreetextPlaceholder')}
              autoFocus
              style={{ resize: 'vertical', minHeight: 180, width: '100%' }}
            />
            {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('tier1.importFreetextCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSuggest}
                disabled={!text.trim()}
              >
                {t('tier1.importFreetextSuggest')}
              </button>
            </div>
          </>
        )}

        {phase === 'loading' && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-2)', fontSize: 14 }}>
            <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} />
            {t('tier1.importFreetextParsing')}
          </div>
        )}

        {phase === 'review' && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>
              {t('tier1.importFreetextSub')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`ccard${s.selected ? '' : ' freetext-unselected'}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    opacity: s.selected ? 1 : 0.45, cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                  onClick={() => !s.editing && toggleSelect(i)}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => toggleSelect(i)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer' }}
                  />
                  {s.editing ? (
                    <input
                      type="text"
                      className="input"
                      defaultValue={s.text}
                      autoFocus
                      style={{ flex: 1, fontSize: 14, padding: '2px 6px' }}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitEdit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(i, e.target.value);
                        if (e.key === 'Escape') setSuggestions((prev) => prev.map((x, j) => j === i ? { ...x, editing: false } : x));
                      }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}
                      onDoubleClick={(e) => { e.stopPropagation(); startEdit(i); }}
                      title="Dobbeltklik for at redigere"
                    >
                      {s.text}
                    </span>
                  )}
                  <button
                    type="button"
                    className="remove"
                    aria-label="Fjern"
                    onClick={(e) => { e.stopPropagation(); removeSuggestion(i); }}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {!suggestions.length && (
              <p style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                {t('tier1.importFreetextNone')}
              </p>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setPhase('input'); setError(null); }}>
                {t('tier1.importFreetextBack')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('tier1.importFreetextCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAdd}
                disabled={selectedCount === 0}
              >
                {t('tier1.importFreetextAdd', { count: selectedCount })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
