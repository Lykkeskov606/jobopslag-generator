import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import TopBar from '../components/TopBar';

// Final documents for a completed Tier 2 project. Reached from Step 9 "Afslut"
// and directly via /projects/:id/outputs. Content comes from the same backend
// resolution as the .docx exports, so preview and download always match.
export function OutputsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [downloading, setDownloading] = useState(null);
  const [downloadErrors, setDownloadErrors] = useState({});

  useEffect(() => {
    api.get(`/tier2/${id}/outputs`)
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 404) setError('not_found');
        else setError('load_failed');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const docs = [
    { key: 'job-analysis',      label: t('tier2.step9DocJobAnalysis'),      sub: t('tier2.step9DocJobAnalysisSub') },
    { key: 'job-posting',       label: t('tier2.step9DocJobPosting'),       sub: t('tier2.step9DocJobPostingSub') },
    { key: 'candidate-profile', label: t('tier2.step9DocCandidateProfile'), sub: t('tier2.step9DocCandidateProfileSub') },
    { key: 'interview-guide',   label: t('tier2.step9DocInterviewGuide'),   sub: t('tier2.step9DocInterviewGuideSub') },
  ].filter((d) => data?.documents?.[d.key]);

  function triggerDownload(url, fallbackFilename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }

  async function download(docType) {
    setDownloading(docType);
    setDownloadErrors((e) => ({ ...e, [docType]: null }));
    try {
      const path = docType === 'zip' ? `/tier2/export/${id}/zip` : `/tier2/export/${id}/${docType}`;
      const response = await api.get(path, { responseType: 'blob' });
      const cd = response.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+?)"/);
      const filename = match ? match[1] : (docType === 'zip' ? 'rekrutteringsprojekt.zip' : `${docType}.docx`);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      triggerDownload(url, filename);
    } catch {
      setDownloadErrors((e) => ({ ...e, [docType]: t('outputs.downloadError') }));
    } finally {
      setDownloading(null);
    }
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

  if (error) {
    return (
      <div className="app">
        <TopBar active="projects" />
        <main className="work">
          <div className="project-loading">
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {error === 'not_found' ? t('outputs.notFound') : t('outputs.loadFailed')}
            </p>
            <button className="link-btn" onClick={() => navigate('/dashboard')}>
              ← {t('outputs.backToDashboard')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const cardStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '16px 20px', marginBottom: 12,
  };

  return (
    <div className="app s-review">
      <TopBar active="projects" />
      <main className="work">
        <section className="review-head" style={{ textAlign: 'center', paddingBottom: 'var(--s-5)' }}>
          <h1 style={{ marginBottom: 8 }}>{data.project_name}</h1>
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            {docs.length ? t('outputs.sub') : t('outputs.emptySub')}
          </p>
        </section>

        {docs.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ marginBottom: 16, color: 'var(--ink-2)' }}>{t('outputs.empty')}</p>
            <button className="btn btn-primary" onClick={() => navigate(`/projects/${id}`)}>
              {t('outputs.openProject')}
            </button>
          </div>
        )}

        <div style={{ marginBottom: 32 }}>
          {docs.map((doc) => (
            <div key={doc.key} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{doc.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{doc.sub}</div>
                  {downloadErrors[doc.key] && (
                    <div style={{ fontSize: 13, color: 'var(--error, #c0392b)', marginTop: 4 }}>{downloadErrors[doc.key]}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setExpanded((e) => ({ ...e, [doc.key]: !e[doc.key] }))}
                  >
                    {expanded[doc.key] ? t('outputs.hide') : t('outputs.show')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minWidth: 100 }}
                    onClick={() => download(doc.key)}
                    disabled={!!downloading}
                  >
                    {downloading === doc.key ? t('tier2.step9Downloading') : t('tier2.step9DownloadBtn')}
                  </button>
                </div>
              </div>
              {expanded[doc.key] && (
                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6,
                  borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14,
                }}>
                  {data.documents[doc.key]}
                </div>
              )}
            </div>
          ))}
        </div>

        {docs.length > 0 && (
          <div style={{
            background: 'var(--accent-soft, #f0f4ff)',
            border: '1px solid var(--accent-border, #c7d7fb)',
            borderRadius: 10, padding: '20px 24px', marginBottom: 32, textAlign: 'center',
          }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{t('tier2.step9ZipBtn')}</div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 16 }}>{t('tier2.step9ZipSub')}</div>
            {downloadErrors.zip && (
              <div style={{ fontSize: 13, color: 'var(--error, #c0392b)', marginBottom: 8 }}>{downloadErrors.zip}</div>
            )}
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => download('zip')}
              disabled={!!downloading}
            >
              {downloading === 'zip' ? t('tier2.step9Downloading') : t('tier2.step9ZipBtn')}
            </button>
          </div>
        )}

        <div className="actionbar">
          <div className="actionbar-inner">
            <button type="button" className="link-back" onClick={() => navigate(`/projects/${id}`)}>
              <span className="arrow">←</span> {t('outputs.openProject')}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
              {t('outputs.backToDashboard')}
              <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
