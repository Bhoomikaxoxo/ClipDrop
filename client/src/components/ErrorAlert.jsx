import React from 'react';
import { AlertTriangle, RefreshCw, X, ShieldAlert, Wrench } from 'lucide-react';

export default function ErrorAlert({ errorMsg, onDismiss }) {
  if (!errorMsg) return null;

  const isYtdlpStale = errorMsg.includes('yt-dlp -U') || errorMsg.includes('Instagram extraction failed');
  const isPrivate = errorMsg.includes('private') || errorMsg.includes('cookies');

  return (
    <div className="w-full max-w-2xl mx-auto glass-panel rounded-2xl p-4 sm:p-5 mt-6 border border-rose-500/40 bg-rose-950/20 text-rose-200 animate-fade-in relative shadow-xl">
      <div className="flex items-start gap-3.5">
        <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
          {isPrivate ? (
            <ShieldAlert className="w-5 h-5" />
          ) : isYtdlpStale ? (
            <Wrench className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <h4 className="text-sm font-bold text-rose-100 flex items-center gap-2">
            Extraction Error
          </h4>
          <p className="text-xs sm:text-sm text-rose-200/90 mt-1 leading-relaxed">
            {errorMsg}
          </p>

          {isYtdlpStale && (
            <div className="mt-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
              <p className="text-amber-400 font-semibold mb-1">💡 Host Maintenance Tip:</p>
              <code>yt-dlp -U</code> (Run this terminal command on your server to update yt-dlp)
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-900/40 transition-colors"
            title="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
