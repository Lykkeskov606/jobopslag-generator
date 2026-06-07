import { useTranslation } from 'react-i18next';
import { checkBulletBias } from '../lib/biasRules';
import { BulletInput } from './BulletInput';

export function JobPostInputSection({
  jobTitle, setJobTitle,
  bullets, setBullets,
  language, setLanguage,
  location, setLocation,
  startDate, setStartDate,
  employmentType, setEmploymentType,
  workMode, setWorkMode,
  department = '', setDepartment = () => {},
  teamComposition = '', setTeamComposition = () => {},
  challengeMap = {},
  loadingIndices = new Set(),
  onDismissChallenge,
  onAcceptChallenge,
}) {
  const { t, i18n } = useTranslation();
  const da = i18n.language === 'da';
  const titleViolations = jobTitle.trim() ? checkBulletBias(jobTitle, language) : [];

  return (
    <>
      {/* Output language toggle */}
      <div className="outlang">
        <span className="lbl">{t('tier1.outputLang')}</span>
        <div className="seg">
          <button type="button" className={language === 'da' ? 'on' : ''} onClick={() => setLanguage('da')}>
            🇩🇰 {t('tier1.languageDa')}
          </button>
          <button type="button" className={language === 'en' ? 'on' : ''} onClick={() => setLanguage('en')}>
            🇬🇧 {t('tier1.languageEn')}
          </button>
        </div>
      </div>

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

      {/* Bullets / responsibilities */}
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
          onDismissChallenge={onDismissChallenge}
          onAcceptChallenge={onAcceptChallenge}
        />
      </section>

      {/* Details grid */}
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
          <div className="field">
            <label>{t('tier1.departmentLabel')}</label>
            <input
              className="input"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder={t('tier1.departmentPlaceholder')}
              maxLength={200}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 'var(--s-3)' }}>
          <label>{t('tier1.teamCompositionLabel')}</label>
          <textarea
            className="textarea"
            rows={3}
            value={teamComposition}
            onChange={(e) => setTeamComposition(e.target.value)}
            placeholder={t('tier1.teamCompositionPlaceholder')}
            maxLength={500}
            style={{ resize: 'vertical' }}
          />
        </div>
      </section>
    </>
  );
}
