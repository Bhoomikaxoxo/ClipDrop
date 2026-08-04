import React from 'react';
import { Loader2, Zap, Clock, ShieldCheck } from 'lucide-react';

export default function ProgressBar({ progressData }) {
  if (!progressData) return null;

  const { percent = 0, speed, eta, status = 'Downloading...' } = progressData;
  const clampedPercent = Math.min(Math.max(Math.round(percent), 0), 100);

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

        {eta && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            ETA: <strong className="text-slate-200">{eta}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
