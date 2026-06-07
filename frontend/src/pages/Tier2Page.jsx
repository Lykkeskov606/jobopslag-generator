import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { checkBulletBias } from '../lib/biasRules';
import { BulletInput } from '../components/BulletInput';
import { useBulletChallenges } from '../hooks/useBulletChallenges';
import TopBar from '../components/TopBar';
import Steps from '../components/Steps';

// ─── Draft persistence ────────────────────────────────────────────────────────

function draftKey(id) { return `tier2-draft-${id}`; }

function loadDraft(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; }
}

function saveDraft(id, data) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(data)); } catch {}
}

// ─── Steps indicator builder ──────────────────────────────────────────────────

function buildSteps(current, t) {
  const labels = [
    t('tier2.stepTemplate'),
    t('tier2.stepInfo'),
    t('tier2.stepFit'),
    t('tier2.stepReqs'),
    t('tier2.stepAnalysis'),
  ];
  return labels.map((label, i) => ({
    label,
    n: i + 1,
    state: current > i + 1 ? 'done' : current === i + 1 ? 'active' : 'default',
  }));
}

// ─── Fit criteria bias check (client-side, same as bullet bias) ───────────────

function FitFieldBias({ text, language }) {
  const violations = checkBulletBias(text, language);
  if (!violations.length) return null;
  return (
    <div className="inline-bias-list" style={{ marginTop: 4 }}>
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

// ─── Step 1: Template upload ──────────────────────────────────────────────────

function Step1Template({ state, setState, onNext, onSkip, t, da }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    const allowed = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.pdf');
    if (!allowed) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('template', file);
      const { data } = await api.post('/tier2/parse-template', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setState((s) => ({ ...s, templateText: data.templateText, templateFilename: data.filename, skipped: false }));
    } catch (err) {
      const msg = err.response?.data?.message
        || (da ? 'Kunne ikke læse filen. Prøv en anden fil eller spring over.' : 'Could not read file. Try another or skip.');
      setUploadError(msg);
      setState((s) => ({ ...s, templateText: null, templateFilename: null, skipped: false }));
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={() => window.history.back()}>
          <span className="arrow">←</span> {da ? 'Dashboard' : 'Dashboard'}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(1, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.eyebrow')} · {t('tier2.stepTemplate')}</div>
        <h1>{t('tier2.step1Title')}</h1>
        <p>{t('tier2.step1Sub')}</p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>
            {t('tier2.step1Drop')}
            <span className="optional">{t('tier1.optional')}</span>
          </h2>
          <div className="sub">{t('tier2.step1Size')}</div>
        </div>

        {uploadError && (
          <p className="error-text" style={{ marginBottom: 12 }}>{uploadError}</p>
        )}

        <label
          className={`upload${state.templateFilename ? ' has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={dragging ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
        >
          <input
            type="file"
            accept=".docx,.pdf"
            hidden
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploading ? (
            <div className="spinner" style={{ width: 24, height: 24 }} />
          ) : state.templateFilename ? (
            <>
              <span className="icon">✓</span>
              <span>
                <span className="up-title">{state.templateFilename}</span>
                <br />
                <span className="up-sub">
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setState((s) => ({ ...s, templateText: null, templateFilename: null, skipped: false }));
                      setUploadError(null);
                    }}
                  >
                    {t('tier2.step1Remove')}
                  </button>
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="icon">↑</span>
              <span>
                <span className="up-title">{t('tier2.step1Drop')}</span>
                <br />
                <span className="up-sub">{t('tier2.step1Size')}</span>
              </span>
            </>
          )}
        </label>
      </section>

      <div className="actionbar">
        <div className="actionbar-inner">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setState((s) => ({ ...s, templateText: null, templateFilename: null, skipped: true }));
              onSkip();
            }}
          >
            {t('tier2.step1Skip')}
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={onNext}
            disabled={!state.templateFilename && !state.skipped}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Basis info ───────────────────────────────────────────────────────

function Step2Info({ state, setState, onNext, onBack, t, project }) {
  const { i18n } = useTranslation();
  const da = i18n.language === 'da';
  const valid = state.jobTitle.trim().length > 0;

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t('tier2.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(2, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.eyebrow')} · {t('tier2.stepInfo')}</div>
        <h1>{t('tier2.step2Title')}</h1>
        <p>{t('tier2.step2Sub')}</p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>
            {t('tier2.jobTitleLabel')}
            <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
          </h2>
        </div>
        <input
          className="input input-lg"
          type="text"
          value={state.jobTitle}
          onChange={(e) => setState((s) => ({ ...s, jobTitle: e.target.value }))}
          placeholder={t('tier2.jobTitlePlaceholder')}
          maxLength={200}
        />
      </section>

      <section className="block">
        <div className="block-head">
          <h2>
            {da ? 'Detaljer' : 'Details'}
            <span className="optional">{t('tier1.optional')}</span>
          </h2>
        </div>
        <div className="detail-grid">
          <div className="field">
            <label>{t('tier2.needDateLabel')}</label>
            <input
              className="input"
              type="text"
              value={state.needDate}
              onChange={(e) => setState((s) => ({ ...s, needDate: e.target.value }))}
              placeholder={t('tier2.needDatePlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="field">
            <label>{t('tier2.departmentLabel')}</label>
            <input
              className="input"
              type="text"
              value={state.department}
              onChange={(e) => setState((s) => ({ ...s, department: e.target.value }))}
              placeholder={t('tier2.departmentPlaceholder')}
              maxLength={200}
            />
          </div>
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>{t('tier2.teamCompositionLabel')}</h2>
          <div className="sub">
            {da ? 'Beskriv hvem kandidaten skal samarbejde med' : 'Describe who the candidate will work with'}
          </div>
        </div>
        <textarea
          className="textarea"
          rows={3}
          value={state.teamComposition}
          onChange={(e) => setState((s) => ({ ...s, teamComposition: e.target.value }))}
          placeholder={t('tier2.teamCompositionPlaceholder')}
          maxLength={500}
          style={{ resize: 'vertical' }}
        />
      </section>

      <section className="block">
        <div className="block-head">
          <h2>{t('tier2.outputLangLabel')}</h2>
        </div>
        <div className="seg">
          {[['da', t('tier2.languageDa')], ['en', t('tier2.languageEn')]].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={state.outputLanguage === val ? 'on' : ''}
              onClick={() => setState((s) => ({ ...s, outputLanguage: val }))}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="actionbar">
        <div className="actionbar-inner">
          <div />
          <button
            className="btn btn-primary btn-lg"
            onClick={onNext}
            disabled={!valid}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Fit criteria ─────────────────────────────────────────────────────

const FIT_FIELDS = ['job_fit', 'team_fit', 'leader_fit', 'culture_fit'];

function Step3FitCriteria({ state, setState, onNext, onBack, t, project }) {
  const [generating, setGenerating] = useState(false);

  const language = state.outputLanguage || 'da';

  async function generate() {
    setGenerating(true);
    try {
      const { data } = await api.post('/tier2/fit-criteria', {
        project_id: project.id,
        job_title: state.jobTitle,
        department: state.department,
        team_composition: state.teamComposition,
        language,
      });
      setState((s) => ({
        ...s,
        fitCriteria: {
          job_fit: data.job_fit || '',
          team_fit: data.team_fit || '',
          leader_fit: data.leader_fit || '',
          culture_fit: data.culture_fit || '',
        },
        fitGenerated: true,
      }));
    } catch {
      // Non-fatal — user can still type manually
    } finally {
      setGenerating(false);
    }
  }

  // Auto-generate on first entry if not yet generated
  useEffect(() => {
    if (!state.fitGenerated && state.jobTitle.trim()) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelKey = { job_fit: 'fitJobLabel', team_fit: 'fitTeamLabel', leader_fit: 'fitLeaderLabel', culture_fit: 'fitCultureLabel' };
  const descKey  = { job_fit: 'fitJobDesc',  team_fit: 'fitTeamDesc',  leader_fit: 'fitLeaderDesc',  culture_fit: 'fitCultureDesc'  };

  const allFilled = FIT_FIELDS.every((f) => (state.fitCriteria?.[f] || '').trim().length > 0);

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t('tier2.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(3, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.eyebrow')} · {t('tier2.stepFit')}</div>
        <h1>{t('tier2.step3Title')}</h1>
        <p>{t('tier2.step3Sub')}</p>
      </section>

      {generating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, color: 'var(--ink-2)' }}>
          <div className="spinner" style={{ width: 18, height: 18 }} />
          <span>{t('tier2.step3Generating')}</span>
        </div>
      )}

      <section className="block">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {FIT_FIELDS.map((field) => (
            <div key={field} className="ccard">
              <h3>{t(`tier2.${labelKey[field]}`)}</h3>
              <p className="why" style={{ marginBottom: 12 }}>{t(`tier2.${descKey[field]}`)}</p>
              <textarea
                className="textarea"
                rows={4}
                value={state.fitCriteria?.[field] || ''}
                onChange={(e) => setState((s) => ({
                  ...s,
                  fitCriteria: { ...(s.fitCriteria || {}), [field]: e.target.value },
                }))}
                placeholder={generating ? '…' : ''}
                style={{ resize: 'vertical', minHeight: 80 }}
                disabled={generating}
              />
              <FitFieldBias text={state.fitCriteria?.[field] || ''} language={language} />
            </div>
          ))}
        </div>
      </section>

      {!generating && !state.fitGenerated && (
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={generate}>
            {t('tier2.step3GenerateBtn')}
          </button>
        </div>
      )}

      <div className="actionbar">
        <div className="actionbar-inner">
          <div />
          <button
            className="btn btn-primary btn-lg"
            onClick={onNext}
            disabled={generating || !allFilled}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Requirements (bullets) ──────────────────────────────────────────

function Step4Requirements({ state, setState, onNext, onBack, t, project }) {
  const language = state.outputLanguage || 'da';

  const {
    challengeMap,
    loadingIndices,
    dismiss: dismissChallenge,
    markApproved: markChallengeApproved,
  } = useBulletChallenges({
    projectId: project.id,
    jobTitle: state.jobTitle,
    bullets: state.requirements,
    language,
    debounceMs: 2000,
  });

  function acceptChallenge(i, suggestion) {
    if (suggestion?.trim()) {
      markChallengeApproved(i, suggestion.trim());
      setState((s) => {
        const next = [...(s.requirements || [''])];
        next[i] = suggestion.trim();
        return { ...s, requirements: next };
      });
    }
    dismissChallenge(i);
  }

  const hasAtLeastOne = (state.requirements || ['']).some((b) => b.trim());

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t('tier2.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(4, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.eyebrow')} · {t('tier2.stepReqs')}</div>
        <h1>{t('tier2.step4Title')}</h1>
        <p>{t('tier2.step4Sub')}</p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>
            {t('tier2.stepReqs')}
            <span className="bullet-count">
              {(state.requirements || ['']).filter((b) => b.trim()).length} / 10
            </span>
          </h2>
          <div className="sub">
            <span className="pills-row">
              {['dim1', 'dim2', 'dim3'].map((k) => (
                <span key={k} className="pill" style={{ marginRight: 6 }}>
                  {t(`tier2.${k}`)}
                </span>
              ))}
            </span>
          </div>
        </div>

        <BulletInput
          bullets={state.requirements || ['']}
          onChange={(bullets) => setState((s) => ({ ...s, requirements: bullets }))}
          language={language}
          challengeMap={challengeMap}
          loadingIndices={loadingIndices}
          onDismissChallenge={dismissChallenge}
          onAcceptChallenge={acceptChallenge}
        />
      </section>

      <div className="actionbar">
        <div className="actionbar-inner">
          <div />
          <button
            className="btn btn-primary btn-lg"
            onClick={onNext}
            disabled={!hasAtLeastOne}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Job analysis ─────────────────────────────────────────────────────

const JA_QUESTION_TYPES = ['best', 'worst', 'hidden'];

function Step5JobAnalysis({ state, setState, onNext, onBack, t, project }) {
  const language = state.outputLanguage || 'da';
  const [subStep, setSubStep] = useState(1);
  const [challenge, setChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const challengeTimer = useRef(null);

  const qType = JA_QUESTION_TYPES[subStep - 1]; // 'best' | 'worst' | 'hidden'
  const answerKey = `ja_${qType}`;
  const answer = state[answerKey] || '';

  const titleKey = `step5Q${subStep}Title`;
  const subKey   = `step5Q${subStep}Sub`;
  const phKey    = `step5Q${subStep}Placeholder`;

  // Debounced AI challenge
  useEffect(() => {
    setChallenge(null);
    clearTimeout(challengeTimer.current);
    if (answer.trim().length < 25) return;
    challengeTimer.current = setTimeout(async () => {
      setChallengeLoading(true);
      try {
        const { data } = await api.post('/tier2/challenge-answer', {
          project_id: project.id,
          question_type: qType,
          answer,
          language,
        });
        if (data.challenge) setChallenge(data);
      } catch {
        // Graceful degradation — challenge is supplementary
      } finally {
        setChallengeLoading(false);
      }
    }, 2500);
    return () => clearTimeout(challengeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, qType]);

  // Reset challenge when switching sub-step
  useEffect(() => {
    setChallenge(null);
    clearTimeout(challengeTimer.current);
  }, [subStep]);

  function goNext() {
    if (subStep < 3) {
      setSubStep((s) => s + 1);
    } else {
      onNext();
    }
  }

  function goBack() {
    if (subStep > 1) {
      setSubStep((s) => s - 1);
    } else {
      onBack();
    }
  }

  const isLastSub = subStep === 3;
  const hasAnswer = answer.trim().length > 0;

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={goBack}>
          <span className="arrow">←</span> {t('tier2.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(5, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.subStep', { n: subStep })}</div>
        <h1>{t(`tier2.${titleKey}`)}</h1>
        <p>{t(`tier2.${subKey}`)}</p>
      </section>

      <section className="block">
        <div className="field">
          <textarea
            className="textarea"
            rows={6}
            value={answer}
            onChange={(e) => setState((s) => ({ ...s, [answerKey]: e.target.value }))}
            placeholder={t(`tier2.${phKey}`)}
            style={{ resize: 'vertical', minHeight: 120, width: '100%' }}
          />
        </div>

        {challengeLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--ink-3)', fontSize: 13 }}>
            <span className="bullet-loading-dot" aria-hidden="true" />
            AI vurderer…
          </div>
        )}

        {challenge && !challengeLoading && (
          <div className="challenge" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginBottom: 8 }}>
              {t('tier2.challengeTitle')}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>{challenge.challenge}</p>
            {challenge.probe && (
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--ink-2)', fontStyle: 'italic' }}>
                {challenge.probe}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setChallenge(null)}>
                {t('tier2.challengeDismiss')}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setChallenge(null)}>
                {t('tier2.challengeAccept')}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="actionbar">
        <div className="actionbar-inner">
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            {subStep} / 3
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={goNext}
            disabled={!hasAnswer}
          >
            {isLastSub ? t('tier2.finishAnalysis') : t('tier2.nextQuestion')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tier2Page — main orchestrator ────────────────────────────────────────────

export function Tier2Page({ project }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const da = i18n.language === 'da';
  const [appStep, setAppStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Unified state blob — persisted to localStorage and API
  const [state, _setState] = useState(() => {
    const draft = loadDraft(project.id);
    return draft || {
      // Step 1
      templateText: null, templateFilename: null, skipped: false,
      // Step 2
      jobTitle: project.name !== 'Unavngivet kladde' && project.name !== 'Untitled draft' ? project.name : '',
      needDate: '', department: '', teamComposition: '', outputLanguage: project.output_language || 'da',
      // Step 3
      fitCriteria: { job_fit: '', team_fit: '', leader_fit: '', culture_fit: '' },
      fitGenerated: false,
      // Step 4
      requirements: [''],
      // Step 5
      ja_best: '', ja_worst: '', ja_hidden: '',
    };
  });

  function setState(updater) {
    _setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveDraft(project.id, next);
      return next;
    });
  }

  // Load saved steps from API on mount
  useEffect(() => {
    api.get(`/tier2/${project.id}`)
      .then(({ data }) => {
        if (!data.steps || Object.keys(data.steps).length === 0) return;
        const draft = loadDraft(project.id);
        if (draft) return; // Prefer local draft (more recent)

        const steps = data.steps;
        _setState((prev) => {
          const next = { ...prev };
          if (steps[1]) { next.templateText = steps[1].templateText ?? null; next.templateFilename = steps[1].filename ?? null; next.skipped = steps[1].skipped ?? false; }
          if (steps[2]) { next.jobTitle = steps[2].jobTitle ?? prev.jobTitle; next.needDate = steps[2].needDate ?? ''; next.department = steps[2].department ?? ''; next.teamComposition = steps[2].teamComposition ?? ''; next.outputLanguage = steps[2].outputLanguage ?? 'da'; }
          if (steps[3]) { next.fitCriteria = steps[3].fitCriteria ?? prev.fitCriteria; next.fitGenerated = true; }
          if (steps[4]) { next.requirements = steps[4].requirements ?? ['']; }
          if (steps[5]) { next.ja_best = steps[5].best ?? ''; next.ja_worst = steps[5].worst ?? ''; next.ja_hidden = steps[5].hidden ?? ''; }

          // Restore step from furthest saved
          const maxStep = Math.max(...Object.keys(steps).map(Number));
          if (maxStep >= 1) setAppStep(Math.min(maxStep, 5));

          return next;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveStep(stepNumber, data) {
    setSaving(true);
    try {
      await api.post('/tier2/save-step', {
        project_id: project.id,
        step_number: stepNumber,
        input_data: data,
      });
    } catch {
      // Non-fatal — draft is in localStorage
    } finally {
      setSaving(false);
    }
  }

  // Step advancement handlers
  // FIX 4: fromSkip passed explicitly to avoid race condition with setState
  async function toStep2({ fromSkip = false } = {}) {
    const skipFlag = fromSkip || state.skipped;
    await saveStep(1, { templateText: state.templateText, filename: state.templateFilename, skipped: skipFlag });
    setAppStep(2);
  }

  async function toStep3() {
    await saveStep(2, { jobTitle: state.jobTitle, needDate: state.needDate, department: state.department, teamComposition: state.teamComposition, outputLanguage: state.outputLanguage });
    // Sync project name
    if (state.jobTitle.trim()) {
      api.patch(`/projects/${project.id}`, { name: state.jobTitle.trim() }).catch(() => {});
    }
    setAppStep(3);
  }

  async function toStep4() {
    await saveStep(3, { fitCriteria: state.fitCriteria });
    setAppStep(4);
  }

  async function toStep5() {
    await saveStep(4, { requirements: state.requirements });
    setAppStep(5);
  }

  async function toComplete() {
    await saveStep(5, { best: state.ja_best, worst: state.ja_worst, hidden: state.ja_hidden });
    // Steps 6-9 built in Fase 5 — for now navigate to a placeholder
    navigate(`/projects/${project.id}/outputs`);
  }

  if (loading) {
    return (
      <div className="app">
        <TopBar active="projects" />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const stepProps = { state, setState, t, project, da };

  return (
    <div className="app s-input">
      <TopBar active="projects" />
      <main>
        {appStep === 1 && (
          <Step1Template
            {...stepProps}
            onNext={() => toStep2()}
            onSkip={() => toStep2({ fromSkip: true })}
          />
        )}
        {appStep === 2 && (
          <Step2Info
            {...stepProps}
            onNext={toStep3}
            onBack={() => setAppStep(1)}
          />
        )}
        {appStep === 3 && (
          <Step3FitCriteria
            {...stepProps}
            onNext={toStep4}
            onBack={() => setAppStep(2)}
          />
        )}
        {appStep === 4 && (
          <Step4Requirements
            {...stepProps}
            onNext={toStep5}
            onBack={() => setAppStep(3)}
          />
        )}
        {appStep === 5 && (
          <Step5JobAnalysis
            {...stepProps}
            onNext={toComplete}
            onBack={() => setAppStep(4)}
          />
        )}
      </main>
    </div>
  );
}
