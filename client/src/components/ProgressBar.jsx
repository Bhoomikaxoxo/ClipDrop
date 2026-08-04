import React from 'react';
import { Loader2, Zap, Clock, ShieldCheck } from 'lucide-react';

function formatEtaDisplay(eta) {
  if (!eta) return null;
  if (typeof eta === 'string' && /^\d+:\d{2}/.test(eta.trim())) {
    const parts = eta.trim().split(':').map(p => parseInt(p, 10));
    if (parts.every(p => !isNaN(p))) {
      let totalSeconds = 0;
      if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
      else if (parts.length === 1) totalSeconds = parts[0];

      if (totalSeconds <= 1) return '< 5 sec';
      if (totalSeconds < 60) return `${totalSeconds} sec`;
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      if (hrs > 0) return `${hrs} hr ${mins} min`;
      if (secs > 0) return `${mins} min ${secs} sec`;
      return `${mins} min`;
    }
  }
  return eta;
}

export default function ProgressBar({ progressData }) {
  if (!progressData) return null;

  const { percent = 0, speed, eta, status = 'Downloading...' } = progressData;
  const clampedPercent = Math.min(Math.max(Math.round(percent), 0), 100);
  const formattedEta = formatEtaDisplay(eta);

  return (
    <div className="w-full max-w-3xl mx-auto glass-panel rounded-xl p-4 mt-4 border border-violet-500/30 animate-fade-in space-y-2.5 font-body">
      {/* Status Header */}
      <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
        <span className="flex items-center gap-2 text-slate-200">
          <Loader2 className="w-4 h-4 text-fuchsia-400 animate-spin" />
          {status}
        </span>
        <span className="font-bold font-display text-fuchsia-400 text-base">{clampedPercent}%</span>
      </div>

      {/* Outer Progress Track */}
      <div className="w-full bg-slate-950 rounded-full h-3 p-0.5 border border-slate-800 overflow-hidden relative">
        <div
          className="bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 h-full rounded-full transition-all duration-300 relative shadow-[0_0_15px_rgba(192,38,211,0.5)]"
          style={{ width: `${clampedPercent}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>

      {/* Download Stats Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
        {speed ? (
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
            Speed: <strong className="text-slate-200">{speed}</strong>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Direct Stream
          </span>
        )}

        {formattedEta && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            ETA: <strong className="text-slate-200">{formattedEta}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
