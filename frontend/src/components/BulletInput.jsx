import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { checkBulletBias } from '../lib/biasRules';
import { BulletChallengeCard } from './BulletChallengeCard';
import { useScrollAnchor } from '../hooks/useScrollAnchor';

export function InlineBiasWarnings({ text, language }) {
  const violations = checkBulletBias(text, language);
  if (!violations.length) return null;
  return (
    <div className="inline-bias-list">
      {violations.map((v, i) => (
        <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
          <span className="inline-bias-label">{v.label}:</span>
          <span className="inline-bias-matches">
            {v.matchedTexts.map((m) => `"${m}"`).join(', ')}
          </span>
          <span className="inline-bias-tip">{v.suggestion}</span>
        </div>
      ))}
    </div>
  );
}

export function BulletInput({
  bullets,
  onChange,
  language,
  challengeMap = {},
  loadingIndices = new Set(),
  onDismissChallenge,
  onAcceptChallenge,
  placeholder,
  placeholderMore,
  addLabel,
}) {
  const { t, i18n } = useTranslation();
  const refs = useRef([]);
  useScrollAnchor(Object.keys(challengeMap).length);

  const da = i18n.language === 'da';

  function update(i, val) {
    const next = [...bullets];
    next[i] = val;
    onChange(next);
  }

  function add() {
    if (bullets.length < 10) onChange([...bullets, '']);
  }

  function remove(i) {
    if (bullets.length <= 1) return;
    onChange(bullets.filter((_, j) => j !== i));
  }

  function handleKeyDown(e, i) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i === bullets.length - 1 && bullets.length < 10) {
        add();
        setTimeout(() => refs.current[i + 1]?.focus(), 40);
      }
    }
    if (e.key === 'Backspace' && bullets[i] === '' && bullets.length > 1) {
      e.preventDefault();
      remove(i);
      setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 40);
    }
  }

  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }

  const p0 = placeholder ?? t('tier1.bulletPlaceholder');
  const pN = placeholderMore ?? t('tier1.bulletMore');
  const addText = addLabel ?? t('tier1.addBullet');

  return (
    <div className="bullets">
      {bullets.map((b, i) => (
        <div key={i} className="bullet-wrap">
          <div className="bullet">
            <span className="num">{i + 1}</span>
            <textarea
              ref={(el) => { refs.current[i] = el; }}
              className="input"
              rows={1}
              value={b}
              onChange={(e) => { update(i, e.target.value); autoResize(e.target); }}
              onFocus={(e) => autoResize(e.target)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              placeholder={i === 0 ? p0 : pN}
              style={{ resize: 'none', overflow: 'hidden' }}
            />
            {loadingIndices.has(i) && b.trim() ? (
              <span className="b-loading">
                <span className="bullet-loading-dot" aria-hidden="true" />
              </span>
            ) : (
              bullets.length > 1 && (
                <button
                  type="button"
                  className="remove"
                  aria-label={da ? 'Fjern' : 'Remove'}
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              )
            )}
          </div>
          {b.trim() && <InlineBiasWarnings text={b} language={language} />}
          {challengeMap[i] && !loadingIndices.has(i) && (
            <BulletChallengeCard
              challenge={challengeMap[i]}
              language={language}
              onAccept={(suggestion) => onAcceptChallenge?.(i, suggestion)}
              onDismiss={() => onDismissChallenge?.(i)}
            />
          )}
        </div>
      ))}
      {bullets.length < 10 && (
        <button type="button" className="add-bullet" onClick={add}>
          <span className="plus">+</span>
          {addText}
        </button>
      )}
    </div>
  );
}
