import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { checkBulletBias } from '../lib/biasRules';

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { key: 'input',      label: 'Input'    },
  { key: 'generating', label: 'Generate' },
  { key: 'results',    label: 'Review'   },
  { key: 'finalize',   label: 'Download' },
];
const STEP_ORDER = { input: 0, generating: 1, results: 2, finalize: 3 };

function StepIndicator({ current }) {
  const idx = STEP_ORDER[current] ?? 0;
  return (
    <div className="step-indicator">
      {STEPS.map((s, i) => (
        <div key={s.key} className="step-item-wrapper">
          <div className={`step-item ${i <= idx ? 'step-active' : ''} ${i === idx ? 'step-current' : ''}`}>
            <div className="step-num">{i < idx ? '✓' : i + 1}</div>
            <span className="step-label">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`step-line ${i < idx ? 'step-line-done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inline bias badge ────────────────────────────────────────────────────────

function InlineBiasWarnings({ text, language }) {
  const violations = checkBulletBias(text, language);
  if (!violations.length) return null;
  return (
    <div className="inline-bias-list">
      {violations.map((v, i) => (
        <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
          <span className={`bias-badge badge-${v.severity}`}>{v.severity}</span>
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

// ─── Bullet inputs with inline bias ─────────────────────────────────────────

function BulletInput({ bullets, onChange, language }) {
  const refs = useRef([]);

  function update(i, val) {
    const next = [...bullets];
    next[i] = val;
    onChange(next);
  }

  function add() {
    if (bullets.length < 8) onChange([...bullets, '']);
  }

  function remove(i) {
    if (bullets.length <= 1) return;
    onChange(bullets.filter((_, j) => j !== i));
  }

  function handleKeyDown(e, i) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i === bullets.length - 1 && bullets.length < 8) {
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

  return (
    <div className="bullet-inputs">
      {bullets.map((b, i) => (
        <div key={i} className="bullet-item">
          <div className="bullet-row">
            <span className="bullet-dot">•</span>
            <input
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              value={b}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              placeholder={i === 0 ? 'Key responsibility or requirement...' : 'Another bullet...'}
            />
            {bullets.length > 1 && (
              <button type="button" className="remove-bullet" onClick={() => remove(i)} aria-label="Remove">×</button>
            )}
          </div>
          {b.trim() && <InlineBiasWarnings text={b} language={language} />}
        </div>
      ))}
      {bullets.length < 8 && (
        <button type="button" className="add-bullet" onClick={add}>+ Add bullet</button>
      )}
    </div>
  );
}

// ─── Job posting preview (plain-text to structured HTML) ─────────────────────

function JobPostingPreview({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div className="posting-preview">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="preview-spacer" />;
        // Section heading: ends with ':', short, no internal full-stop
        if (t.endsWith(':') && t.length < 70 && !t.includes('. ')) {
          return <p key={i} className="preview-heading">{t}</p>;
        }
        // Bullet
        if (/^[•\-\*]\s/.test(t)) {
          return (
            <div key={i} className="preview-bullet">
              <span className="preview-bullet-dot">•</span>
              <span>{t.replace(/^[•\-\*]\s*/, '')}</span>
            </div>
          );
        }
        return <p key={i} className="preview-paragraph">{t}</p>;
      })}
    </div>
  );
}

// ─── Bias panel (post-generation warnings) ───────────────────────────────────

const SEV_BG     = { high: '#fee2e2', medium: '#fef3c7', low: '#f0fdf4' };
const SEV_BORDER = { high: '#fca5a5', medium: '#fcd34d', low: '#86efac' };

function BiasPanel({ warnings }) {
  const [dismissed, setDismissed] = useState(new Set());

  function key(w) { return `${w.category}-${w.matchedText || w.message}`; }
  function dismiss(w) { setDismissed((p) => new Set([...p, key(w)])); }

  const visible = warnings.filter((w) => !dismissed.has(key(w)));
  if (!visible.length) return null;

  function renderGroup(title, items) {
    if (!items.length) return null;
    return (
      <div className="bias-group">
        <p className="bias-section-label">{title}</p>
        {items.map((w, i) => (
          <div
            key={i}
            className="bias-warning"
            style={{ background: SEV_BG[w.severity] || '#f9fafb', borderColor: SEV_BORDER[w.severity] || '#e2e8f0' }}
          >
            <div className="bias-warning-content">
              <span className={`bias-badge badge-${w.severity}`}>{w.severity}</span>
              <span className="bias-label">{w.label || w.category}</span>
              {w.matchedText && <span className="bias-matched">"{w.matchedText}"</span>}
              {w.message    && <span className="bias-message">{w.message}</span>}
            </div>
            <button type="button" className="dismiss-btn" onClick={() => dismiss(w)}>Dismiss</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bias-panel">
      <h3 className="bias-panel-title">
        {visible.length} potential bias {visible.length === 1 ? 'issue' : 'issues'} found
      </h3>
      {renderGroup('In your input:', visible.filter((w) => w.source === 'input'))}
      {renderGroup('Variant A — format:', visible.filter((w) => w.source === 'variant_a'))}
      {renderGroup('Variant B — format:', visible.filter((w) => w.source === 'variant_b'))}
    </div>
  );
}

// ─── Variant card ─────────────────────────────────────────────────────────────

function VariantCard({ label, desc, content, onSelect, selected }) {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className={`variant-card ${selected ? 'variant-selected' : ''}`}>
      <div className="variant-header">
        <div>
          <h3>Variant {label}</h3>
          {desc && <p className="variant-desc">{desc}</p>}
        </div>
        <span className="word-count">{wordCount} words</span>
      </div>
      <div className="variant-content">
        <JobPostingPreview content={content} />
      </div>
      <button
        type="button"
        className={`select-variant-btn ${selected ? 'selected' : ''}`}
        onClick={onSelect}
      >
        {selected ? '✓ Selected' : `Use Variant ${label}`}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Tier1Page({ project }) {
  const navigate = useNavigate();
  const storageKey = `tier1-draft-${project.id}`;

  const [step, setStep] = useState('input');
  const [language, setLanguage]         = useState(project.output_language || 'da');
  const [jobTitle, setJobTitle]         = useState('');
  const [bullets, setBullets]           = useState(['', '', '', '']);
  const [location, setLocation]         = useState('');
  const [startDate, setStartDate]       = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [templateFile, setTemplateFile] = useState(null);
  const [biasWarnings, setBiasWarnings] = useState([]);
  const [variantA, setVariantA]         = useState('');
  const [variantB, setVariantB]         = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [finalContent, setFinalContent] = useState('');
  const [error, setError]               = useState(null);
  const [downloading, setDownloading]   = useState(false);

  // Restore localStorage draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.jobTitle)        setJobTitle(d.jobTitle);
        if (Array.isArray(d.bullets) && d.bullets.length) setBullets(d.bullets);
        if (d.language)        setLanguage(d.language);
        if (d.location)        setLocation(d.location);
        if (d.startDate)       setStartDate(d.startDate);
        if (d.employmentType)  setEmploymentType(d.employmentType);
      }
    } catch {}
  }, [storageKey]);

  // Autosave every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          jobTitle, bullets, language, location, startDate, employmentType,
        }));
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [storageKey, jobTitle, bullets, language, location, startDate, employmentType]);

  // Restore server-side outputs if project was previously generated
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
        if (data.variant_a || data.variant_b) setStep('results');
        if (data.selection?.final_content) {
          setSelectedVariant(data.selection.selected_variant);
          setFinalContent(data.selection.final_content);
          setStep('finalize');
        }
      })
      .catch(() => {}); // graceful — user can regenerate
  }, [project.id, project.completion_step]);

  async function handleGenerate(e) {
    e.preventDefault();
    const filled = bullets.filter((b) => b.trim());
    if (!jobTitle.trim()) { setError('Job title is required.'); return; }
    if (!filled.length)   { setError('At least one bullet is required.'); return; }
    setError(null);
    setStep('generating');

    try {
      const fd = new FormData();
      fd.append('project_id', project.id);
      fd.append('job_title', jobTitle.trim());
      fd.append('bullets', JSON.stringify(filled));
      fd.append('language', language);
      if (location)       fd.append('location', location.trim());
      if (startDate)      fd.append('start_date', startDate.trim());
      if (employmentType) fd.append('employment_type', employmentType.trim());
      if (templateFile)   fd.append('template', templateFile);

      const { data } = await api.post('/generate/tier1', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setBiasWarnings(data.bias_warnings || []);
      setVariantA(data.variant_a || '');
      setVariantB(data.variant_b || '');
      setStep('results');
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed. Please try again.');
      setStep('input');
    }
  }

  function selectVariant(variant) {
    const content = variant === 'A' ? variantA : variantB;
    setSelectedVariant(variant);
    setFinalContent(content);
    setStep('finalize');
    api.post('/generate/tier1/save-selection', {
      project_id: project.id, selected_variant: variant, final_content: content,
    }).catch(() => {});
  }

  function startMix() {
    setSelectedVariant('mix');
    const combined = `${variantA}\n\n---\n\n${variantB}`;
    setFinalContent(combined);
    setStep('finalize');
    api.post('/generate/tier1/save-selection', {
      project_id: project.id, selected_variant: 'mix', final_content: combined,
    }).catch(() => {});
  }

  async function handleDownload() {
    if (!finalContent.trim()) return;
    setDownloading(true);
    setError(null);
    try {
      const resp = await api.post(
        '/export/docx',
        { project_id: project.id, content: finalContent, job_title: jobTitle, language },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${jobTitle || 'job-posting'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.removeItem(storageKey);
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  // ── Job title also gets inline bias check ──
  const titleViolations = jobTitle.trim() ? checkBulletBias(jobTitle, language) : [];

  return (
    <div className="tier1-page">
      <nav className="top-nav">
        <button className="link-btn" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        <span className="nav-brand">Quick Job Post</span>
        <span className="nav-user">{project.name}</span>
      </nav>

      <div className="tier1-body">
        <StepIndicator current={step} />

        {/* ── INPUT ── */}
        {step === 'input' && (
          <form className="input-form card" onSubmit={handleGenerate}>
            <h2 className="form-heading">Create your job posting</h2>

            <div className="form-section">
              <label className="form-label">Output language</label>
              <div className="language-toggle">
                <button type="button" className={`lang-btn ${language === 'da' ? 'active' : ''}`} onClick={() => setLanguage('da')}>Danish</button>
                <button type="button" className={`lang-btn ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>English</button>
              </div>
            </div>

            <div className="form-section">
              <label className="form-label" htmlFor="job-title">Job title</label>
              <input
                id="job-title"
                type="text"
                className="form-input"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                maxLength={200}
                required
              />
              {titleViolations.length > 0 && (
                <div className="inline-bias-list" style={{ marginTop: '0.375rem' }}>
                  {titleViolations.map((v, i) => (
                    <div key={i} className={`inline-bias inline-bias-${v.severity}`}>
                      <span className={`bias-badge badge-${v.severity}`}>{v.severity}</span>
                      <span className="inline-bias-label">{v.label}:</span>
                      <span className="inline-bias-matches">{v.matchedTexts.map((t) => `"${t}"`).join(', ')}</span>
                      <span className="inline-bias-tip">{v.suggestion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-section">
              <label className="form-label">
                About the role
                <span className="form-hint"> — 5–6 bullets about responsibilities and what you're looking for</span>
              </label>
              <BulletInput bullets={bullets} onChange={setBullets} language={language} />
            </div>

            <div className="form-row">
              <div className="form-section form-col">
                <label className="form-label" htmlFor="location">Location <span className="form-hint">(optional)</span></label>
                <input
                  id="location"
                  type="text"
                  className="form-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Copenhagen / Remote"
                  maxLength={100}
                />
              </div>
              <div className="form-section form-col">
                <label className="form-label" htmlFor="start-date">Start date <span className="form-hint">(optional)</span></label>
                <input
                  id="start-date"
                  type="text"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="e.g. ASAP / 1 Aug 2026"
                  maxLength={50}
                />
              </div>
              <div className="form-section form-col">
                <label className="form-label" htmlFor="employment-type">Employment type <span className="form-hint">(optional)</span></label>
                <select
                  id="employment-type"
                  className="form-input"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                >
                  <option value="">— select —</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Internship">Internship</option>
                </select>
              </div>
            </div>

            <div className="form-section">
              <label className="form-label">
                Company template <span className="form-hint">(optional — .docx)</span>
              </label>
              <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
                Upload an existing job posting to match your company's tone and structure.
              </p>
              <input
                type="file"
                accept=".docx"
                className="file-input"
                onChange={(e) => setTemplateFile(e.target.files[0] || null)}
              />
              {templateFile && (
                <div className="file-selected">
                  <span>{templateFile.name}</span>
                  <button type="button" className="remove-file" onClick={() => setTemplateFile(null)}>×</button>
                </div>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" className="generate-btn">Generate job posting →</button>
          </form>
        )}

        {/* ── GENERATING ── */}
        {step === 'generating' && (
          <div className="generating-state card">
            <div className="spinner" />
            <p className="generating-title">Generating 2 variants...</p>
            <p className="generating-sub">Running bias checks · Calling Claude AI · Usually 10–20 seconds</p>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === 'results' && (
          <div className="results-step">
            <div className="results-header">
              <div>
                <h2 className="results-title">{jobTitle}</h2>
                <p className="results-sub">{language === 'da' ? 'Dansk' : 'English'} · 2 variants generated</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep('input')}>← Edit inputs</button>
            </div>

            {biasWarnings.length > 0 && <BiasPanel warnings={biasWarnings} />}

            <div className="variants-grid">
              <VariantCard
                label="A"
                desc="AIDA + WIIFM"
                content={variantA}
                onSelect={() => selectVariant('A')}
                selected={selectedVariant === 'A'}
              />
              <VariantCard
                label="B"
                desc="Tactical empathy + Cialdini"
                content={variantB}
                onSelect={() => selectVariant('B')}
                selected={selectedVariant === 'B'}
              />
            </div>

            <div className="mix-row">
              <button type="button" className="mix-btn" onClick={startMix}>Customize and mix →</button>
            </div>
          </div>
        )}

        {/* ── FINALIZE ── */}
        {step === 'finalize' && (
          <div className="finalize-step card">
            <div className="finalize-header">
              <div>
                <h2 className="form-heading">
                  {selectedVariant === 'mix' ? 'Customize your posting' : `Variant ${selectedVariant} — edit and download`}
                </h2>
                <p className="form-hint">Edit the text below before downloading.</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep('results')}>← Back to variants</button>
            </div>

            <div className="form-section" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Final job posting</label>
              <textarea
                className="mix-textarea"
                value={finalContent}
                onChange={(e) => setFinalContent(e.target.value)}
                rows={22}
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="download-section">
              <button
                type="button"
                className="download-btn"
                onClick={handleDownload}
                disabled={downloading || !finalContent.trim()}
              >
                {downloading ? 'Preparing...' : 'Download as .docx →'}
              </button>
              <p className="download-hint">
                {language === 'da'
                  ? 'Gemmes som Word-dokument og markerer projektet som færdigt'
                  : 'Saves as a Word document and marks the project as completed'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
