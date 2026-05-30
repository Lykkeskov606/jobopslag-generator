import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { key: 'input', label: 'Input' },
  { key: 'generating', label: 'Generate' },
  { key: 'results', label: 'Review' },
  { key: 'finalize', label: 'Download' },
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

// ─── Bullet inputs ────────────────────────────────────────────────────────────

function BulletInput({ bullets, onChange }) {
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
        <div key={i} className="bullet-row">
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
      ))}
      {bullets.length < 8 && (
        <button type="button" className="add-bullet" onClick={add}>+ Add bullet</button>
      )}
    </div>
  );
}

// ─── Bias panel ───────────────────────────────────────────────────────────────

const SEV_BG = { high: '#fee2e2', medium: '#fef3c7', low: '#f0fdf4' };
const SEV_BORDER = { high: '#fca5a5', medium: '#fcd34d', low: '#86efac' };

function BiasPanel({ warnings }) {
  const [dismissed, setDismissed] = useState(new Set());

  function dismiss(w) {
    setDismissed((prev) => new Set([...prev, warningKey(w)]));
  }

  function warningKey(w) {
    return `${w.category}-${w.matchedText || w.message}`;
  }

  const visible = warnings.filter((w) => !dismissed.has(warningKey(w)));
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
              {w.message && <span className="bias-message">{w.message}</span>}
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

function VariantCard({ label, content, onSelect, selected }) {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className={`variant-card ${selected ? 'variant-selected' : ''}`}>
      <div className="variant-header">
        <h3>Variant {label}</h3>
        <span className="word-count">{wordCount} words</span>
      </div>
      <div className="variant-content">
        <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.6 }}>{content}</p>
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
  const [language, setLanguage] = useState(project.output_language || 'da');
  const [jobTitle, setJobTitle] = useState('');
  const [bullets, setBullets] = useState(['', '', '', '']);
  const [templateFile, setTemplateFile] = useState(null);
  const [biasWarnings, setBiasWarnings] = useState([]);
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [finalContent, setFinalContent] = useState('');
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Restore localStorage draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.jobTitle) setJobTitle(d.jobTitle);
        if (Array.isArray(d.bullets) && d.bullets.length) setBullets(d.bullets);
        if (d.language) setLanguage(d.language);
      }
    } catch {}
  }, [storageKey]);

  // Autosave every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ jobTitle, bullets, language }));
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [storageKey, jobTitle, bullets, language]);

  // Restore server-side outputs if project has been generated before
  useEffect(() => {
    if (project.completion_step >= 3) {
      api.get(`/generate/tier1/${project.id}`)
        .then(({ data }) => {
          if (data.inputs) {
            setJobTitle(data.inputs.job_title || '');
            if (Array.isArray(data.inputs.bullets)) setBullets(data.inputs.bullets);
            if (data.inputs.language) setLanguage(data.inputs.language);
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
    }
  }, [project.id, project.completion_step]);

  async function handleGenerate(e) {
    e.preventDefault();
    const filled = bullets.filter((b) => b.trim());
    if (!jobTitle.trim()) { setError('Job title is required.'); return; }
    if (filled.length === 0) { setError('At least one bullet is required.'); return; }
    setError(null);
    setStep('generating');

    try {
      const fd = new FormData();
      fd.append('project_id', project.id);
      fd.append('job_title', jobTitle.trim());
      fd.append('bullets', JSON.stringify(filled));
      fd.append('language', language);
      if (templateFile) fd.append('template', templateFile);

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
      project_id: project.id,
      selected_variant: variant,
      final_content: content,
    }).catch(() => {});
  }

  function startMix() {
    setSelectedVariant('mix');
    const combined = `VARIANT A:\n\n${variantA}\n\n---\n\nVARIANT B:\n\n${variantB}`;
    setFinalContent(combined);
    setStep('finalize');
    api.post('/generate/tier1/save-selection', {
      project_id: project.id,
      selected_variant: 'mix',
      final_content: combined,
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

  return (
    <div className="tier1-page">
      <nav className="top-nav">
        <button className="link-btn" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        <span className="nav-brand">Quick Job Post</span>
        <span className="nav-user">{project.name}</span>
      </nav>

      <div className="tier1-body">
        <StepIndicator current={step} />

        {/* ── STEP: INPUT ── */}
        {step === 'input' && (
          <form className="input-form card" onSubmit={handleGenerate}>
            <h2 className="form-heading">Create your job posting</h2>

            <div className="form-section">
              <label className="form-label">Output language</label>
              <div className="language-toggle">
                <button
                  type="button"
                  className={`lang-btn ${language === 'da' ? 'active' : ''}`}
                  onClick={() => setLanguage('da')}
                >Danish</button>
                <button
                  type="button"
                  className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                >English</button>
              </div>
            </div>

            <div className="form-section">
              <label className="form-label" htmlFor="job-title">
                Job title
              </label>
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
            </div>

            <div className="form-section">
              <label className="form-label">
                About the role
                <span className="form-hint"> — 5–6 bullets describing key responsibilities and what you're looking for</span>
              </label>
              <BulletInput bullets={bullets} onChange={setBullets} />
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

            <button type="submit" className="generate-btn">
              Generate job posting →
            </button>
          </form>
        )}

        {/* ── STEP: GENERATING ── */}
        {step === 'generating' && (
          <div className="generating-state card">
            <div className="spinner" />
            <p className="generating-title">Generating 2 variants...</p>
            <p className="generating-sub">Running bias checks · Calling Claude AI · Usually 10–20 seconds</p>
          </div>
        )}

        {/* ── STEP: RESULTS ── */}
        {step === 'results' && (
          <div className="results-step">
            <div className="results-header">
              <div>
                <h2 className="results-title">{jobTitle}</h2>
                <p className="results-sub">
                  {language === 'da' ? 'Dansk' : 'English'} · 2 variants generated
                </p>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep('input')}>
                ← Edit inputs
              </button>
            </div>

            {biasWarnings.length > 0 && <BiasPanel warnings={biasWarnings} />}

            <div className="variants-grid">
              <VariantCard
                label="A"
                content={variantA}
                onSelect={() => selectVariant('A')}
                selected={selectedVariant === 'A'}
              />
              <VariantCard
                label="B"
                content={variantB}
                onSelect={() => selectVariant('B')}
                selected={selectedVariant === 'B'}
              />
            </div>

            <div className="mix-row">
              <button type="button" className="mix-btn" onClick={startMix}>
                Customize and mix →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: FINALIZE ── */}
        {step === 'finalize' && (
          <div className="finalize-step card">
            <div className="finalize-header">
              <div>
                <h2 className="form-heading">
                  {selectedVariant === 'mix' ? 'Customize your posting' : `Variant ${selectedVariant} — edit and download`}
                </h2>
                <p className="form-hint">You can edit the text below before downloading.</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep('results')}>
                ← Back to variants
              </button>
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
