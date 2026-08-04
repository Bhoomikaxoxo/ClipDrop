import React, { useRef } from 'react';
import { Link2, Clipboard, Download, Loader2 } from 'lucide-react';

export default function UrlInput({ onSubmit, isLoading, loadingStage, urlValue, setUrlValue }) {
  const inputRef = useRef(null);
  const cardRef  = useRef(null);

  /* Mouse spotlight: track position inside card and set CSS vars */
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty('--mx', `${e.clientX - left}px`);
    cardRef.current.style.setProperty('--my', `${e.clientY - top}px`);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlValue(text.trim());
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = urlValue.trim();
    if (v) onSubmit(v);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className="download-card rounded-3xl w-full"
      style={{ padding: '28px' }}
    >
      {/* All content sits above the ::before spotlight layer */}
      <div className="relative z-10">
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Input row */}
          <div className="url-input-row flex items-center gap-3 px-4 h-14">
            <Link2 className="w-4 h-4 text-slate-600 shrink-0" strokeWidth={1.8} />
            <input
              ref={inputRef}
              type="url"
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              placeholder="Paste a YouTube or Instagram URL..."
              disabled={isLoading}
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-40"
            />
            {urlValue && !isLoading && (
              <button
                type="button"
                onClick={() => setUrlValue('')}
                className="text-slate-600 hover:text-slate-400 transition-colors text-xl leading-none"
              >
                ×
              </button>
            )}
            <button
              type="button"
              onClick={handlePaste}
              disabled={isLoading}
              className="btn-sec shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium text-slate-400 hover:text-slate-200"
            >
              <Clipboard className="w-3.5 h-3.5" />
              Paste
            </button>
          </div>

          {/* Full-width Download button */}
          <button
            type="submit"
            disabled={isLoading || !urlValue.trim()}
            className="btn-cta w-full flex items-center justify-center gap-2.5 h-[52px] rounded-2xl text-[15px] font-semibold text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingStage || 'Fetching...'}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" strokeWidth={2.2} />
                Download
              </>
            )}
          </button>
        </form>

        {/* Helper text */}
        <p className="mt-4 text-[11px] text-center tracking-wide"
          style={{ color: 'rgba(255,255,255,0.28)' }}>
          YouTube Videos &nbsp;·&nbsp; Shorts &nbsp;·&nbsp; Instagram Reels &nbsp;·&nbsp; Posts
        </p>
      </div>
    </div>
  );
}
