import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { checkBulletBias } from '../lib/biasRules';
import { runCompletenessCheck } from '../lib/completenessRules';
import { InputCompletenessCheck } from '../components/InputCompletenessCheck';
import { BulletChallengeCard } from '../components/BulletChallengeCard';
import { BulletInput, InlineBiasWarnings } from '../components/BulletInput';
import { useBulletChallenges } from '../hooks/useBulletChallenges';
import TopBar from '../components/TopBar';
import Steps from '../components/Steps';

// ─── Job posting preview renderer ────────────────────────────────────────────

function JobPostingPreview({ content }) {
  if (!content) return null;
  return (
    <>
      {content.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="preview-spacer" />;
        if (t.endsWith(':') && t.length < 70 && !t.includes('. '))
          return <p key={i} className="preview-heading">{t}</p>;
        if (/^[•\-\*]\s/.test(t))
          return (
            <div key={i} className="preview-bullet">
              <span className="preview-bullet-dot">•</span>
              <span>{t.replace(/^[•\-\*]\s*/, '')}</span>
            </div>
          );
        return <p key={i} className="preview-paragraph">{t}</p>;
      })}
    </>
  );
}

// ─── Bias pill + expandable panel ────────────────────────────────────────────

function BiasPanel({ warnings, language }) {
  const { t, i18n } = useTranslation();
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(false);
  const da = i18n.language === 'da';

  function key(w) { return `${w.category}-${w.matchedText || w.message}`; }
  function dismiss(w) { setDismissed((p) => new Set([...p, key(w)])); }

  const visible = warnings.filter((w) => !dismissed.has(key(w)));
  if (!visible.length) return null;

  function renderGroup(title, items) {
    if (!items.length) return null;
    return (
      <div className="bias-group">
        <div className="bias-group-label">{title}</div>
        {items.map((w, i) => (
          <div key={i} className="bias-warning-row">
            <div className="bw-content">
              <span className={`bias-dot ${w.severity}`} />
              <span className="bias-label">{w.label || w.category}</span>
              {w.matchedText && <span className="bias-matched">"{w.matchedText}"</span>}
              {w.message    && <span className="bias-msg">{w.message}</span>}
            </div>
            <button type="button" className="dismiss-bw" onClick={() => dismiss(w)}>
              {t('tier1.biasIgnore')}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="bias-notice">
        <span className="ico" />
        <span>{t('tier1.biasFound', { count: visible.length })}</span>
        <button type="button" onClick={() => setExpanded((e) => !e)}>
          {expanded ? t('tier1.hideDetails') : t('tier1.showDetails')}
        </button>
      </div>
      {expanded && (
        <div className="bias-details">
          {renderGroup(da ? 'Dit input' : 'Your input', visible.filter((w) => w.source === 'input'))}
          {renderGroup('Variant A', visible.filter((w) => w.source === 'variant_a'))}
          {renderGroup('Variant B', visible.filter((w) => w.source === 'variant_b'))}
        </div>
      )}
    </>
  );
}

// ─── Mix editor ───────────────────────────────────────────────────────────────

function splitToSections(text) {
  return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}

function getBlockTag(text, da) {
  const t = text.trim();
  if (t.endsWith(':') && t.length < 60) return da ? 'OVERSKRIFT' : 'HEADING';
  if (/^[•\-\*]/.test(t) || /\n[•\-\*]/.test(t)) return da ? 'LISTE' : 'LIST';
  return da ? 'AFSNIT' : 'PARAGRAPH';
}

function SourceCol({ side, label, src, usedKeys, srcPrefix, onAdd, language }) {
  const { t, i18n } = useTranslation();
  const da = i18n.language === 'da';
  return (
    <div className={`panel-col source ${side}`}>
      <div className="col-head">
        <div className="label">
          <span className={`vchip ${label === 'A' ? 'a' : 'b'}`} />
          <h2>Variant {label}</h2>
        </div>
        <div className="hint">
          {side === 'left'
            ? t('tier1.clickToAddRight')
            : t('tier1.clickToAddLeft')}
        </div>
      </div>
      <div className="col-scroll">
        {src.map((text, i) => {
          const k = `${srcPrefix}|${i}`;
          const used = usedKeys.has(k);
          return (
            <div
              key={i}
              className={`src-block${used ? ' used' : ''}`}
              onClick={() => !used && onAdd(text, label, k)}
              draggable={!used}
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', k + '\n' + text); }}
            >
              <div className="blk-tag">
                <span>{getBlockTag(text, da)}</span>
                <span className="added">{da ? 'Tilføjet ✓' : 'Added ✓'}</span>
              </div>
              <div className="blk-text">{text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MixEditor({ variantA, variantB, value, onChange, language }) {
  const { t, i18n } = useTranslation();
  const da = i18n.language === 'da';
  const sectionsA = splitToSections(variantA);
  const sectionsB = splitToSections(variantB);

  const [doc, setDoc] = useState(() => {
    if (value?.trim()) {
      return splitToSections(value).map((text, i) => ({
        id: `init-${i}`, srcKey: `init-${i}`, text, src: 'A',
      }));
    }
    return [];
  });
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const usedKeys = new Set(doc.map((b) => b.srcKey));
  const words = doc.reduce((n, b) => n + b.text.trim().split(/\s+/).filter(Boolean).length, 0);

  useEffect(() => {
    onChange(doc.map((b) => b.text).join('\n\n'));
  }, [doc]);

  function addBlock(text, src, srcKey) {
    setDoc((d) => [...d, { id: `${Date.now()}-${Math.random()}`, srcKey, text, src }]);
  }

  function removeBlock(id) {
    setDoc((d) => d.filter((b) => b.id !== id));
  }

  function moveBlock(id, dir) {
    setDoc((d) => {
      const i = d.findIndex((b) => b.id === id);
      if (dir === 'up' && i === 0) return d;
      if (dir === 'down' && i === d.length - 1) return d;
      const next = [...d];
      const swap = dir === 'up' ? i - 1 : i + 1;
      [next[i], next[swap]] = [next[swap], next[i]];
      return next;
    });
  }

  function startEdit(block) {
    setEditingId(block.id);
    setEditText(block.text);
  }

  function saveEdit(id) {
    if (editText.trim()) {
      setDoc((d) => d.map((b) => (b.id === id ? { ...b, text: editText } : b)));
    } else {
      removeBlock(id);
    }
    setEditingId(null);
  }

  // Fix 7: auto-resize mix editor textarea
  function autoResizeMix(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function handleDrop(e) {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain');
    if (!payload) return;
    const [srcKey, ...lines] = payload.split('\n');
    const text = lines.join('\n');
    const src = srcKey.startsWith('B') ? 'B' : 'A';
    if (!usedKeys.has(srcKey)) addBlock(text, src, srcKey);
  }

  return (
    <div className="mixer">
      <SourceCol
        side="left" label="A" src={sectionsA}
        usedKeys={usedKeys} srcPrefix="A" onAdd={addBlock} language={language}
      />

      <div
        className="panel-col workspace"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="ws-head">
          <div className="ttl">
            <h2>{t('tier1.wsTitle')}</h2>
            <span className="meta">
              {doc.length} {t('tier1.sections')} · {t('tier1.approx')} {words} {t('tier1.words')}
            </span>
          </div>
          <button className="clear" onClick={() => setDoc([])}>
            {t('tier1.clearAll')}
          </button>
        </div>
        <div className="ws-scroll">
          <div className={`ws-doc${doc.length === 0 ? ' empty-state' : ''}`}>
            {doc.length === 0 ? (
              <div className="ws-empty">
                <span className="serif">{t('tier1.wsEmpty')}</span>
                <span className="sm">{t('tier1.wsEmptySub')}</span>
              </div>
            ) : (
              doc.map((block, idx) => (
                <div
                  key={block.id}
                  className="ws-block"
                  onClick={() => editingId !== block.id && startEdit(block)}
                >
                  <div className="wb-bar">
                    <span className="wb-source">
                      <span className={`vchip ${block.src === 'A' ? 'a' : 'b'}`} />
                      Variant {block.src}
                    </span>
                    <div className="wb-actions">
                      <button
                        type="button"
                        title={da ? 'Op' : 'Up'}
                        disabled={idx === 0}
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                      >↑</button>
                      <button
                        type="button"
                        title={da ? 'Ned' : 'Down'}
                        disabled={idx === doc.length - 1}
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                      >↓</button>
                      <button
                        type="button"
                        title={da ? 'Slet' : 'Delete'}
                        onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                      >×</button>
                    </div>
                  </div>
                  {editingId === block.id ? (
                    <textarea
                      className="textarea"
                      autoFocus
                      value={editText}
                      onChange={(e) => { setEditText(e.target.value); autoResizeMix(e.target); }}
                      onFocus={(e) => autoResizeMix(e.target)}
                      onBlur={() => saveEdit(block.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: 'var(--serif)', fontSize: 15.5, lineHeight: 1.65,
                        border: 'none', outline: 'none', background: 'transparent',
                        resize: 'vertical', minHeight: 120, width: '100%',
                      }}
                    />
                  ) : (
                    <div className="wb-text">{block.text}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <SourceCol
        side="right" label="B" src={sectionsB}
        usedKeys={usedKeys} srcPrefix="B" onAdd={addBlock} language={language}
      />
    </div>
  );
}

// ─── Input hash to guard against duplicate regeneration ──────────────────────

function makeInputsHash(jobTitle, bullets, language, location, startDate, employmentType) {
  return JSON.stringify({
    jt: jobTitle.trim(),
    bl: bullets.filter((b) => b.trim()),
    la: language, lo: location.trim(),
    sd: startDate.trim(), et: employmentType,
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Tier1Page({ project }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const storageKey = `tier1-draft-${project.id}`;

  const [step, setStep]                       = useState('input');
  const [language, setLanguage]               = useState(project.output_language || 'da');
  const [jobTitle, setJobTitle]               = useState('');
  const [bullets, setBullets]                 = useState(['', '', '', '']);
  const [location, setLocation]               = useState('');
  const [startDate, setStartDate]             = useState('');
  const [employmentType, setEmploymentType]   = useState('');
  const [workMode, setWorkMode]               = useState('');
  const [templateFile, setTemplateFile]       = useState(null);
  const [biasWarnings, setBiasWarnings]       = useState([]);
  const [variantA, setVariantA]               = useState('');
  const [variantB, setVariantB]               = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [finalContent, setFinalContent]       = useState('');
  const [error, setError]                     = useState(null);
  const [downloading, setDownloading]         = useState(false);
  const [previousVariants, setPreviousVariants] = useState([]);
  const [historyOpen, setHistoryOpen]         = useState(false);
  const lastGenHashRef = useRef(null);
  const titleDebounceRef = useRef(null);

  // UI language (from i18n) vs output language (language state)
  const da = i18n.language === 'da';

  // STEP_STATES uses t() so must live inside the component
  const STEP_STATES = {
    input:      [{ label: t('steps.input'), state: 'active', n: 1 }, { label: t('steps.check'), state: 'default', n: 2 }, { label: t('steps.generate'), state: 'default', n: 3 }, { label: t('steps.download'), state: 'default', n: 4 }],
    checklist:  [{ label: t('steps.input'), state: 'done' },         { label: t('steps.check'), state: 'active', n: 2 }, { label: t('steps.generate'), state: 'default', n: 3 }, { label: t('steps.download'), state: 'default', n: 4 }],
    generating: [{ label: t('steps.input'), state: 'done' },         { label: t('steps.check'), state: 'done' },         { label: t('steps.generate'), state: 'active', n: 3 }, { label: t('steps.download'), state: 'default', n: 4 }],
    results:    [{ label: t('steps.input'), state: 'done' },         { label: t('steps.check'), state: 'done' },         { label: t('steps.generate'), state: 'done' },         { label: t('steps.download'), state: 'active', n: 4 }],
    finalize:   [{ label: t('steps.input'), state: 'done' },         { label: t('steps.check'), state: 'done' },         { label: t('steps.generate'), state: 'done' },         { label: t('steps.download'), state: 'active', n: 4 }],
    refused:    [{ label: t('steps.input'), state: 'active', n: 1 }, { label: t('steps.check'), state: 'default', n: 2 }, { label: t('steps.generate'), state: 'default', n: 3 }, { label: t('steps.download'), state: 'default', n: 4 }],
  };

  const { challengeMap, loadingIndices, dismiss: dismissChallenge, markApproved } = useBulletChallenges({
    projectId: project.id,
    jobTitle,
    bullets,
    language,
  });

  function handleAcceptChallenge(bulletIndex, suggestion) {
    if (!suggestion?.trim()) return;
    markApproved(bulletIndex, suggestion.trim());
    const next = [...bullets];
    next[bulletIndex] = suggestion.trim();
    setBullets(next);
    dismissChallenge(bulletIndex);
  }

  // Restore localStorage draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.jobTitle)                          setJobTitle(d.jobTitle);
        if (Array.isArray(d.bullets) && d.bullets.length) setBullets(d.bullets);
        if (d.language)                          setLanguage(d.language);
        if (d.location)                          setLocation(d.location);
        if (d.startDate)                         setStartDate(d.startDate);
        if (d.employmentType)                    setEmploymentType(d.employmentType);
        if (d.workMode)                          setWorkMode(d.workMode);
      }
    } catch {}
  }, [storageKey]);

  // Autosave
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          jobTitle, bullets, language, location, startDate, employmentType, workMode,
        }));
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [storageKey, jobTitle, bullets, language, location, startDate, employmentType, workMode]);

  // Fix 4: debounced project name sync when jobTitle changes
  useEffect(() => {
    if (!jobTitle.trim()) return;
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      api.patch(`/projects/${project.id}`, { name: jobTitle.trim() }).catch(() => {});
    }, 2000);
    return () => clearTimeout(titleDebounceRef.current);
  }, [jobTitle, project.id]);

  // Restore server-side outputs
  useEffect(() => {
    if (project.completion_step < 3) return;
    api.get(`/generate/tier1/${project.id}`)
      .then(({ data }) => {
        if (data.inputs) {
          const inp = data.inputs;
          if (inp.job_title)        setJobTitle(inp.job_title);
          if (Array.isArray(inp.bullets)) setBullets(inp.bullets);
          if (inp.language)         setLanguage(inp.language);
          if (inp.location)         setLocation(inp.location || '');
          if (inp.start_date)       setStartDate(inp.start_date || '');
          if (inp.employment_type)  setEmploymentType(inp.employment_type || '');
        }
        if (data.variant_a) setVariantA(data.variant_a);
        if (data.variant_b) setVariantB(data.variant_b);
        if (data.previous_variants) setPreviousVariants(data.previous_variants);
        if (data.variant_a || data.variant_b) {
          setStep('results');
          if (data.inputs) {
            const inp = data.inputs;
            lastGenHashRef.current = makeInputsHash(
              inp.job_title || '', inp.bullets || [], inp.language || 'da',
              inp.location || '', inp.start_date || '', inp.employment_type || '',
            );
          }
        }
        if (data.selection?.final_content) {
          setSelectedVariant(data.selection.selected_variant);
          setFinalContent(data.selection.final_content);
          setStep('finalize');
        }
      })
      .catch(() => {});
  }, [project.id, project.completion_step]);

  // Validate and advance to checklist
  function handleFormSubmit(e) {
    e.preventDefault();
    const filled = bullets.filter((b) => b.trim());
    if (!jobTitle.trim()) { setError(da ? 'Jobtitel er påkrævet.' : 'Job title is required.'); return; }
    if (!filled.length)   { setError(da ? 'Mindst ét punkt er påkrævet.' : 'At least one bullet is required.'); return; }
    setError(null);
    setStep('checklist');
  }

  // Generate (called from checklist)
  async function doGenerate(extraBullets) {
    const currentHash = makeInputsHash(jobTitle, bullets, language, location, startDate, employmentType);
    if (lastGenHashRef.current === currentHash && variantA && variantB) {
      setStep('results');
      return;
    }
    setStep('generating');
    try {
      const filled = [...bullets.filter((b) => b.trim()), ...(Array.isArray(extraBullets) ? extraBullets : [])];
      const fd = new FormData();
      fd.append('project_id', project.id);
      fd.append('job_title', jobTitle.trim());
      fd.append('bullets', JSON.stringify(filled));
      fd.append('language', language);
      if (location)       fd.append('location', location.trim());
      if (startDate)      fd.append('start_date', startDate.trim());
      if (employmentType) fd.append('employment_type', employmentType.trim());
      if (workMode)       fd.append('work_mode', workMode.trim());
      if (templateFile)   fd.append('template', templateFile);
      const { data } = await api.post('/generate/tier1', fd);
      setBiasWarnings(data.bias_warnings || []);
      setVariantA(data.variant_a || '');
      setVariantB(data.variant_b || '');
      if (data.previous_variants) setPreviousVariants(data.previous_variants);
      lastGenHashRef.current = currentHash;
      setSelectedVariant(null);
      setStep('results');
    } catch (err) {
      if (err.response?.status === 422) {
        setStep('refused');
      } else {
        setError(err.response?.data?.error || (da ? 'Generering fejlede. Prøv igen.' : 'Generation failed. Please try again.'));
        setStep('input');
      }
    }
  }

  function handleSelectVariant(variant) {
    setSelectedVariant(variant);
    const content = variant === 'A' ? variantA : variantB;
    setFinalContent(content);
  }

  function confirmVariant() {
    if (!selectedVariant || selectedVariant === 'mix') return;
    setStep('finalize');
    api.post('/generate/tier1/save-selection', {
      project_id: project.id,
      selected_variant: selectedVariant,
      final_content: finalContent,
    }).catch(() => {});
  }

  function startMix() {
    setSelectedVariant('mix');
    setFinalContent('');
    setStep('finalize');
  }

  async function handleDownload() {
    if (!finalContent.trim()) return;
    setDownloading(true);
    setError(null);
    try {
      if (selectedVariant === 'mix') {
        await api.post('/generate/tier1/save-selection', {
          project_id: project.id, selected_variant: 'mix', final_content: finalContent,
        }).catch(() => {});
      }
      const resp = await api.post(
        '/export/docx',
        { project_id: project.id, content: finalContent, job_title: jobTitle, language },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${jobTitle || 'job-posting'}.docx`; a.click();
      URL.revokeObjectURL(url);
      localStorage.removeItem(storageKey);
    } catch {
      setError(da ? 'Download fejlede. Prøv igen.' : 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const titleViolations = jobTitle.trim() ? checkBulletBias(jobTitle, language) : [];
  const wordCountFinal = finalContent.trim().split(/\s+/).filter(Boolean).length;
  const wordCountA = variantA.trim().split(/\s+/).filter(Boolean).length;
  const wordCountB = variantB.trim().split(/\s+/).filter(Boolean).length;

  // Output language label (shown in review/finalize, tied to the posting's language)
  const outputLangLabel = language === 'da' ? t('tier1.languageDa') : t('tier1.languageEn');

  // ═══════════════════════════════════════════════════════════
  // RENDER — scope wrapper changes per step
  // ═══════════════════════════════════════════════════════════

  // ── CHECKLIST step (delegates to InputCompletenessCheck) ──
  if (step === 'checklist') {
    return (
      <div className="app s-completeness">
        <TopBar active="projects" />
        <main>
          <InputCompletenessCheck
            jobTitle={jobTitle}
            bullets={bullets.filter((b) => b.trim())}
            location={location}
            workMode={workMode}
            language={language}
            projectId={project.id}
            onBack={() => setStep('input')}
            onProceed={doGenerate}
          />
        </main>
      </div>
    );
  }

  // ── GENERATING step ──
  if (step === 'generating') {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main>
          <div className="steps-bar">
            <Steps steps={STEP_STATES.generating} />
          </div>
          <div className="generating-screen">
            <div className="spinner" />
            <h2>{t('tier1.generating')}</h2>
            <p>{t('tier1.generatingSub')}</p>
          </div>
        </main>
      </div>
    );
  }

  // ── REFUSED step ──
  if (step === 'refused') {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main>
          <div className="refused-screen">
            <span className="refused-icon">⚠</span>
            <h2>{t('tier1.refusedTitle')}</h2>
            <p>{t('tier1.refusedBody')}</p>
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{t('tier1.refusedHint')}</p>
            <button className="btn btn-secondary" onClick={() => setStep('input')}>
              ← {t('tier1.editInputs')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── RESULTS step ──
  if (step === 'results') {
    const histCount = previousVariants.length;
    return (
      <div className="app s-review">
        <TopBar active="projects" />
        <main className="work">
          <div className="steps-bar">
            <Steps steps={STEP_STATES.results} />
          </div>

          <section className="review-head">
            <div className="eyebrow">{t('tier1.stepReview')}</div>
            <h1>{jobTitle}</h1>
            <div className="sub">
              <span className="lang">{outputLangLabel}</span>
              {' · '}
              {t('tier1.variantsGenerated')}
            </div>
            <div className="back-link">
              <button type="button" className="link-back" onClick={() => setStep('checklist')}>
                <span className="arrow">←</span>
                {t('tier1.editInputs')}
              </button>
            </div>
          </section>

          {biasWarnings.length > 0 && <BiasPanel warnings={biasWarnings} language={language} />}

          <div className="variants">
            {/* Variant A */}
            <div className={`variant${selectedVariant === 'A' ? ' selected' : ''}`}>
              <div className="v-head">
                <div className="v-name"><h2>{t('tier1.variantA')}</h2></div>
                <span className="wordcount">{wordCountA} {t('tier1.words')}</span>
              </div>
              <div className="v-body">
                <JobPostingPreview content={variantA} />
              </div>
              <div className="v-foot">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSelectVariant('A')}
                >
                  {t('tier1.selectA')}
                </button>
                <span className="selected-flag">
                  <span className="ok">✓</span>
                  {t('tier1.selectedA')}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { handleSelectVariant('A'); setStep('finalize'); }}
                >
                  {t('tier1.editBtn')}
                </button>
              </div>
            </div>

            {/* Variant B */}
            <div className={`variant${selectedVariant === 'B' ? ' selected' : ''}`}>
              <div className="v-head">
                <div className="v-name"><h2>{t('tier1.variantB')}</h2></div>
                <span className="wordcount">{wordCountB} {t('tier1.words')}</span>
              </div>
              <div className="v-body">
                <JobPostingPreview content={variantB} />
              </div>
              <div className="v-foot">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSelectVariant('B')}
                >
                  {t('tier1.selectB')}
                </button>
                <span className="selected-flag">
                  <span className="ok">✓</span>
                  {t('tier1.selectedB')}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { handleSelectVariant('B'); setStep('finalize'); }}
                >
                  {t('tier1.editBtn')}
                </button>
              </div>
            </div>
          </div>

          <div className="mix-cta">
            <button type="button" className="btn btn-secondary btn-lg" onClick={startMix}>
              {t('tier1.mixCta')}
              <span className="arrow">→</span>
            </button>
            <span className="note">{t('tier1.mixNote')}</span>
          </div>

          {/* Previous variants history */}
          {histCount > 0 && (
            <div className={`history${historyOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="history-toggle"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <h2>
                  {t('tier1.historyTitle')}
                  <span className="count">{histCount}</span>
                </h2>
                <span className="chev">▾</span>
              </button>
              <div className="history-body">
                {previousVariants.map((pv, i) => (
                  <div key={i} className="hist-row">
                    <span className="h-when">
                      {new Date(pv.generated_at).toLocaleString(da ? 'da-DK' : 'en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span className="h-meta">2 {t('tier1.historyVariants')}</span>
                    <button
                      type="button"
                      className="h-link"
                      onClick={() => {
                        setVariantA(pv.variant_a || '');
                        setVariantB(pv.variant_b || '');
                        setBiasWarnings([]);
                        setSelectedVariant(null);
                      }}
                    >
                      {t('tier1.historyLoad')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm bar */}
          <div className={`confirm-bar${selectedVariant && selectedVariant !== 'mix' ? ' show' : ''}`}>
            <div className="confirm-inner">
              <span className="what">
                <strong>Variant {selectedVariant}</strong>{' '}
                {t('tier1.variantSelected')}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={confirmVariant}
              >
                {t('tier1.goToDownload')}
                <span className="arrow">→</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── FINALIZE (mix) step ──
  if (step === 'finalize' && selectedVariant === 'mix') {
    return (
      <div className="app s-mix">
        <header className="mix-topbar">
          <div className="left">
            <button
              type="button"
              className="link-back"
              onClick={() => setStep('results')}
            >
              <span className="arrow">←</span>
            </button>
            <div className="ttl">
              {t('tier1.mixTopbarTitle')}
              <span className="sub">
                {jobTitle} · {outputLangLabel}
              </span>
            </div>
          </div>
          <Steps steps={STEP_STATES.finalize} />
        </header>

        <MixEditor
          variantA={variantA}
          variantB={variantB}
          value={finalContent}
          onChange={setFinalContent}
          language={language}
        />

        <footer className="mix-foot">
          <div className="status">
            <strong>{t('tier1.wsTitle')}</strong>
            {' · '}
            {wordCountFinal} {t('tier1.words')}
          </div>
          <div className="actions">
            {error && <span className="error-text" style={{ marginRight: 12 }}>{error}</span>}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep('results')}
            >
              {t('tier1.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading || !finalContent.trim()}
            >
              {downloading ? t('tier1.preparing') : t('tier1.downloadDocx')}
              {!downloading && <span className="arrow">→</span>}
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ── FINALIZE (A/B variant) step ──
  if (step === 'finalize') {
    return (
      <div className="app s-review">
        <TopBar active="projects" />
        <main className="work">
          <div className="steps-bar">
            <Steps steps={STEP_STATES.finalize} />
          </div>

          <section className="review-head" style={{ paddingBottom: 'var(--s-5)' }}>
            <div className="eyebrow">{t('tier1.downloadEyebrow')}</div>
            <h1>{jobTitle}</h1>
            <div className="sub">
              {t('tier1.variantA').replace('A', selectedVariant)} · {outputLangLabel}
            </div>
            <div className="back-link">
              <button type="button" className="link-back" onClick={() => setStep('results')}>
                <span className="arrow">←</span>
                {t('tier1.backToVariants')}
              </button>
            </div>
          </section>

          <div className="edit-section">
            <div className="field">
              <label className="field-label">{t('tier1.editBeforeDownload')}</label>
              <div className="hint" style={{ marginBottom: 'var(--s-3)', fontSize: 13, color: 'var(--ink-3)' }}>
                {wordCountFinal} {t('tier1.words')} · {t('tier1.editClickHint')}
              </div>
              <textarea
                className="textarea"
                value={finalContent}
                onChange={(e) => setFinalContent(e.target.value)}
                rows={22}
              />
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="actionbar">
            <div className="actionbar-inner">
              <div className="meta">
                <span>{t('tier1.savedAs')} .docx</span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleDownload}
                disabled={downloading || !finalContent.trim()}
              >
                {downloading ? t('tier1.preparing') : t('tier1.downloadBtn')}
                {!downloading && <span className="arrow">→</span>}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── INPUT step (default) ──
  const openChallenges = Object.keys(challengeMap).length;
  return (
    <div className="app s-input">
      <TopBar active="projects" />
      <main>
        <div className="work">
          {/* Back + eyebrow */}
          <div className="work-top">
            <button
              type="button"
              className="link-back"
              onClick={() => navigate('/dashboard')}
            >
              <span className="arrow">←</span>
              {t('nav.projects')}
            </button>
            <div className="hide-mobile">
              <Steps steps={STEP_STATES.input} />
            </div>
          </div>

          {/* Intro */}
          <section className="intro">
            <div className="eyebrow">{t('tier1.eyebrow')}</div>
            <h1>{t('tier1.intro')}</h1>
            <p>{t('tier1.introSub')}</p>
          </section>

          {/* Output language toggle */}
          <div className="outlang">
            <span className="lbl">{t('tier1.outputLang')}</span>
            <div className="seg">
              <button
                type="button"
                className={language === 'da' ? 'on' : ''}
                onClick={() => setLanguage('da')}
              >
                🇩🇰 {t('tier1.languageDa')}
              </button>
              <button
                type="button"
                className={language === 'en' ? 'on' : ''}
                onClick={() => setLanguage('en')}
              >
                🇬🇧 {t('tier1.languageEn')}
              </button>
            </div>
          </div>

          <form onSubmit={handleFormSubmit}>
            {/* Job title */}
            <section className="block">
              <div className="block-head">
                <h2>{t('tier1.jobTitleLabel')}</h2>
                <div className="sub">{t('tier1.jobTitleSub')}</div>
              </div>
              <input
                type="text"
                className="input input-lg"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={t('tier1.jobTitlePlaceholder')}
                maxLength={200}
                required
              />
              {titleViolations.length > 0 && (
                <div className="inline-bias-list" style={{ marginTop: 'var(--s-2)' }}>
                  {titleViolations.map((v, i) => (
                    <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
                      <span className="inline-bias-label">{v.label}:</span>
                      <span className="inline-bias-matches">
                        {v.matchedTexts.map((m) => `"${m}"`).join(', ')}
                      </span>
                      <span className="inline-bias-tip">{v.suggestion}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Bullets */}
            <section className="block">
              <div className="block-head">
                <h2>
                  {t('tier1.bulletsLabel')}
                  <span className="bullet-count">
                    {bullets.filter((b) => b.trim()).length} / 10
                  </span>
                </h2>
                <div className="sub">{t('tier1.bulletsSub')}</div>
              </div>
              <BulletInput
                bullets={bullets}
                onChange={setBullets}
                language={language}
                challengeMap={challengeMap}
                loadingIndices={loadingIndices}
                onDismissChallenge={dismissChallenge}
                onAcceptChallenge={handleAcceptChallenge}
              />
            </section>

            {/* Details */}
            <section className="block">
              <div className="block-head">
                <h2>
                  {t('tier1.detailsLabel')}
                  <span className="optional">{t('tier1.optional')}</span>
                </h2>
                <div className="sub">{t('tier1.detailsSub')}</div>
              </div>
              <div className="detail-grid">
                <div className="field">
                  <label>{t('tier1.locationLabel')}</label>
                  <input
                    className="input"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('tier1.locationPlaceholder')}
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label>{t('tier1.startDateLabel')}</label>
                  <input
                    className="input"
                    type="text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder={t('tier1.startDatePlaceholder')}
                    maxLength={50}
                  />
                </div>
                <div className="field">
                  <label>{t('tier1.employmentTypeLabel')}</label>
                  <select
                    className="select"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  >
                    <option value="">{t('tier1.selectType')}</option>
                    <option value="Fuldtid">{da ? 'Fuldtid' : 'Full-time'}</option>
                    <option value="Deltid">{da ? 'Deltid' : 'Part-time'}</option>
                    <option value="Tidsbegrænset">{da ? 'Tidsbegrænset' : 'Fixed-term'}</option>
                    <option value="Vikariat">{da ? 'Vikariat' : 'Temporary cover'}</option>
                    <option value="Freelance">Freelance</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t('tier1.workModeLabel')}</label>
                  <select
                    className="select"
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value)}
                  >
                    <option value="">{t('tier1.selectWorkMode')}</option>
                    <option value="På kontoret">{da ? 'På kontoret' : 'On-site'}</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Fuldt remote">{da ? 'Fuldt remote' : 'Fully remote'}</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Template upload */}
            <section className="block">
              <div className="block-head">
                <h2>
                  {t('tier1.templateLabel')}
                  <span className="optional">{t('tier1.optional')}</span>
                </h2>
                <div className="sub">{t('tier1.templateHint')}</div>
              </div>
              <label className={`upload${templateFile ? ' has-file' : ''}`}>
                <span className="icon">{templateFile ? '✓' : '↑'}</span>
                <span>
                  {templateFile ? (
                    <>
                      <span className="up-title">{templateFile.name}</span>
                      <br />
                      <span className="up-sub">
                        <button
                          type="button"
                          className="link-btn"
                          style={{ fontSize: 12 }}
                          onClick={(e) => { e.preventDefault(); setTemplateFile(null); }}
                        >
                          {t('tier1.templateRemove')}
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="up-title">{t('tier1.templateDrop')}</span>
                      <br />
                      <span className="up-sub">{t('tier1.templateSize')}</span>
                    </>
                  )}
                </span>
                <input
                  type="file"
                  accept=".docx"
                  hidden
                  onChange={(e) => setTemplateFile(e.target.files[0] || null)}
                />
              </label>
            </section>

            {error && <p className="error-text">{error}</p>}

            <div className="actionbar">
              <div className="actionbar-inner">
                <div className="meta">
                  {loadingIndices.size > 0 ? (
                    <>
                      <span className="bullet-loading-dot" style={{ marginRight: 8 }} aria-hidden="true" />
                      {t('tier1.checkingResearch')}
                    </>
                  ) : openChallenges > 0 ? (
                    <><strong>{openChallenges}</strong> {t('tier1.suggestionsWaiting', { count: openChallenges })}</>
                  ) : (
                    <><strong>{t('tier1.readyToGenerate')}</strong></>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loadingIndices.size > 0}
                >
                  {t('tier1.generateBtn')}
                  <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
