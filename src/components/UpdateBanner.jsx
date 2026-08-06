const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function UpdateBanner({ updateStatus, downloadPercent }) {
  if (updateStatus !== 'downloading' && updateStatus !== 'ready') {
    return null;
  }

  const handleRestart = () => {
    if (ipcRenderer) {
      ipcRenderer.send('restart-and-install-update');
    } else if (window.electronAPI && window.electronAPI.restartAndInstallUpdate) {
      window.electronAPI.restartAndInstallUpdate();
    } else {
      alert('Restart and install update triggered (dev mode fallback).');
    }
  };

  const safePercent = Math.min(100, Math.max(0, downloadPercent || 0));

  return (
    <div className="w-full bg-slate-900 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between shadow-lg z-50 text-slate-100 font-sans text-xs">
      <div className="flex items-center gap-3 flex-1 max-w-2xl">
        <div className="w-7 h-7 bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-center justify-center text-amber-400 shrink-0">
          {updateStatus === 'downloading' ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {updateStatus === 'downloading' ? (
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center text-[11px] font-semibold">
              <span className="text-amber-300">Downloading Software Update...</span>
              <span className="text-amber-400 font-mono">{safePercent.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${safePercent}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="font-bold text-emerald-400">Update Ready to Install!</p>
            <p className="text-[11px] text-slate-400">A new version of Dine360 has been downloaded in the background.</p>
          </div>
        )}
      </div>

      {updateStatus === 'ready' && (
        <button
          type="button"
          onClick={handleRestart}
          className="ml-4 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
        >
          <span>🚀 Restart & Update</span>
        </button>
      )}
    </div>
  );
}
