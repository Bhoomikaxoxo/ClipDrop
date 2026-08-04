import React, { useState, useEffect } from 'react';
import PlasmaWave from './components/PlasmaWave';
import UrlInput from './components/UrlInput';
import PreviewCard from './components/PreviewCard';
import ProgressBar from './components/ProgressBar';
import ErrorAlert from './components/ErrorAlert';
import FeatureGrid from './components/FeatureGrid';
import { Github, Droplets, Zap } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || '';

export default function App() {
  const [urlValue,      setUrlValue]      = useState('');
  const [isExtracting,  setIsExtracting]  = useState(false);
  const [loadingStage,  setLoadingStage]  = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [metadata,      setMetadata]      = useState(null);
  const [jobId,         setJobId]         = useState(null);
  const [progress,      setProgress]      = useState(null);
  const [error,         setError]         = useState('');
  const [bg, setBg] = useState(true);

  useEffect(() => {
    try { const s = localStorage.getItem('cd_bg'); if (s) setBg(s === '1'); } catch {}
  }, []);
  const toggleBg = () => { const n = !bg; setBg(n); localStorage.setItem('cd_bg', n ? '1' : '0'); };

  const extract = async (url) => {
    setError(''); setMetadata(null); setProgress(null);
    setIsExtracting(true); setLoadingStage('Resolving link...');
    const t = setTimeout(() => setLoadingStage('Fetching formats...'), 1500);
    try {
      const r = await fetch(`${API}/api/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to extract.');
      setMetadata(d); setJobId(d.jobId);
    } catch (e) { setError(e.message); }
    finally { clearTimeout(t); setIsExtracting(false); setLoadingStage(''); }
  };

  const startDownload = async (formatId) => {
    if (!jobId || !metadata) return;
    setIsDownloading(true); setError('');
    setProgress({ percent: 0, status: 'Initiating...' });
    const es = new EventSource(`${API}/api/progress/${jobId}`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data); setProgress(d);
        if (d.jobStatus === 'ready') { es.close(); save(d.downloadUrl); }
        else if (d.jobStatus === 'error') { es.close(); setIsDownloading(false); setError(d.error || 'Failed.'); }
      } catch {}
    };
    es.onerror = () => es.close();
    try {
      const r = await fetch(`${API}/api/download`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, formatId, url: metadata?.url || urlValue }),
      });
      const d = await r.json();
      if (!r.ok) { es.close(); throw new Error(d.error || 'Download failed.'); }
    } catch (e) { es.close(); setIsDownloading(false); setError(e.message); }
  };

  const save = (url) => {
    setIsDownloading(false);
    const a = document.createElement('a');
    a.href = `${API}${url}`;
    a.download = metadata ? `${metadata.title}.mp4` : 'video.mp4';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="relative min-h-screen flex flex-col font-body select-none"
      style={{ background: '#060612', color: '#F8FAFC' }}>

      {/* ── Layer 0: PlasmaWave — atmospheric violet/indigo waves ── */}
      {bg && (
        <div className="fixed inset-0 z-0">
          <PlasmaWave
            colors={["#3b0764", "#1e1b4b"]}
            speed1={0.04}
            speed2={0.04}
            focalLength={0.8}
            bend1={0.9}
            bend2={0.45}
            dir2={-1.0}
            rotationDeg={0}
          />
        </div>
      )}

      {/* ── Layer 1: Vignette — darkest at center, liquid at edges ── */}
      <div className="fixed inset-0 z-[1] pointer-events-none" style={{
        background: `
          radial-gradient(ellipse 75% 75% at 50% 50%,
            rgba(6,6,18,0.88) 0%,
            rgba(6,6,18,0.65) 40%,
            rgba(6,6,18,0.25) 70%,
            transparent 100%
          ),
          linear-gradient(to bottom,
            rgba(6,6,18,0.55) 0%,
            transparent 15%,
            transparent 85%,
            rgba(6,6,18,0.55) 100%
          )
        `
      }} />

      {/* ── Layer 2: All content ── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ══ NAVBAR ══════════════════════════════════════════════ */}
        <div className="flex justify-center pt-8 px-6">
          <nav className="nav-pill flex items-center justify-between px-7 rounded-full"
            style={{ width: '100%', maxWidth: '640px', height: '64px' }}>

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#5B8CFF,#8B5CF6)' }}>
                <Droplets className="w-4 h-4 text-white" strokeWidth={2} />
              </div>
              <span className="font-display font-bold text-[16px] tracking-tight text-white">
                ClipDrop
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <a href="https://github.com/Bhoomikaxoxo/ClipDrop" target="_blank" rel="noreferrer"
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.09)'; e.currentTarget.style.color='rgba(255,255,255,0.9)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='rgba(255,255,255,0.55)'; }}>
                <Github className="w-3.5 h-3.5" />
                GitHub
              </a>
            </div>
          </nav>
        </div>

        {/* ══ HERO ════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-full" style={{ maxWidth: '640px' }}>

            {/* ── Badge — 72px below nav ── */}
            <div style={{ height: '56px' }} />
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full badge text-[13px] font-medium"
              style={{ color: 'rgba(255,255,255,0.6)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} fill="#f59e0b" />
              Fast &nbsp;·&nbsp; Private &nbsp;·&nbsp; No Watermarks
            </div>

            {/* ── Headline — 32px below badge ── */}
            <div style={{ height: '32px' }} />
            <h1 className="font-display font-extrabold text-white"
              style={{
                fontSize: 'clamp(2.2rem, 4.8vw, 3.6rem)',
                lineHeight: '0.96',
                letterSpacing: '-0.03em',
                textShadow: '0 4px 48px rgba(0,0,0,0.8)',
              }}>
              Paste.{' '}
              <span className="text-yt">Download.</span>
              <br />
              <span className="text-ig">Original</span>{' '}
              Quality.
            </h1>

            {/* ── Subtitle — 20px below headline ── */}
            <div style={{ height: '20px' }} />
            <p className="mx-auto text-[15px] leading-relaxed"
              style={{
                color: 'rgba(255,255,255,0.62)',
                maxWidth: '480px',
                textShadow: '0 2px 16px rgba(0,0,0,0.6)',
              }}>
              Paste any YouTube video or Instagram Reel URL to instantly download the original video in the highest available quality. No login. No waiting.
            </p>

            {/* ── Download Card — 52px below subtitle ── THIS IS THE HERO ── */}
            <div style={{ height: '52px' }} />
            <UrlInput
              urlValue={urlValue} setUrlValue={setUrlValue}
              onSubmit={extract} isLoading={isExtracting} loadingStage={loadingStage}
            />

            {/* Error */}
            {error && (
              <div className="mt-4">
                <ErrorAlert errorMsg={error} onDismiss={() => setError('')} />
              </div>
            )}

            {/* Preview card */}
            {(metadata || isExtracting) && (
              <div className="mt-4">
                <PreviewCard
                  metadata={metadata} isLoading={isExtracting}
                  onStartDownload={startDownload} isDownloading={isDownloading}
                />
              </div>
            )}

            {/* Progress */}
            {isDownloading && (
              <div className="mt-4">
                <ProgressBar progressData={progress} />
              </div>
            )}

            {/* ── Trust row — 36px below card ── */}
            <div style={{ height: '36px' }} />
            <FeatureGrid />

            {/* ── Footer — 56px below trust row ── */}
            <div style={{ height: '56px' }} />
            <p className="text-[11px] tracking-widest uppercase font-mono"
              style={{ color: 'rgba(255,255,255,0.22)' }}>
              Made for personal use &nbsp;·&nbsp; No tracking &nbsp;·&nbsp; Single session
            </p>

            <div style={{ height: '64px' }} />
          </div>
        </main>
      </div>

    </div>
  );
}
