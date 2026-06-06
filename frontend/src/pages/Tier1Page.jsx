import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { checkBulletBias } from '../lib/biasRules';
import { runCompletenessCheck } from '../lib/completenessRules';
import { InputCompletenessCheck } from '../components/InputCompletenessCheck';
import { BulletChallengeCard } from '../components/BulletChallengeCard';
import { useBulletChallenges } from '../hooks/useBulletChallenges';
import TopBar from '../components/TopBar';
import Steps from '../components/Steps';

// ─── Inline bias warnings per bullet ─────────────────────────────────────────

function InlineBiasWarnings({ text, language }) {
  const violations = checkBulletBias(text, language);
  if (!violations.length) return null;
  return (
    <div className="inline-bias-list">
      {violations.map((v, i) => (
        <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
          <span className="inline-bias-label">{v.label}:</span>
          <span className="inline-bias-matches">
            {v.matchedTexts.map((t) => `"${t}"`).join(', ')}
          </span>
          <span className="inline-bias-tip">{v.suggestion}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Bullet inputs ────────────────────────────────────────────────────────────

function BulletInput({ bullets, onChange, language, challengeMap = {}, loadingIndices = new Set(), onDismissChallenge, onAcceptChallenge }) {
  const refs = useRef([]);

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

  const da = language !== 'en';

  return (
    <div className="bullets">
      {bullets.map((b, i) => (
        <div key={i} className="bullet-wrap">
          <div className="bullet">
            <span className="num">{i + 1}</span>
            <input
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              className="input"
              value={b}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              placeholder={
                i === 0
                  ? (da ? 'Beskriv et ansvarsområde, krav eller rammer' : 'Key responsibility or requirement')
                  : (da ? 'Endnu et punkt…' : 'Another point…')
              }
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
                  aria-label="Fjern"
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
              onAccept={(suggestion) => onAcceptChallenge(i, suggestion)}
              onDismiss={() => onDismissChallenge(i)}
            />
          )}
        </div>
      ))}
      {bullets.length < 10 && (
        <button type="button" className="add-bullet" onClick={add}>
          <span className="plus">+</span>
          {da ? 'Tilføj punkt' : 'Add bullet'}
        </button>
      )}
    </div>
  );
}

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
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(false);
  const da = language !== 'en';

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
              {da ? 'Ignorer' : 'Dismiss'}
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
        <span>
          {visible.length} {da ? 'mulig' : 'potential'}{visible.length !== 1 ? (da ? 'e' : '') : ''}{' '}
          bias{da ? '-markering' : ' issue'}{visible.length !== 1 ? (da ? 'er' : 's') : ''}
          {da ? ' fundet' : ' found'}
        </span>
        <button type="button" onClick={() => setExpanded((e) => !e)}>
          {expanded ? (da ? 'Skjul' : 'Hide') : (da ? 'Vis detaljer' : 'Show details')}
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
  const da = language !== 'en';
  return (
    <div className={`panel-col source ${side}`}>
      <div className="col-head">
        <div className="label">
          <span className={`vchip ${label === 'A' ? 'a' : 'b'}`} />
          <h2>Variant {label}</h2>
        </div>
        <div className="hint">
          {side === 'left'
            ? (da ? 'Klik for at tilføje →' : 'Click to add →')
            : (da ? '← Klik for at tilføje' : '← Click to add')}
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
  const da = language !== 'en';
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
            <h2>{da ? 'Dit opslag' : 'Your posting'}</h2>
            <span className="meta">
              {doc.length} {da ? 'afsnit' : 'sections'} · {da ? 'ca.' : '~'} {words} {da ? 'ord' : 'words'}
            </span>
          </div>
          <button className="clear" onClick={() => setDoc([])}>
            {da ? 'Ryd alt' : 'Clear all'}
          </button>
        </div>
        <div className="ws-scroll">
          <div className={`ws-doc${doc.length === 0 ? ' empty-state' : ''}`}>
            {doc.length === 0 ? (
              <div className="ws-empty">
                <span className="serif">
                  {da ? 'Klik på et afsnit for at tilføje det' : 'Click a section to add it'}
                </span>
                <span className="sm">
                  {da ? 'Eller træk sektioner hertil' : 'Or drag sections here'}
                </span>
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
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => saveEdit(block.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: 'var(--serif)', fontSize: 15.5, lineHeight: 1.65,
                        border: 'none', outline: 'none', background: 'transparent',
                        resize: 'vertical', minHeight: 60, width: '100%',
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

// ─── Steps config ─────────────────────────────────────────────────────────────

const STEP_STATES = {
  input:      [{ label: 'Input', state: 'active', n: 1 }, { label: 'Tjek', state: 'default', n: 2 }, { label: 'Generer', state: 'default', n: 3 }, { label: 'Download', state: 'default', n: 4 }],
  checklist:  [{ label: 'Input', state: 'done' },          { label: 'Tjek', state: 'active', n: 2 }, { label: 'Generer', state: 'default', n: 3 }, { label: 'Download', state: 'default', n: 4 }],
  generating: [{ label: 'Input', state: 'done' },          { label: 'Tjek', state: 'done' },         { label: 'Generer', state: 'active', n: 3 }, { label: 'Download', state: 'default', n: 4 }],
  results:    [{ label: 'Input', state: 'done' },          { label: 'Tjek', state: 'done' },         { label: 'Generer', state: 'done' },         { label: 'Download', state: 'active', n: 4 }],
  finalize:   [{ label: 'Input', state: 'done' },          { label: 'Tjek', state: 'done' },         { label: 'Generer', state: 'done' },         { label: 'Download', state: 'active', n: 4 }],
  refused:    [{ label: 'Input', state: 'active', n: 1 }, { label: 'Tjek', state: 'default', n: 2 }, { label: 'Generer', state: 'default', n: 3 }, { label: 'Download', state: 'default', n: 4 }],
};

// ─── Main page ────────────────────────────────────────────────────────────────

export function Tier1Page({ project }) {
  const navigate = useNavigate();
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

  const da = language !== 'en';

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

  // Select a variant (shows selected state + confirm bar)
  function handleSelectVariant(variant) {
    setSelectedVariant(variant);
    const content = variant === 'A' ? variantA : variantB;
    setFinalContent(content);
  }

  // Confirm selected variant → go to finalize/edit
  function confirmVariant() {
    if (!selectedVariant || selectedVariant === 'mix') return;
    setStep('finalize');
    api.post('/generate/tier1/save-selection', {
      project_id: project.id,
      selected_variant: selectedVariant,
      final_content: finalContent,
    }).catch(() => {});
  }

  // Start mix
  function startMix() {
    setSelectedVariant('mix');
    setFinalContent('');
    setStep('finalize');
  }

  // Download
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

  // ── Helper: title bias violations ──
  const titleViolations = jobTitle.trim() ? checkBulletBias(jobTitle, language) : [];
  const wordCountFinal = finalContent.trim().split(/\s+/).filter(Boolean).length;
  const wordCountA = variantA.trim().split(/\s+/).filter(Boolean).length;
  const wordCountB = variantB.trim().split(/\s+/).filter(Boolean).length;

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
            <h2>{da ? 'Genererer 2 varianter…' : 'Generating 2 variants…'}</h2>
            <p>
              {da
                ? 'Kører bias-tjek · Kalder Claude AI · Tager typisk 10–20 sekunder'
                : 'Running bias checks · Calling Claude AI · Usually 10–20 seconds'}
            </p>
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
            <h2>{da ? 'Indhold kan ikke genereres' : 'Content cannot be generated'}</h2>
            <p>
              {da
                ? 'Dette indhold kan ikke genereres, da det strider mod vores retningslinjer.'
                : 'This content cannot be generated as it violates our guidelines.'}
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              {da ? 'Prøv at omformulere din jobtitel og punkter.' : 'Try rephrasing your job title and bullets.'}
            </p>
            <button className="btn btn-secondary" onClick={() => setStep('input')}>
              ← {da ? 'Rediger input' : 'Edit inputs'}
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
            <div className="eyebrow">
              {da ? 'Trin 4 af 4 · Gennemse' : 'Step 4 of 4 · Review'}
            </div>
            <h1>{jobTitle}</h1>
            <div className="sub">
              <span className="lang">{da ? 'Dansk' : 'English'}</span>
              {' · '}
              {da ? '2 varianter genereret' : '2 variants generated'}
            </div>
            <div className="back-link">
              <button type="button" className="link-back" onClick={() => setStep('checklist')}>
                <span className="arrow">←</span>
                {da ? 'Rediger input' : 'Edit inputs'}
              </button>
            </div>
          </section>

          {biasWarnings.length > 0 && <BiasPanel warnings={biasWarnings} language={language} />}

          <div className="variants">
            {/* Variant A */}
            <div className={`variant${selectedVariant === 'A' ? ' selected' : ''}`}>
              <div className="v-head">
                <div className="v-name">
                  <h2>Variant A</h2>
                </div>
                <span className="wordcount">{wordCountA} {da ? 'ord' : 'words'}</span>
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
                  {da ? 'Vælg Variant A' : 'Select Variant A'}
                </button>
                <span className="selected-flag">
                  <span className="ok">✓</span>
                  {da ? 'Variant A valgt' : 'Variant A selected'}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { handleSelectVariant('A'); setStep('finalize'); }}
                >
                  {da ? 'Rediger' : 'Edit'}
                </button>
              </div>
            </div>

            {/* Variant B */}
            <div className={`variant${selectedVariant === 'B' ? ' selected' : ''}`}>
              <div className="v-head">
                <div className="v-name">
                  <h2>Variant B</h2>
                </div>
                <span className="wordcount">{wordCountB} {da ? 'ord' : 'words'}</span>
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
                  {da ? 'Vælg Variant B' : 'Select Variant B'}
                </button>
                <span className="selected-flag">
                  <span className="ok">✓</span>
                  {da ? 'Variant B valgt' : 'Variant B selected'}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { handleSelectVariant('B'); setStep('finalize'); }}
                >
                  {da ? 'Rediger' : 'Edit'}
                </button>
              </div>
            </div>
          </div>

          <div className="mix-cta">
            <button type="button" className="btn btn-secondary btn-lg" onClick={startMix}>
              {da ? 'Mix og tilpas' : 'Mix & customise'}
              <span className="arrow">→</span>
            </button>
            <span className="note">
              {da
                ? 'Vælg de bedste afsnit fra begge varianter og sæt dem sammen'
                : 'Pick the best sections from both variants and combine them'}
            </span>
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
                  {da ? 'Tidligere genereringer' : 'Earlier generations'}
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
                    <span className="h-meta">2 {da ? 'varianter' : 'variants'}</span>
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
                      {da ? 'Indlæs denne' : 'Load this'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm bar (appears when a variant is selected) */}
          <div className={`confirm-bar${selectedVariant && selectedVariant !== 'mix' ? ' show' : ''}`}>
            <div className="confirm-inner">
              <span className="what">
                <strong>Variant {selectedVariant}</strong>{' '}
                {da ? 'er valgt' : 'selected'}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={confirmVariant}
              >
                {da ? 'Gå videre til download' : 'Continue to download'}
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
              {da ? 'Tilpas og mix' : 'Mix & customise'}
              <span className="sub">
                {jobTitle} · {da ? 'Dansk' : 'English'}
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
            <strong>{da ? 'Dit opslag' : 'Your posting'}</strong>
            {' · '}
            {wordCountFinal} {da ? 'ord' : 'words'}
          </div>
          <div className="actions">
            {error && <span className="error-text" style={{ marginRight: 12 }}>{error}</span>}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep('results')}
            >
              {da ? 'Annullér' : 'Cancel'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading || !finalContent.trim()}
            >
              {downloading
                ? (da ? 'Forbereder…' : 'Preparing…')
                : (da ? 'Download .docx' : 'Download .docx')}
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
            <div className="eyebrow">
              {da ? 'Download' : 'Download'}
            </div>
            <h1>{jobTitle}</h1>
            <div className="sub">
              Variant {selectedVariant} · {da ? 'Dansk' : 'English'}
            </div>
            <div className="back-link">
              <button type="button" className="link-back" onClick={() => setStep('results')}>
                <span className="arrow">←</span>
                {da ? 'Varianter' : 'Variants'}
              </button>
            </div>
          </section>

          <div className="edit-section">
            <div className="field">
              <label className="field-label">
                {da ? 'Rediger inden download' : 'Edit before download'}
              </label>
              <div className="hint" style={{ marginBottom: 'var(--s-3)', fontSize: 13, color: 'var(--ink-3)' }}>
                {da
                  ? `${wordCountFinal} ord · Klik og rediger direkte i teksten`
                  : `${wordCountFinal} words · Click to edit directly`}
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
                <span>
                  {da ? 'Gemmes som' : 'Saved as'} .docx
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleDownload}
                disabled={downloading || !finalContent.trim()}
              >
                {downloading
                  ? (da ? 'Forbereder…' : 'Preparing…')
                  : (da ? 'Download som .docx' : 'Download as .docx')}
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
              {da ? 'Projekter' : 'Projects'}
            </button>
            <div className="hide-mobile">
              <Steps steps={STEP_STATES.input} />
            </div>
          </div>

          {/* Intro */}
          <section className="intro">
            <div className="eyebrow">
              {da ? 'Nyt jobopslag · Tier 1' : 'New job posting · Tier 1'}
            </div>
            <h1>{da ? 'Fortæl om rollen' : 'Tell us about the role'}</h1>
            <p>
              {da
                ? 'Skriv jobtitlen og 5–10 punkter om, hvad jobbet faktisk indebærer. Vi udfordrer dig undervejs, hvor forskningen siger noget andet.'
                : 'Write the job title and 5–10 bullets about what the role actually involves. We challenge you where the research says otherwise.'}
            </p>
          </section>

          {/* Language toggle */}
          <div className="outlang">
            <span className="lbl">{da ? 'Opslaget skrives på' : 'Posting language'}</span>
            <div className="seg">
              <button
                type="button"
                className={language === 'da' ? 'on' : ''}
                onClick={() => setLanguage('da')}
              >
                🇩🇰 Dansk
              </button>
              <button
                type="button"
                className={language === 'en' ? 'on' : ''}
                onClick={() => setLanguage('en')}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          <form onSubmit={handleFormSubmit}>
            {/* Job title */}
            <section className="block">
              <div className="block-head">
                <h2>{da ? 'Jobtitel' : 'Job title'}</h2>
                <div className="sub">
                  {da ? 'Den titel kandidaterne ser øverst i opslaget.' : 'The title candidates see at the top.'}
                </div>
              </div>
              <input
                type="text"
                className="input input-lg"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={da ? 'fx Senior HR-konsulent' : 'e.g. Senior Software Engineer'}
                maxLength={200}
                required
              />
              {titleViolations.length > 0 && (
                <div className="inline-bias-list" style={{ marginTop: 'var(--s-2)' }}>
                  {titleViolations.map((v, i) => (
                    <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
                      <span className="inline-bias-label">{v.label}:</span>
                      <span className="inline-bias-matches">
                        {v.matchedTexts.map((t) => `"${t}"`).join(', ')}
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
                  {da ? 'Om rollen' : 'About the role'}
                  <span className="bullet-count">
                    {bullets.filter((b) => b.trim()).length} / 10
                  </span>
                </h2>
                <div className="sub">
                  {da
                    ? 'Konkrete ansvarsområder, krav og rammer. Ét punkt pr. linje.'
                    : 'Concrete responsibilities, requirements and context. One bullet per line.'}
                </div>
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
                <h2>{da ? 'Detaljer' : 'Details'} <span className="optional">{da ? 'valgfrit' : 'optional'}</span></h2>
                <div className="sub">
                  {da ? 'Udfyld det, du kender. Resten kan tilføjes senere.' : 'Fill in what you know. The rest can be added later.'}
                </div>
              </div>
              <div className="detail-grid">
                <div className="field">
                  <label>{da ? 'Lokation' : 'Location'}</label>
                  <input
                    className="input"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={da ? 'fx København Ø' : 'e.g. Copenhagen / Remote'}
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label>{da ? 'Startdato' : 'Start date'}</label>
                  <input
                    className="input"
                    type="text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder={da ? 'fx 1. august 2026' : 'e.g. ASAP / 1 Aug 2026'}
                    maxLength={50}
                  />
                </div>
                <div className="field">
                  <label>{da ? 'Ansættelsestype' : 'Employment type'}</label>
                  <select
                    className="select"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  >
                    <option value="">{da ? 'Vælg type' : 'Select type'}</option>
                    <option value="Fuldtid">{da ? 'Fuldtid' : 'Full-time'}</option>
                    <option value="Deltid">{da ? 'Deltid' : 'Part-time'}</option>
                    <option value="Tidsbegrænset">{da ? 'Tidsbegrænset' : 'Fixed-term'}</option>
                    <option value="Vikariat">{da ? 'Vikariat' : 'Temporary cover'}</option>
                    <option value="Freelance">Freelance</option>
                  </select>
                </div>
                <div className="field">
                  <label>{da ? 'Arbejdsform' : 'Work mode'}</label>
                  <select
                    className="select"
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value)}
                  >
                    <option value="">{da ? 'Vælg arbejdsform' : 'Select work mode'}</option>
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
                  {da ? 'Virksomhedsskabelon' : 'Company template'}
                  <span className="optional">{da ? 'valgfrit' : 'optional'}</span>
                </h2>
                <div className="sub">
                  {da
                    ? 'Upload en .docx, så opslaget følger jeres tone og opsætning.'
                    : 'Upload a .docx so the posting matches your tone and layout.'}
                </div>
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
                          {da ? 'Fjern' : 'Remove'}
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="up-title">
                        {da ? 'Træk en fil hertil, eller vælg' : 'Drag a file here, or browse'}
                      </span>
                      <br />
                      <span className="up-sub">.docx · {da ? 'maks 5 MB' : 'max 5 MB'}</span>
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
                      {da ? 'Tjekker mod forskning…' : 'Checking against research…'}
                    </>
                  ) : openChallenges > 0 ? (
                    <><strong>{openChallenges}</strong> {da ? `forslag venter på dit svar` : `suggestion${openChallenges !== 1 ? 's' : ''} awaiting your response`}</>
                  ) : (
                    <><strong>{da ? 'Klar til at generere' : 'Ready to generate'}</strong></>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loadingIndices.size > 0}
                >
                  {da ? 'Generer jobopslag' : 'Generate job posting'}
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
