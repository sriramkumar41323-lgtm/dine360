export default function SecurityLockdown({ onResetActivation }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans select-none relative overflow-hidden">
      {/* Red Ambient Alarm Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-rose-950/40 via-slate-950 to-red-950/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg bg-slate-900/90 backdrop-blur-2xl border border-rose-900/50 rounded-3xl p-8 shadow-2xl shadow-rose-950/50 text-center animate-fade-in">
        
        {/* Security Shield Badge */}
        <div className="w-20 h-20 bg-rose-950/80 border border-rose-800 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-rose-900/30 mb-6">
          <svg className="w-10 h-10 text-rose-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Header Alert */}
        <h1 className="text-2xl font-extrabold tracking-wide text-rose-400">Security Alert: Hardware Mismatch</h1>
        <p className="text-sm text-slate-300 mt-3 leading-relaxed">
          This POS database and software license are bound to another physical machine UUID. Unauthorized copying or moving the database across hardware is strictly restricted.
        </p>

        {/* Lock Info Box */}
        <div className="my-6 p-4 bg-rose-950/30 border border-rose-900/40 rounded-2xl text-left space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-300">
            <span className="font-semibold text-rose-400">Security Status:</span>
            <span className="font-bold text-rose-500 uppercase tracking-wider bg-rose-950 px-2 py-0.5 rounded border border-rose-800">Terminal Locked</span>
          </div>
          <p className="text-slate-400">
            Node-Lock Hardware Protection UUID mismatch detected. The Staff PIN Pad and POS POS engine remain disabled until resolved.
          </p>
        </div>

        {/* Action Options */}
        <div className="space-y-3">
          {onResetActivation && (
            <button
              type="button"
              onClick={onResetActivation}
              className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
            >
              🔑 Re-Activate Terminal with New Key
            </button>
          )}

          <div className="text-xs text-slate-500 pt-2">
            Need assistance? Contact Support: <span className="text-slate-300 font-semibold">support@dine360.com</span>
          </div>
        </div>

      </div>
    </div>
  );
}
