import { useState } from 'react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function ActivationScreen({ onActivated }) {
  const [restaurantName, setRestaurantName] = useState('Royal Spice');
  const [licenseKey, setLicenseKey] = useState('DINE-360-KEY-2026');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!restaurantName.trim()) {
      setErrorMsg('Please enter a valid Restaurant Name.');
      return;
    }
    if (!licenseKey.trim()) {
      setErrorMsg('Please enter a valid Activation Key.');
      return;
    }

    setIsLoading(true);

    try {
      let result = null;
      const activationData = {
        restaurant_name: restaurantName.trim(),
        license_key: licenseKey.trim()
      };

      if (ipcRenderer && ipcRenderer.invoke) {
        result = await ipcRenderer.invoke('activate-software', activationData);
      } else if (window.electronAPI && window.electronAPI.activateSoftware) {
        result = await window.electronAPI.activateSoftware(activationData);
      } else if (window.electronAPI && window.electronAPI.saveActivation) {
        result = await window.electronAPI.saveActivation(activationData);
      } else {
        // Browser fallback
        localStorage.setItem('dine360_is_registered', 'true');
        localStorage.setItem('dine360_restaurant_name', restaurantName);
        localStorage.setItem('dine360_license_key', licenseKey);
        result = { success: true };
      }

      if (result && result.success) {
        onActivated();
      } else {
        setErrorMsg(result?.error || 'Failed to activate terminal. Please try again.');
      }
    } catch (err) {
      console.error('Activation Error:', err);
      setErrorMsg('System error during activation.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans select-none relative overflow-hidden">
      {/* Background Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-950/30 via-slate-950 to-indigo-950/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-amber-950/30 text-left">
        
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-wide text-white">Dine360 POS</h1>
          <p className="text-sm text-slate-400 mt-1">Device Registration & Terminal Activation</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Restaurant / Outlet Name
            </label>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="e.g. Royal Spice Restaurant"
              className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Activation / License Key
            </label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="e.g. DINE-360-XXXX-XXXX"
              className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono text-sm tracking-wider"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-xs font-semibold text-rose-300 animate-fade-in text-center">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {isLoading ? (
              <>
                <svg className="w-5 h-5 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Activating Terminal...</span>
              </>
            ) : (
              <span>Verify & Activate Terminal →</span>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500">
            Dine360 POS Enterprise Edition • License Node Lock Protection
          </p>
        </div>
      </div>
    </div>
  );
}
