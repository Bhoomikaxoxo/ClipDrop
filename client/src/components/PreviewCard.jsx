import React, { useState } from 'react';
import { Download, Film, Music } from 'lucide-react';

export default function PreviewCard({ metadata, isLoading, onStartDownload, isDownloading }) {
  if (isLoading) {
    return (
      <div className="preview-card rounded-2xl p-5 w-full">
        <div className="flex gap-4 items-start">
          <div className="w-28 h-20 rounded-xl sk shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-4 sk rounded-lg w-3/4" />
            <div className="h-3 sk rounded-lg w-1/2" />
            <div className="h-10 sk rounded-xl w-full mt-2" />
          </div>
        </div>
      </div>
    );
  }
  if (!metadata) return null;

  const { title, thumbnail, duration, formats = [] } = metadata;
  const [selId, setSelId] = useState(formats[0]?.formatId || 'best');
  const sel = formats.find(f => f.formatId === selId) || formats[0];

  return (
    <div className="preview-card rounded-2xl p-5 w-full">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="relative w-full sm:w-32 h-20 rounded-xl overflow-hidden bg-white/5 shrink-0">
          {thumbnail
            ? <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.2)' }} /></div>
          }
          {duration && (
            <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded-md font-mono">{duration}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-sm font-medium text-slate-100 line-clamp-2 leading-snug">{title}</p>
          <div className="flex gap-2">
            <select
              value={selId}
              onChange={e => setSelId(e.target.value)}
              disabled={isDownloading}
              className="sel flex-1 bg-white/5 border border-white/08 rounded-xl px-3 py-2.5 text-[13px] text-slate-300 focus:border-blue-500/40 focus:outline-none"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {formats.map(f => (
                <option key={f.formatId} value={f.formatId} className="bg-[#0f1222]">
                  {f.label}{f.filesizeApprox ? ` · ${f.filesizeApprox}` : ''}{f.isAudioOnly ? ' (Audio)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onStartDownload(selId)}
              disabled={isDownloading}
              className="btn-cta flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white whitespace-nowrap"
            >
              {isDownloading
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
                : <>{sel?.isAudioOnly ? <Music className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />} Download</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
