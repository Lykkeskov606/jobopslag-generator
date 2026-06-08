import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { BulletInput } from '../components/BulletInput';
import { JobPostInputSection } from '../components/JobPostInputSection';
import { InputCompletenessCheck } from '../components/InputCompletenessCheck';
import { useBulletChallenges } from '../hooks/useBulletChallenges';
import { useScrollAnchor } from '../hooks/useScrollAnchor';
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
          <span className="arrow">←</span> Dashboard
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

// ─── Step 2: Jobopslagets indhold (reuses Tier 1 input section) ──────────────

function Step2Info({ state, setState, onNext, onBack, t, project }) {
  const { i18n } = useTranslation();
  const da = i18n.language === 'da';
  const language = state.outputLanguage || 'da';
  const [subStep, setSubStep] = useState('form'); // 'form' | 'completeness'

  const { challengeMap, loadingIndices, dismiss: dismissChallenge, markApproved } = useBulletChallenges({
    projectId: project.id,
    jobTitle: state.jobTitle,
    bullets: state.bullets || [''],
    language,
    debounceMs: 1800,
  });

  function handleAcceptChallenge(i, suggestion) {
    if (!suggestion?.trim()) return;
    markApproved(i, suggestion.trim());
    setState((s) => {
      const next = [...(s.bullets || [''])];
      next[i] = suggestion.trim();
      return { ...s, bullets: next };
    });
    dismissChallenge(i);
  }

  const setJobTitle        = (v) => setState((s) => ({ ...s, jobTitle: v }));
  const setBullets         = (v) => setState((s) => ({ ...s, bullets: v }));
  const setLanguage        = (v) => setState((s) => ({ ...s, outputLanguage: v }));
  const setLocation        = (v) => setState((s) => ({ ...s, location: v }));
  const setStartDate       = (v) => setState((s) => ({ ...s, startDate: v }));
  const setEmploymentType  = (v) => setState((s) => ({ ...s, employmentType: v }));
  const setWorkMode        = (v) => setState((s) => ({ ...s, workMode: v }));
  const setDepartment      = (v) => setState((s) => ({ ...s, department: v }));
  const setTeamComposition = (v) => setState((s) => ({ ...s, teamComposition: v }));

  const filledBullets  = (state.bullets || ['']).filter((b) => b.trim()).length;
  const valid          = state.jobTitle.trim().length > 0 && filledBullets > 0;
  const openChallenges = Object.keys(challengeMap).length;

  function handleNext() {
    setSubStep('completeness');
  }

  function handleResetDraft() {
    if (!window.confirm(da ? 'Er du sikker? Alt udfyldt her nulstilles.' : 'Are you sure? All content here will be reset.')) return;
    localStorage.removeItem(draftKey(project.id));
    setState((s) => ({
      ...s,
      jobTitle: '', bullets: [''],
      location: '', startDate: '', employmentType: '', workMode: '',
      department: '', teamComposition: '',
    }));
  }

  if (subStep === 'completeness') {
    return (
      <InputCompletenessCheck
        jobTitle={state.jobTitle}
        bullets={(state.bullets || ['']).filter((b) => b.trim())}
        location={state.location || ''}
        workMode={state.workMode || ''}
        department={state.department || ''}
        teamComposition={state.teamComposition || ''}
        language={language}
        projectId={project.id}
        onBack={() => setSubStep('form')}
        onProceed={() => onNext()}
      />
    );
  }

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

      {/* Shared input section — same fields as Tier 1 incl. department + team composition */}
      <JobPostInputSection
        jobTitle={state.jobTitle}                  setJobTitle={setJobTitle}
        bullets={state.bullets || ['']}            setBullets={setBullets}
        language={language}                        setLanguage={setLanguage}
        location={state.location || ''}            setLocation={setLocation}
        startDate={state.startDate || ''}          setStartDate={setStartDate}
        employmentType={state.employmentType || ''} setEmploymentType={setEmploymentType}
        workMode={state.workMode || ''}            setWorkMode={setWorkMode}
        department={state.department || ''}        setDepartment={setDepartment}
        teamComposition={state.teamComposition || ''} setTeamComposition={setTeamComposition}
        challengeMap={challengeMap}
        loadingIndices={loadingIndices}
        onDismissChallenge={dismissChallenge}
        onAcceptChallenge={handleAcceptChallenge}
      />

      <div className="actionbar">
        <div className="actionbar-inner">
          <div className="meta">
            {loadingIndices.size > 0 ? (
              <>
                <span className="bullet-loading-dot" style={{ marginRight: 8 }} aria-hidden="true" />
                {da ? 'Analyserer…' : 'Analysing…'}
              </>
            ) : openChallenges > 0 ? (
              <><strong>{openChallenges}</strong> {da ? 'forslag venter' : 'suggestions waiting'}</>
            ) : null}
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleNext}
            disabled={!valid}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'right', marginTop: 4 }}>
        <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={handleResetDraft}>
          {da ? 'Nulstil kladde' : 'Reset draft'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Fit criteria ─────────────────────────────────────────────────────

const FIT_FIELDS = ['job_fit', 'team_fit', 'leader_fit', 'culture_fit'];

function Step3FitCriteria({ state, setState, onNext, onBack, t, project, da }) {
  const [generating, setGenerating] = useState(false);
  const language = state.outputLanguage || 'da';
  const fitSuggestionCount = Object.values(state.fitSuggestions || {}).filter(Boolean).length;
  useScrollAnchor(fitSuggestionCount);

  async function generate() {
    setGenerating(true);
    try {
      const { data } = await api.post('/tier2/fit-criteria', {
        project_id: project.id,
        job_title: state.jobTitle,
        department: state.department || '',
        team_composition: state.teamComposition || '',
        language,
        bullets: (state.bullets || []).filter((b) => b.trim()),
      });
      setState((s) => ({
        ...s,
        fitSuggestions: {
          job_fit: data.job_fit || '',
          team_fit: data.team_fit || '',
          leader_fit: data.leader_fit || '',
          culture_fit: data.culture_fit || '',
        },
        fitGenerated: true,
      }));
    } catch {
      // Non-fatal
    } finally {
      setGenerating(false);
    }
  }

  // Auto-generate once on first entry
  useEffect(() => {
    if (!state.fitGenerated && state.jobTitle.trim()) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelKey = { job_fit: 'fitJobLabel', team_fit: 'fitTeamLabel', leader_fit: 'fitLeaderLabel', culture_fit: 'fitCultureLabel' };
  const descKey  = { job_fit: 'fitJobDesc',  team_fit: 'fitTeamDesc',  leader_fit: 'fitLeaderDesc',  culture_fit: 'fitCultureDesc' };

  const allFilled = FIT_FIELDS.every((f) => (state.fitCriteria?.[f] || '').trim().length > 0);

  function handleResetDraft() {
    if (!window.confirm(da ? 'Er du sikker? Alt udfyldt her nulstilles.' : 'Are you sure? All content here will be reset.')) return;
    localStorage.removeItem(draftKey(project.id));
    setState((s) => ({
      ...s,
      fitCriteria: { job_fit: '', team_fit: '', leader_fit: '', culture_fit: '' },
      fitSuggestions: null,
      fitGenerated: false,
    }));
  }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {FIT_FIELDS.map((field) => {
            const suggestion = state.fitSuggestions?.[field] || '';
            return (
              <div key={field} className="ccard">
                <h3>{t(`tier2.${labelKey[field]}`)}</h3>
                <p className="why" style={{ marginBottom: 12 }}>{t(`tier2.${descKey[field]}`)}</p>

                {/* AI suggestion card */}
                {suggestion && (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--accent)',
                    borderRadius: 6,
                    padding: '12px 16px',
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
                      {t('tier2.step3SuggestionLabel')}
                    </div>
                    <p style={{ fontSize: 14, margin: '0 0 12px', lineHeight: 1.65 }}>{suggestion}</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 13, padding: '6px 14px' }}
                        onClick={() => setState((s) => ({
                          ...s,
                          fitCriteria: { ...(s.fitCriteria || {}), [field]: suggestion },
                          fitSuggestions: { ...(s.fitSuggestions || {}), [field]: '' },
                        }))}
                      >
                        {t('tier2.step3UseProposal')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 13, padding: '6px 14px' }}
                        onClick={() => setState((s) => ({
                          ...s,
                          fitSuggestions: { ...(s.fitSuggestions || {}), [field]: '' },
                        }))}
                      >
                        {t('tier2.step3IgnoreProposal')}
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  className="textarea"
                  rows={4}
                  value={state.fitCriteria?.[field] || ''}
                  onChange={(e) => setState((s) => ({
                    ...s,
                    fitCriteria: { ...(s.fitCriteria || {}), [field]: e.target.value },
                  }))}
                  placeholder={suggestion ? t('tier2.step3WithSuggestion') : t('tier2.step3NoSuggestion')}
                  style={{ resize: 'vertical', minHeight: 80 }}
                  disabled={generating}
                />
              </div>
            );
          })}
        </div>
      </section>

      {state.fitGenerated && !generating && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={generate}>
            {t('tier2.step3Regenerate')}
          </button>
        </div>
      )}

      <div className="actionbar">
        <div className="actionbar-inner">
          <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={handleResetDraft}>
            {da ? 'Nulstil kladde' : 'Reset draft'}
          </button>
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

// ─── Step 4: Kandidatprofil ───────────────────────────────────────────────────

function Step4CandidateProfile({ state, setState, onNext, onBack, t, project, da }) {
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

  function handleResetDraft() {
    if (!window.confirm(da ? 'Er du sikker? Alt udfyldt her nulstilles.' : 'Are you sure? All content here will be reset.')) return;
    localStorage.removeItem(draftKey(project.id));
    setState((s) => ({ ...s, requirements: [''] }));
  }

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

      <div style={{
        background: 'var(--accent-soft, #f0f4ff)',
        border: '1px solid var(--accent-border, #c7d7fb)',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 14,
        color: 'var(--ink-2)',
        lineHeight: 1.65,
        margin: '0 0 8px',
      }}>
        {t('tier2.step4InfoBox')}
      </div>

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
          <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={handleResetDraft}>
            {da ? 'Nulstil kladde' : 'Reset draft'}
          </button>
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

// ─── Step 5: Jobanalyse ───────────────────────────────────────────────────────

const JA_QUESTION_TYPES = ['best', 'worst', 'hidden'];

function Step5JobAnalysis({ state, setState, onNext, onBack, t, project, da }) {
  const language = state.outputLanguage || 'da';
  const [subStep, setSubStep] = useState(1);
  const [challenge, setChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  useScrollAnchor(challenge ? 1 : 0);
  const challengeTimer = useRef(null);

  const qType = JA_QUESTION_TYPES[subStep - 1];
  const answerKey = `ja_${qType}`;
  const answer = state[answerKey] || '';

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
        // Graceful degradation
      } finally {
        setChallengeLoading(false);
      }
    }, 2500);
    return () => clearTimeout(challengeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, qType]);

  useEffect(() => {
    setChallenge(null);
    clearTimeout(challengeTimer.current);
  }, [subStep]);

  function goNext() {
    if (subStep < 3) setSubStep((s) => s + 1);
    else onNext();
  }

  function goBack() {
    if (subStep > 1) setSubStep((s) => s - 1);
    else onBack();
  }

  const isLastSub = subStep === 3;
  const hasAnswer = answer.trim().length > 0;

  function handleResetDraft() {
    if (!window.confirm(da ? 'Er du sikker? Alt udfyldt her nulstilles.' : 'Are you sure? All content here will be reset.')) return;
    localStorage.removeItem(draftKey(project.id));
    setState((s) => ({ ...s, ja_best: '', ja_worst: '', ja_hidden: '' }));
    setSubStep(1);
    setChallenge(null);
  }

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
        <h1>{t(`tier2.step5Q${subStep}Title`)}</h1>
        <p>{t(`tier2.step5Q${subStep}Sub`)}</p>
      </section>

      <section className="block">
        <div className="field">
          <textarea
            className="textarea"
            rows={6}
            value={answer}
            onChange={(e) => setState((s) => ({ ...s, [answerKey]: e.target.value }))}
            placeholder={t(`tier2.step5Q${subStep}Placeholder`)}
            style={{ resize: 'vertical', minHeight: 120, width: '100%' }}
          />
        </div>

        {challengeLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--ink-3)', fontSize: 13 }}>
            <span className="bullet-loading-dot" aria-hidden="true" />
            {' '}AI vurderer…
          </div>
        )}

        {challenge && !challengeLoading && (
          <div className="ccard" style={{ marginTop: 16, borderLeft: '3px solid var(--accent)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{subStep} / 3</span>
            <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={handleResetDraft}>
              {da ? 'Nulstil kladde' : 'Reset draft'}
            </button>
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

// ─── Tier2Page — orchestrator ─────────────────────────────────────────────────

export function Tier2Page({ project }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const da = i18n.language === 'da';
  const [appStep, setAppStep] = useState(1);
  const [loading, setLoading] = useState(true);

  const [state, _setState] = useState(() => {
    const draft = loadDraft(project.id);
    return draft || {
      // Step 1
      templateText: null, templateFilename: null, skipped: false,
      // Step 2 — expanded to match Tier 1 input
      jobTitle: project.name !== 'Unavngivet kladde' && project.name !== 'Untitled draft' ? project.name : '',
      bullets: [''],
      location: '', startDate: '', employmentType: '', workMode: '',
      department: '', teamComposition: '',
      outputLanguage: project.output_language || 'da',
      // Step 3
      fitCriteria: { job_fit: '', team_fit: '', leader_fit: '', culture_fit: '' },
      fitSuggestions: null,
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

  useEffect(() => {
    api.get(`/tier2/${project.id}`)
      .then(({ data }) => {
        if (!data.steps || Object.keys(data.steps).length === 0) return;
        const draft = loadDraft(project.id);
        if (draft) return;

        const steps = data.steps;
        _setState((prev) => {
          const next = { ...prev };
          if (steps[1]) {
            next.templateText = steps[1].templateText ?? null;
            next.templateFilename = steps[1].filename ?? null;
            next.skipped = steps[1].skipped ?? false;
          }
          if (steps[2]) {
            next.jobTitle        = steps[2].jobTitle ?? prev.jobTitle;
            next.bullets         = steps[2].bullets ?? [''];
            next.location        = steps[2].location ?? '';
            next.startDate       = steps[2].startDate ?? '';
            next.employmentType  = steps[2].employmentType ?? '';
            next.workMode        = steps[2].workMode ?? '';
            next.department      = steps[2].department ?? '';
            next.teamComposition = steps[2].teamComposition ?? '';
            next.outputLanguage  = steps[2].outputLanguage ?? 'da';
          }
          if (steps[3]) {
            next.fitCriteria = steps[3].fitCriteria ?? prev.fitCriteria;
            next.fitGenerated = true;
          }
          if (steps[4]) { next.requirements = steps[4].requirements ?? ['']; }
          if (steps[5]) {
            next.ja_best   = steps[5].best ?? '';
            next.ja_worst  = steps[5].worst ?? '';
            next.ja_hidden = steps[5].hidden ?? '';
          }

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
    try {
      await api.post('/tier2/save-step', {
        project_id: project.id,
        step_number: stepNumber,
        input_data: data,
      });
    } catch {
      // Non-fatal
    }
  }

  async function toStep2({ fromSkip = false } = {}) {
    const skipFlag = fromSkip || state.skipped;
    await saveStep(1, { templateText: state.templateText, filename: state.templateFilename, skipped: skipFlag });
    setAppStep(2);
  }

  async function toStep3() {
    await saveStep(2, {
      jobTitle: state.jobTitle,
      bullets: state.bullets,
      location: state.location,
      startDate: state.startDate,
      employmentType: state.employmentType,
      workMode: state.workMode,
      department: state.department,
      teamComposition: state.teamComposition,
      outputLanguage: state.outputLanguage,
    });
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
          <Step1Template {...stepProps} onNext={() => toStep2()} onSkip={() => toStep2({ fromSkip: true })} />
        )}
        {appStep === 2 && (
          <Step2Info {...stepProps} onNext={toStep3} onBack={() => setAppStep(1)} />
        )}
        {appStep === 3 && (
          <Step3FitCriteria {...stepProps} onNext={toStep4} onBack={() => setAppStep(2)} />
        )}
        {appStep === 4 && (
          <Step4CandidateProfile {...stepProps} onNext={toStep5} onBack={() => setAppStep(3)} />
        )}
        {appStep === 5 && (
          <Step5JobAnalysis {...stepProps} onNext={toComplete} onBack={() => setAppStep(4)} />
        )}
      </main>
    </div>
  );
}
