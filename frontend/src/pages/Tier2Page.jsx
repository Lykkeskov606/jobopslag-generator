import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { BulletInput } from '../components/BulletInput';
import { JobPostInputSection } from '../components/JobPostInputSection';
import { InputCompletenessCheck } from '../components/InputCompletenessCheck';
import { useBulletChallenges } from '../hooks/useBulletChallenges';
import { useScrollAnchor } from '../hooks/useScrollAnchor';
import { runCompletenessCheck } from '../lib/completenessRules.js';
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
    t('tier2.stepBehaviors'),
    t('tier2.stepJobPosting'),
    t('tier2.stepOutputs'),
    t('tier2.stepDownload'),
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
      setState((s) => ({ ...s, templateText: data.templateText, templateHtml: data.templateHtml || null, templateFilename: data.filename, skipped: false }));
    } catch (err) {
      const msg = err.response?.data?.message
        || (da ? 'Kunne ikke læse filen. Prøv en anden fil eller spring over.' : 'Could not read file. Try another or skip.');
      setUploadError(msg);
      setState((s) => ({ ...s, templateText: null, templateHtml: null, templateFilename: null, skipped: false }));
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
      jobTitle: '', bullets: ['', '', '', ''],
      location: '', startDate: '', employmentType: '', workMode: '',
      department: '', teamComposition: '',
    }));
  }

  if (subStep === 'completeness') {
    return (
      <div className="s-completeness">
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
          onProceed={(_, { skippedIds = [], filledIds = [] } = {}) => onNext([...skippedIds, ...filledIds])}
          steps={buildSteps(2, t)}
          showStepEyebrow={false}
        />
      </div>
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
            {['dim1', 'dim2', 'dim3'].map((k) => (
              <div key={k}>· {t(`tier2.${k}`)}</div>
            ))}
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
  const [challenge, setChallenge]           = useState(null);
  const [challengeAccepted, setChallengeAccepted] = useState(false);
  const [challengeLoading, setChallengeLoading]   = useState(false);
  useScrollAnchor(challenge ? 1 : 0);
  const challengeTimer = useRef(null);

  const qType = JA_QUESTION_TYPES[subStep - 1];
  const answerKey = `ja_${qType}`;
  const answer = state[answerKey] || '';

  function clearChallenge() {
    setChallenge(null);
    setChallengeAccepted(false);
  }

  useEffect(() => {
    if (!challengeAccepted) setChallenge(null);
    clearTimeout(challengeTimer.current);
    if (answer.trim().length < 25) return;
    if (challengeAccepted) return;
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
    clearChallenge();
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
    clearChallenge();
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
            {!challengeAccepted && (
              <p style={{ margin: '0 0 8px', fontSize: 14 }}>{challenge.challenge}</p>
            )}
            {challenge.probe && (
              <p style={{ margin: `0 0 ${challengeAccepted ? 12 : 16}px`, fontSize: 14, color: 'var(--ink-2)', fontStyle: 'italic' }}>
                {challenge.probe}
              </p>
            )}
            {challengeAccepted && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--accent)' }}>
                {da ? '✎ Uddyb dit svar i feltet ovenfor' : '✎ Elaborate in the field above'}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={clearChallenge}>
                {t('tier2.challengeDismiss')}
              </button>
              {!challengeAccepted && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setChallengeAccepted(true)}>
                  {t('tier2.challengeAccept')}
                </button>
              )}
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

// ─── Shared UI helpers (inlined from Tier1Page to avoid cross-page imports) ──

function JobPostingPreview({ content }) {
  if (!content) return null;
  return (
    <>
      {content.split('\n').map((line, i) => {
        const txt = line.trim();
        if (!txt) return <div key={i} className="preview-spacer" />;
        if (txt.endsWith(':') && txt.length < 70 && !txt.includes('. '))
          return <p key={i} className="preview-heading">{txt}</p>;
        if (/^[•\-\*]\s/.test(txt))
          return (
            <div key={i} className="preview-bullet">
              <span className="preview-bullet-dot">•</span>
              <span>{txt.replace(/^[•\-\*]\s*/, '')}</span>
            </div>
          );
        return <p key={i} className="preview-paragraph">{txt}</p>;
      })}
    </>
  );
}

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

function splitToSections(text) {
  return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}

function getBlockTag(text, da) {
  const txt = text.trim();
  if (txt.endsWith(':') && txt.length < 60) return da ? 'OVERSKRIFT' : 'HEADING';
  if (/^[•\-\*]/.test(txt) || /\n[•\-\*]/.test(txt)) return da ? 'LISTE' : 'LIST';
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
          {side === 'left' ? t('tier1.clickToAddRight') : t('tier1.clickToAddLeft')}
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
  const [editText, setEditText]   = useState('');

  const usedKeys = new Set(doc.map((b) => b.srcKey));
  const words = doc.reduce((n, b) => n + b.text.trim().split(/\s+/).filter(Boolean).length, 0);

  useEffect(() => { onChange(doc.map((b) => b.text).join('\n\n')); }, [doc]);

  function addBlock(text, src, srcKey) {
    setDoc((d) => [...d, { id: `${Date.now()}-${Math.random()}`, srcKey, text, src }]);
  }
  function removeBlock(id) { setDoc((d) => d.filter((b) => b.id !== id)); }
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
  function startEdit(block) { setEditingId(block.id); setEditText(block.text); }
  function saveEdit(id) {
    if (editText.trim()) setDoc((d) => d.map((b) => (b.id === id ? { ...b, text: editText } : b)));
    else removeBlock(id);
    setEditingId(null);
  }
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
      <SourceCol side="left" label="A" src={sectionsA} usedKeys={usedKeys} srcPrefix="A" onAdd={addBlock} language={language} />
      <div className="panel-col workspace" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <div className="ws-head">
          <div className="ttl">
            <h2>{t('tier1.wsTitle')}</h2>
            <span className="meta">{doc.length} {t('tier1.sections')} · {t('tier1.approx')} {words} {t('tier1.words')}</span>
          </div>
          <button className="clear" onClick={() => setDoc([])}>{t('tier1.clearAll')}</button>
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
                <div key={block.id} className="ws-block" onClick={() => editingId !== block.id && startEdit(block)}>
                  <div className="wb-bar">
                    <span className="wb-source">
                      <span className={`vchip ${block.src === 'A' ? 'a' : 'b'}`} />
                      Variant {block.src}
                    </span>
                    <div className="wb-actions">
                      <button type="button" title={da ? 'Op' : 'Up'} disabled={idx === 0} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}>↑</button>
                      <button type="button" title={da ? 'Ned' : 'Down'} disabled={idx === doc.length - 1} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}>↓</button>
                      <button type="button" title={da ? 'Slet' : 'Delete'} onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}>×</button>
                    </div>
                  </div>
                  {editingId === block.id ? (
                    <textarea
                      className="textarea" autoFocus value={editText}
                      onChange={(e) => { setEditText(e.target.value); autoResizeMix(e.target); }}
                      onFocus={(e) => autoResizeMix(e.target)}
                      onBlur={() => saveEdit(block.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontFamily: 'var(--serif)', fontSize: 15.5, lineHeight: 1.65, border: 'none', outline: 'none', background: 'transparent', resize: 'vertical', minHeight: 120, width: '100%' }}
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
      <SourceCol side="right" label="B" src={sectionsB} usedKeys={usedKeys} srcPrefix="B" onAdd={addBlock} language={language} />
    </div>
  );
}

// ─── Step 7: Job posting generation ──────────────────────────────────────────

function Step7JobPosting({ state, onBack, onComplete, onSkipCompleteness, t, project, da }) {
  const language = state.outputLanguage || 'da';

  // Compute which completeness checks are still unresolved after Step 2
  // (content-scanning handles input-matched checks; completenessSkipped tracks explicit skips)
  const [step7Missing] = useState(() => {
    const allMissing = runCompletenessCheck({
      jobTitle:        state.jobTitle,
      bullets:         (state.bullets || []).filter((b) => b.trim()),
      location:        state.location || '',
      workMode:        state.workMode || '',
      department:      state.department || '',
      teamComposition: state.teamComposition || '',
      language,
    });
    return allMissing.filter((check) => !(state.completenessSkipped || []).includes(check.id));
  });

  const [subStep, setSubStep]               = useState(() => step7Missing.length === 0 ? 'generating' : 'completeness');
  const [variantA, setVariantA]             = useState('');
  const [variantB, setVariantB]             = useState('');
  const [biasWarnings, setBiasWarnings]     = useState([]);
  const [generationBatch, setGenerationBatch] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [finalContent, setFinalContent]     = useState('');
  const hasAutoGenerated = useRef(false);

  useEffect(() => {
    if (step7Missing.length === 0 && !hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      generate([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(extraBullets = [], step7SkippedIds = []) {
    if (step7SkippedIds.length > 0 && onSkipCompleteness) {
      onSkipCompleteness(step7SkippedIds);
    }
    setSubStep('generating');
    try {
      const { data } = await api.post('/tier2/generate-job-posting', {
        project_id:    project.id,
        extra_bullets: extraBullets,
      });
      setVariantA(data.variant_a);
      setVariantB(data.variant_b);
      setBiasWarnings(data.bias_warnings || []);
      setGenerationBatch(data.generation_batch);
      setSubStep('results');
    } catch (err) {
      if (err.response?.status === 422) setSubStep('refused');
      else setSubStep('completeness');
    }
  }

  function selectVariant(v, content) {
    setSelectedVariant(v);
    setFinalContent(content);
    setSubStep('finalize');
  }

  async function handleSaveAndFinish() {
    try {
      await api.post('/tier2/save-step', {
        project_id:  project.id,
        step_number: 7,
        input_data: {
          selected_variant:  selectedVariant,
          final_content:     finalContent,
          generation_batch:  generationBatch,
        },
      });
    } catch { /* non-fatal */ }
    onComplete();
  }

  if (subStep === 'completeness') {
    return (
      <div className="app s-input">
        <TopBar active="projects" />
        <main>
          <div className="s-completeness">
            <InputCompletenessCheck
              jobTitle={state.jobTitle}
              bullets={(state.bullets || []).filter((b) => b.trim())}
              location={state.location || ''}
              workMode={state.workMode || ''}
              department={state.department || ''}
              teamComposition={state.teamComposition || ''}
              language={language}
              projectId={project.id}
              onBack={onBack}
              onProceed={(extras, { skippedIds = [], filledIds = [] } = {}) => generate(extras, [...skippedIds, ...filledIds])}
              steps={buildSteps(7, t)}
              excludeIds={state.completenessSkipped || []}
              titleOverride={step7Missing.length > 0 ? t('tier2.step7LastChanceTitle') : null}
              subtitleOverride={step7Missing.length > 0 ? t('tier2.step7LastChanceSub', { count: step7Missing.length }) : null}
              showStepEyebrow={false}
            />
          </div>
        </main>
      </div>
    );
  }

  if (subStep === 'generating') {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main>
          <div className="work" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
            <div className="spinner" style={{ width: 36, height: 36 }} />
            <h2 style={{ margin: 0 }}>{t('tier2.step7Generating')}</h2>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>{t('tier2.step7GeneratingSub')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (subStep === 'refused') {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main>
          <div className="work">
            <section className="intro">
              <h1>{t('tier2.step7RefusedTitle')}</h1>
              <p>{t('tier2.step7RefusedBody')}</p>
              <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('tier2.step7RefusedHint')}</p>
            </section>
            <button className="btn btn-secondary" onClick={() => setSubStep('completeness')}>
              <span className="arrow">←</span> {t('tier2.step7EditBack')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (subStep === 'finalize') {
    const wordCount = finalContent.trim().split(/\s+/).filter(Boolean).length;

    if (selectedVariant === 'mix') {
      return (
        <div className="app s-mix">
          <header className="mix-topbar">
            <div className="left">
              <button type="button" className="link-back" onClick={() => setSubStep('results')}>
                <span className="arrow">←</span>
              </button>
              <div className="ttl">
                {t('tier1.mixTopbarTitle')}
                <span className="sub">{state.jobTitle}</span>
              </div>
            </div>
            <Steps steps={buildSteps(7, t)} />
          </header>
          <MixEditor variantA={variantA} variantB={variantB} value={finalContent} onChange={setFinalContent} language={language} />
          <footer className="mix-foot">
            <div className="status">
              <strong>{t('tier1.wsTitle')}</strong>
              {' · '}
              {finalContent.trim().split(/\s+/).filter(Boolean).length} {t('tier1.words')}
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSubStep('results')}>
                {t('tier1.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveAndFinish} disabled={!finalContent.trim()}>
                {t('tier2.step7SaveBtn')}
                <span className="arrow">→</span>
              </button>
            </div>
          </footer>
        </div>
      );
    }

    return (
      <div className="app s-review">
        <TopBar active="projects" />
        <main className="work">
          <div className="steps-bar"><Steps steps={buildSteps(7, t)} /></div>
          <section className="review-head" style={{ paddingBottom: 'var(--s-5)' }}>
            <div className="eyebrow">{t('tier2.step7FinalTitle')}</div>
            <h1>{state.jobTitle}</h1>
            <div className="back-link">
              <button type="button" className="link-back" onClick={() => setSubStep('results')}>
                <span className="arrow">←</span> {t('tier1.backToVariants')}
              </button>
            </div>
          </section>
          <div className="edit-section">
            <div className="field">
              <label className="field-label">{t('tier1.editBeforeDownload')}</label>
              <div className="hint" style={{ marginBottom: 'var(--s-3)', fontSize: 13, color: 'var(--ink-3)' }}>
                {wordCount} {t('tier1.words')} · {t('tier1.editClickHint')}
              </div>
              <textarea className="textarea" value={finalContent} onChange={(e) => setFinalContent(e.target.value)} rows={22} />
            </div>
          </div>
          <div className="actionbar">
            <div className="actionbar-inner">
              <div className="meta">
                <span>Variant {selectedVariant} · {language === 'da' ? 'Dansk' : 'English'}</span>
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={handleSaveAndFinish} disabled={!finalContent.trim()}>
                {t('tier2.step7SaveBtn')}
                <span className="arrow">→</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // results sub-step
  const wordCountA = variantA.trim().split(/\s+/).filter(Boolean).length;
  const wordCountB = variantB.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="app s-review">
      <TopBar active="projects" />
      <main className="work">
        <div className="steps-bar"><Steps steps={buildSteps(7, t)} /></div>
        <section className="review-head">
          <div className="eyebrow">{t('tier2.step7VariantsTitle')}</div>
          <h1>{state.jobTitle}</h1>
          <div className="back-link">
            <button type="button" className="link-back" onClick={() => setSubStep('completeness')}>
              <span className="arrow">←</span> {t('tier1.editInputs')}
            </button>
          </div>
        </section>

        {biasWarnings.length > 0 && <BiasPanel warnings={biasWarnings} language={language} />}

        <div className="variants">
          <div className={`variant${selectedVariant === 'A' ? ' selected' : ''}`}>
            <div className="v-head">
              <div className="v-name"><h2>Variant A</h2></div>
              <span className="wordcount">{wordCountA} {t('tier1.words')}</span>
            </div>
            <div className="v-body"><JobPostingPreview content={variantA} /></div>
            <div className="v-foot">
              <button type="button" className="btn btn-primary" onClick={() => selectVariant('A', variantA)}>
                {t('tier2.step7SelectA')}
              </button>
            </div>
          </div>
          <div className={`variant${selectedVariant === 'B' ? ' selected' : ''}`}>
            <div className="v-head">
              <div className="v-name"><h2>Variant B</h2></div>
              <span className="wordcount">{wordCountB} {t('tier1.words')}</span>
            </div>
            <div className="v-body"><JobPostingPreview content={variantB} /></div>
            <div className="v-foot">
              <button type="button" className="btn btn-primary" onClick={() => selectVariant('B', variantB)}>
                {t('tier2.step7SelectB')}
              </button>
            </div>
          </div>
        </div>

        <div className="mix-cta">
          <button type="button" className="btn btn-secondary btn-lg"
            onClick={() => { setSelectedVariant('mix'); setFinalContent(''); setSubStep('finalize'); }}>
            {t('tier2.step7MixCta')}
            <span className="arrow">→</span>
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── Step 6: Behavior patterns ───────────────────────────────────────────────

function Step6Behaviors({ state, setState, onNext, onBack, t, project, da }) {
  const language = state.outputLanguage || 'da';
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', description: '' });

  const patterns = state.behaviorPatterns || [];
  const selected = state.selectedBehaviors || [];
  const userPatterns = patterns.filter((p) => p.source === 'user');
  const canAddCustom = userPatterns.length < 2;

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const { data } = await api.post('/tier2/generate-behaviors', { project_id: project.id, language });
      const newAiPatterns = data.patterns.map((p, i) => ({
        id: `ai-${Date.now()}-${i}`,
        source: 'ai',
        title: p.title,
        description: p.description,
        edited: false,
      }));
      setState((s) => {
        const existingUserPatterns = (s.behaviorPatterns || []).filter((p) => p.source === 'user');
        const userSelectedStill = (s.selectedBehaviors || []).filter((p) => p.source === 'user');
        return {
          ...s,
          behaviorPatterns: [...newAiPatterns, ...existingUserPatterns],
          selectedBehaviors: userSelectedStill,
        };
      });
    } catch {
      setGenError(da ? 'Kunne ikke generere mønstre — prøv igen.' : 'Could not generate patterns — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    const aiCount = (state.behaviorPatterns || []).filter((p) => (p.source ?? 'ai') === 'ai').length;
    if (aiCount < 5) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePattern(pattern) {
    const cur = state.selectedBehaviors || [];
    const idx = cur.findIndex((p) => p.id === pattern.id);
    if (idx >= 0) {
      setState((s) => ({ ...s, selectedBehaviors: cur.filter((_, i) => i !== idx) }));
    } else if (cur.length < 4) {
      setState((s) => ({ ...s, selectedBehaviors: [...cur, { ...pattern }] }));
    }
  }

  function startEdit(pattern, e) {
    e.stopPropagation();
    setEditingId(pattern.id);
    setEditDraft({ title: pattern.title, description: pattern.description });
  }

  function saveEdit(pattern) {
    const newTitle = editDraft.title.trim();
    const newDesc = editDraft.description.trim();
    if (!newTitle) {
      if (pattern.source === 'user') {
        removePattern(pattern.id);
      } else {
        cancelEdit(null);
      }
      return;
    }
    const wasEdited = newTitle !== pattern.title || newDesc !== pattern.description;
    const updated = { ...pattern, title: newTitle, description: newDesc, edited: wasEdited || pattern.edited };
    setState((s) => ({
      ...s,
      behaviorPatterns: s.behaviorPatterns.map((p) => (p.id === pattern.id ? updated : p)),
      selectedBehaviors: s.selectedBehaviors.map((p) => (p.id === pattern.id ? updated : p)),
    }));
    setEditingId(null);
    setEditDraft({ title: '', description: '' });
  }

  function cancelEdit(pattern) {
    if (pattern?.source === 'user' && !pattern.title) {
      removePattern(pattern.id);
    }
    setEditingId(null);
    setEditDraft({ title: '', description: '' });
  }

  function addCustomPattern() {
    if (!canAddCustom) return;
    const id = `user-${Date.now()}`;
    const newPattern = { id, source: 'user', title: '', description: '', edited: false };
    setState((s) => ({ ...s, behaviorPatterns: [...s.behaviorPatterns, newPattern] }));
    setEditingId(id);
    setEditDraft({ title: '', description: '' });
  }

  function removePattern(patternId) {
    setState((s) => ({
      ...s,
      behaviorPatterns: s.behaviorPatterns.filter((p) => p.id !== patternId),
      selectedBehaviors: s.selectedBehaviors.filter((p) => p.id !== patternId),
    }));
    if (editingId === patternId) {
      setEditingId(null);
      setEditDraft({ title: '', description: '' });
    }
  }

  const canContinue = selected.length >= 3 && selected.length <= 4;

  async function handleNext() {
    if (!canContinue) return;
    try {
      await api.post('/tier2/save-behaviors', { project_id: project.id, patterns, selected });
    } catch { /* non-fatal */ }
    onNext();
  }

  const hasEnoughPatterns = patterns.filter((p) => (p.source ?? 'ai') === 'ai').length >= 5;

  const badgeStyle = { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, lineHeight: 1.4 };

  return (
    <div className="work">
      <div className="work-top">
        <button className="link-back" onClick={onBack}>
          <span className="arrow">←</span> {t('tier2.back')}
        </button>
        <div className="hide-mobile">
          <Steps steps={buildSteps(6, t)} />
        </div>
      </div>

      <section className="intro">
        <div className="eyebrow">{t('tier2.eyebrow')} · {t('tier2.stepBehaviors')}</div>
        <h1>{t('tier2.step6Title')}</h1>
        <p>{t('tier2.step6Sub')}</p>
      </section>

      <div style={{
        background: 'var(--accent-soft, #f0f4ff)',
        border: '1px solid var(--accent-border, #c7d7fb)',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 14,
        color: 'var(--ink-2)',
        lineHeight: 1.65,
        margin: '0 0 16px',
      }}>
        {t('tier2.step6InfoBox')}
      </div>

      {generating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, color: 'var(--ink-2)' }}>
          <div className="spinner" style={{ width: 18, height: 18 }} />
          <span>{t('tier2.step6Generating')}</span>
        </div>
      )}

      {genError && (
        <div style={{ marginBottom: 24 }}>
          <p className="error-text" style={{ marginBottom: 12 }}>{genError}</p>
          <button className="btn btn-ghost" onClick={generate}>
            {da ? 'Prøv igen' : 'Try again'}
          </button>
        </div>
      )}

      {!generating && hasEnoughPatterns && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 12 }}>
            {patterns.map((pattern) => {
              const sel = selected.some((p) => p.id === pattern.id);
              const isEditing = editingId === pattern.id;
              return (
                <div
                  key={pattern.id}
                  role={isEditing ? undefined : 'button'}
                  tabIndex={isEditing ? undefined : 0}
                  className={`ccard${sel ? ' filled' : ''}`}
                  style={{ cursor: isEditing ? 'default' : 'pointer', outline: sel ? '2px solid var(--accent)' : undefined }}
                  onClick={isEditing ? undefined : () => togglePattern(pattern)}
                  onKeyDown={isEditing ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePattern(pattern); }
                  }}
                >
                  {/* Badge row */}
                  <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap', minHeight: 22 }}>
                    {sel && (
                      <span style={{ ...badgeStyle, color: 'var(--accent)', background: 'var(--accent-soft)' }}>
                        ✓ {da ? 'Valgt' : 'Selected'}
                      </span>
                    )}
                    {pattern.source === 'user' && (
                      <span style={{ ...badgeStyle, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {t('tier2.step6CustomBadge')}
                      </span>
                    )}
                    {pattern.edited && pattern.source !== 'user' && (
                      <span style={{ ...badgeStyle, color: 'var(--ink-3)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {t('tier2.step6EditedBadge')}
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        autoFocus
                        className="input"
                        placeholder={da ? 'Titel (3-6 ord)…' : 'Title (3-6 words)…'}
                        value={editDraft.title}
                        onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                        style={{ fontSize: 14, fontWeight: 600 }}
                      />
                      <textarea
                        className="textarea"
                        rows={3}
                        placeholder={da ? 'Konkret beskrivelse af adfærden i praksis…' : 'Concrete description of the behaviour in practice…'}
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                        style={{ resize: 'vertical', minHeight: 60, fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 13, padding: '4px 12px' }}
                          onClick={() => cancelEdit(pattern)}
                        >
                          {da ? 'Annullér' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 13, padding: '4px 12px' }}
                          onClick={() => saveEdit(pattern)}
                        >
                          {da ? 'Gem' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{pattern.title}</h3>
                      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 }}>
                        {pattern.description}
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '2px 10px' }}
                          onClick={(e) => startEdit(pattern, e)}
                        >
                          {da ? 'Rediger' : 'Edit'}
                        </button>
                        {pattern.source === 'user' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '2px 10px', color: 'var(--ink-3)' }}
                            onClick={(e) => { e.stopPropagation(); removePattern(pattern.id); }}
                          >
                            {da ? 'Fjern' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <button
              className="btn btn-ghost"
              onClick={addCustomPattern}
              disabled={!canAddCustom}
              title={!canAddCustom ? t('tier2.step6CustomMax') : undefined}
            >
              {t('tier2.step6AddCustom')}
            </button>
            {!canAddCustom && (
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('tier2.step6CustomMax')}</span>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <button className="btn btn-ghost" onClick={generate}>
              {da ? 'Generér nye AI-forslag' : 'Generate new AI suggestions'}
            </button>
          </div>
        </>
      )}

      <div className="actionbar">
        <div className="actionbar-inner">
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {selected.length} {da
              ? `valgt${selected.length < 3 ? ' — vælg mindst 3' : ''}`
              : `selected${selected.length < 3 ? ' — select at least 3' : ''}`}
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleNext}
            disabled={generating || !canContinue}
          >
            {t('tier2.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 8: Generate recruitment documents ───────────────────────────────────

function Step8GenerateOutputs({ state, project, onBack, onComplete, t, da }) {
  const [profileContent, setProfileContent]   = useState(null);
  const [guideItems, setGuideItems]           = useState(null);
  const [generatingProfile, setGenProfile]    = useState(false);
  const [generatingGuide, setGenGuide]        = useState(false);
  const [profileError, setProfileError]       = useState(null);
  const [guideError, setGuideError]           = useState(null);
  const hasAutoGenerated                      = useRef(false);

  useEffect(() => {
    if (!hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      generateProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateProfile() {
    setGenProfile(true);
    setProfileError(null);
    try {
      const { data } = await api.post('/tier2/generate-candidate-profile', { project_id: project.id });
      setProfileContent(data.content);
    } catch (err) {
      setProfileError(err.response?.status === 422
        ? (da ? 'Indhold kan ikke genereres pga. indholdspolitik.' : 'Content cannot be generated due to content policy.')
        : t('tier2.step8ErrorProfile')
      );
    } finally {
      setGenProfile(false);
    }
  }

  async function generateGuide() {
    setGenGuide(true);
    setGuideError(null);
    try {
      const { data } = await api.post('/tier2/generate-interview-guide', { project_id: project.id });
      setGuideItems(data.guide);
    } catch {
      setGuideError(t('tier2.step8ErrorGuide'));
    } finally {
      setGenGuide(false);
    }
  }

  const anyGenerating = generatingProfile || generatingGuide;
  const canContinue   = !anyGenerating && !!profileContent && !!guideItems;

  if (generatingProfile && !profileContent) {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main>
          <div className="work" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
            <div className="spinner" style={{ width: 36, height: 36 }} />
            <h2 style={{ margin: 0 }}>{t('tier2.step8GeneratingProfile')}</h2>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>{t('tier2.step8GeneratingProfileSub')}</p>
          </div>
        </main>
      </div>
    );
  }

  const outputBlockStyle = { marginBottom: 40 };
  const outputHeadStyle  = { marginBottom: 16 };
  const contentBoxStyle  = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '24px 28px', marginBottom: 12,
    lineHeight: 1.7, fontSize: 14,
  };

  return (
    <div className="app s-review">
      <TopBar active="projects" />
      <main className="work">
        <div className="steps-bar"><Steps steps={buildSteps(8, t)} /></div>

        <section className="review-head">
          <div className="eyebrow">{t('tier2.eyebrow')}</div>
          <h1>{t('tier2.step8Title')}</h1>
          <div className="back-link">
            <button type="button" className="link-back" onClick={onBack}>
              <span className="arrow">←</span> {da ? 'Tilbage til jobopslag' : 'Back to job posting'}
            </button>
          </div>
        </section>

        {/* ── Candidate Profile Card ── */}
        <div style={outputBlockStyle}>
          <div style={outputHeadStyle}>
            <h2 style={{ margin: '0 0 4px' }}>{t('tier2.step8ProfileTitle')}</h2>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>{t('tier2.step8ProfileSub')}</p>
          </div>

          {generatingProfile && profileContent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, color: 'var(--ink-2)' }}>
              <div className="spinner" style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 14 }}>{t('tier2.step8GeneratingProfile')}</span>
            </div>
          )}

          {profileError && !generatingProfile && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ color: 'var(--error, #c0392b)', marginBottom: 8 }}>{profileError}</p>
              <button type="button" className="btn btn-ghost" onClick={generateProfile}>
                {da ? 'Prøv igen' : 'Try again'}
              </button>
            </div>
          )}

          {profileContent && (
            <div>
              <div style={{ ...contentBoxStyle, whiteSpace: 'pre-wrap' }}>{profileContent}</div>
              <button type="button" className="btn btn-ghost" onClick={generateProfile} disabled={anyGenerating}>
                {t('tier2.step8Regenerate')}
              </button>
            </div>
          )}

          {profileContent && !guideItems && !generatingGuide && !guideError && (
            <div style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={generateGuide}>
                {da ? 'Generer interviewguide →' : 'Generate interview guide →'}
              </button>
            </div>
          )}
        </div>

        {/* ── Interview Guide Card ── */}
        {(generatingGuide || guideItems || guideError) && (
          <div style={outputBlockStyle}>
            <div style={outputHeadStyle}>
              <h2 style={{ margin: '0 0 4px' }}>{t('tier2.step8GuideTitle')}</h2>
              <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>{t('tier2.step8GuideSub')}</p>
            </div>

            {generatingGuide && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center' }}>
                <div className="spinner" style={{ width: 28, height: 28 }} />
                <p style={{ margin: 0, color: 'var(--ink-2)' }}>{t('tier2.step8GeneratingGuide')}</p>
                <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>{t('tier2.step8GeneratingGuideSub')}</p>
              </div>
            )}

            {guideError && !generatingGuide && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: 'var(--error, #c0392b)', marginBottom: 8 }}>{guideError}</p>
                <button type="button" className="btn btn-ghost" onClick={generateGuide}>
                  {da ? 'Prøv igen' : 'Try again'}
                </button>
              </div>
            )}

            {guideItems && !generatingGuide && (
              <div>
                {guideItems.map((item, idx) => (
                  <div key={idx} style={{ ...contentBoxStyle, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      {idx + 1}. {item.pattern_title}
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {t('tier2.step8GuideQuestion')}
                      </div>
                      <p style={{ margin: 0, fontSize: 14 }}>{item.question}</p>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {t('tier2.step8GuideProbe')}
                      </div>
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{item.probe}</p>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {t('tier2.step8GuideRubric')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {['1', '2', '3', '4'].map((level) => (
                          <div key={level} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                              {t('tier2.step8GuideRubricLevel', { n: level })}
                            </div>
                            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{item.rubric[level]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" onClick={generateGuide} disabled={anyGenerating}>
                  {t('tier2.step8Regenerate')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="actionbar">
          <div className="actionbar-inner">
            <div />
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onComplete}
              disabled={!canContinue}
            >
              {t('tier2.continue')}
              <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Step 9: Download ────────────────────────────────────────────────────────

function Step9Download({ project, onBack, onFinish, t, da }) {
  const [downloading, setDownloading] = useState(null);
  const [errors, setErrors]           = useState({});

  const docs = [
    { key: 'job-analysis',      label: t('tier2.step9DocJobAnalysis'),      sub: t('tier2.step9DocJobAnalysisSub') },
    { key: 'job-posting',       label: t('tier2.step9DocJobPosting'),        sub: t('tier2.step9DocJobPostingSub') },
    { key: 'candidate-profile', label: t('tier2.step9DocCandidateProfile'), sub: t('tier2.step9DocCandidateProfileSub') },
    { key: 'interview-guide',   label: t('tier2.step9DocInterviewGuide'),   sub: t('tier2.step9DocInterviewGuideSub') },
  ];

  function triggerDownload(url, fallbackFilename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }

  async function downloadDoc(docType) {
    setDownloading(docType);
    setErrors((e) => ({ ...e, [docType]: null }));
    try {
      const response = await api.get(`/tier2/export/${project.id}/${docType}`, { responseType: 'blob' });
      const cd = response.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+?)"/);
      const filename = match ? match[1] : `${docType}.docx`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      triggerDownload(url, filename);
    } catch {
      setErrors((e) => ({ ...e, [docType]: da ? 'Fejl — prøv igen.' : 'Error — please try again.' }));
    } finally {
      setDownloading(null);
    }
  }

  async function downloadZip() {
    setDownloading('zip');
    setErrors((e) => ({ ...e, zip: null }));
    try {
      const response = await api.get(`/tier2/export/${project.id}/zip`, { responseType: 'blob' });
      const cd = response.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+?)"/);
      const filename = match ? match[1] : 'rekrutteringsprojekt.zip';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      triggerDownload(url, filename);
    } catch {
      setErrors((e) => ({ ...e, zip: da ? 'Fejl — prøv igen.' : 'Error — please try again.' }));
    } finally {
      setDownloading(null);
    }
  }

  const cardStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '16px 20px', marginBottom: 12,
  };

  return (
    <div className="app s-review">
      <TopBar active="projects" />
      <main className="work">
        <div className="steps-bar"><Steps steps={buildSteps(9, t)} /></div>

        <section className="review-head" style={{ textAlign: 'center', paddingBottom: 'var(--s-5)' }}>
          <div className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 700 }}>✓ {t('tier2.step9Complete')}</div>
          <h1 style={{ marginBottom: 8 }}>{t('tier2.step9Title')}</h1>
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>{t('tier2.step9Sub')}</p>
        </section>

        <div style={{ marginBottom: 32 }}>
          {docs.map((doc) => (
            <div key={doc.key} style={cardStyle}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{doc.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{doc.sub}</div>
                {errors[doc.key] && <div style={{ fontSize: 13, color: 'var(--error, #c0392b)', marginTop: 4 }}>{errors[doc.key]}</div>}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', minWidth: 100 }}
                onClick={() => downloadDoc(doc.key)}
                disabled={!!downloading}
              >
                {downloading === doc.key ? t('tier2.step9Downloading') : t('tier2.step9DownloadBtn')}
              </button>
            </div>
          ))}
        </div>

        <div style={{
          background: 'var(--accent-soft, #f0f4ff)',
          border: '1px solid var(--accent-border, #c7d7fb)',
          borderRadius: 10, padding: '20px 24px', marginBottom: 32, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{t('tier2.step9ZipBtn')}</div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 16 }}>{t('tier2.step9ZipSub')}</div>
          {errors.zip && <div style={{ fontSize: 13, color: 'var(--error, #c0392b)', marginBottom: 8 }}>{errors.zip}</div>}
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={downloadZip}
            disabled={!!downloading}
          >
            {downloading === 'zip' ? t('tier2.step9Downloading') : t('tier2.step9ZipBtn')}
          </button>
        </div>

        <div className="actionbar">
          <div className="actionbar-inner">
            <button type="button" className="link-back" onClick={onBack}>
              <span className="arrow">←</span> {t('tier2.back')}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={onFinish}>
              {t('tier2.step9Finish')}
              <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </main>
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
      templateText: null, templateHtml: null, templateFilename: null, skipped: false,
      // Step 2 — expanded to match Tier 1 input
      jobTitle: project.name !== 'Unavngivet kladde' && project.name !== 'Untitled draft' ? project.name : '',
      bullets: ['', '', '', ''],
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
      // Step 6
      behaviorPatterns: [], selectedBehaviors: [],
      // Completeness
      completenessSkipped: [],
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
            next.templateText     = steps[1].templateText ?? null;
            next.templateHtml     = steps[1].templateHtml ?? null;
            next.templateFilename = steps[1].filename ?? null;
            next.skipped          = steps[1].skipped ?? false;
          }
          if (steps[2]) {
            next.jobTitle              = steps[2].jobTitle ?? prev.jobTitle;
            next.bullets               = steps[2].bullets ?? [''];
            next.location              = steps[2].location ?? '';
            next.startDate             = steps[2].startDate ?? '';
            next.employmentType        = steps[2].employmentType ?? '';
            next.workMode              = steps[2].workMode ?? '';
            next.department            = steps[2].department ?? '';
            next.teamComposition       = steps[2].teamComposition ?? '';
            next.outputLanguage        = steps[2].outputLanguage ?? 'da';
            next.completenessSkipped   = steps[2].completenessSkipped ?? [];
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
          if (steps[6]) {
            next.behaviorPatterns = (steps[6].patterns ?? []).map((p, i) => ({
              id:          p.id ?? `loaded-${i}`,
              source:      p.source ?? 'ai',
              title:       p.title ?? '',
              description: p.description ?? '',
              edited:      p.edited ?? false,
            }));
            next.selectedBehaviors = (steps[6].selected ?? []).map((p, i) => ({
              id:          p.id ?? `sel-${i}`,
              source:      p.source ?? 'ai',
              title:       p.title ?? '',
              description: p.description ?? '',
              edited:      p.edited ?? false,
            }));
          }

          const maxStep = Math.max(...Object.keys(steps).map(Number));
          if (maxStep >= 1) setAppStep(Math.min(maxStep, 9));
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
    await saveStep(1, { templateText: state.templateText, templateHtml: state.templateHtml, filename: state.templateFilename, skipped: skipFlag });
    setAppStep(2);
  }

  async function toStep3(skippedIds = []) {
    const allSkipped = [...new Set([...(state.completenessSkipped || []), ...skippedIds])];
    setState((s) => ({ ...s, completenessSkipped: allSkipped }));
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
      completenessSkipped: allSkipped,
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

  async function toStep6() {
    await saveStep(5, { best: state.ja_best, worst: state.ja_worst, hidden: state.ja_hidden });
    setAppStep(6);
  }

  async function toStep7() {
    setAppStep(7);
  }

  function toComplete() {
    setAppStep(8);
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

  if (appStep === 9) {
    return (
      <Step9Download
        project={project}
        onBack={() => setAppStep(8)}
        onFinish={() => navigate(`/projects/${project.id}/outputs`)}
        t={t}
        da={da}
      />
    );
  }

  if (appStep === 8) {
    return (
      <Step8GenerateOutputs
        state={state}
        project={project}
        onBack={() => setAppStep(7)}
        onComplete={() => setAppStep(9)}
        t={t}
        da={da}
      />
    );
  }

  if (appStep === 7) {
    return (
      <Step7JobPosting
        state={state}
        onBack={() => setAppStep(6)}
        onComplete={toComplete}
        onSkipCompleteness={(skippedIds) => {
          const allSkipped = [...new Set([...(state.completenessSkipped || []), ...skippedIds])];
          setState((s) => ({ ...s, completenessSkipped: allSkipped }));
          saveStep(2, {
            jobTitle:            state.jobTitle,
            bullets:             state.bullets,
            location:            state.location,
            startDate:           state.startDate,
            employmentType:      state.employmentType,
            workMode:            state.workMode,
            department:          state.department,
            teamComposition:     state.teamComposition,
            outputLanguage:      state.outputLanguage,
            completenessSkipped: allSkipped,
          });
        }}
        t={t}
        project={project}
        da={da}
      />
    );
  }

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
          <Step5JobAnalysis {...stepProps} onNext={toStep6} onBack={() => setAppStep(4)} />
        )}
        {appStep === 6 && (
          <Step6Behaviors {...stepProps} onNext={toStep7} onBack={() => setAppStep(5)} />
        )}
      </main>
    </div>
  );
}
