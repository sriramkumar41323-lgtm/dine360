import { useState, useEffect, useCallback } from 'react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function PinPad({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = useCallback(async (enteredPin) => {
    setIsLoading(true);
    setErrorMsg('');

    try {
      let response = null;

      if (ipcRenderer && ipcRenderer.invoke) {
        response = await ipcRenderer.invoke('authenticate-pin', enteredPin);
      } else if (window.electronAPI && window.electronAPI.authenticatePin) {
        response = await window.electronAPI.authenticatePin(enteredPin);
      } else {
        // Fallback for browser dev mode
        if (enteredPin === '1234') {
          response = { success: true, user: { user_id: 1, name: 'Admin', role: 'manager' } };
        } else if (enteredPin === '5678') {
          response = { success: true, user: { user_id: 2, name: 'Cashier', role: 'cashier' } };
        } else {
          response = { success: false, message: 'Invalid PIN' };
        }
      }

      if (response && response.success) {
        onUnlock(response.user);
      } else {
        setIsShaking(true);
        setErrorMsg(response?.message || 'Invalid PIN');
        setTimeout(() => {
          setPin('');
          setIsShaking(false);
        }, 400);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setIsShaking(true);
      setErrorMsg('Authentication failed');
      setTimeout(() => {
        setPin('');
        setIsShaking(false);
      }, 400);
    } finally {
      setIsLoading(false);
    }
  }, [onUnlock]);

  const handleKeyPress = useCallback((num) => {
    if (isLoading || pin.length >= 4) return;
    const newPin = pin + num;
    setPin(newPin);
    if (newPin.length === 4) {
      handleAuth(newPin);
    }
  }, [pin, isLoading, handleAuth]);

  const handleDelete = useCallback(() => {
    if (isLoading) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, [isLoading]);

  const handleClear = useCallback(() => {
    if (isLoading) return;
    setErrorMsg('');
    setPin('');
  }, [isLoading]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress, handleDelete, handleClear]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans select-none">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-slate-950 to-orange-950/20 pointer-events-none" />

      <div className={`relative z-10 w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 text-center ${isShaking ? 'animate-shake' : ''}`}>
        
        {/* Header */}
        <div className="mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-wide text-white">Dine360 POS</h1>
          <p className="text-sm text-slate-400 mt-1">Enter Staff PIN to Unlock Terminal</p>
        </div>

        {/* 4 Digit Indicators */}
        <div className="flex justify-center items-center gap-4 mb-6">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                  isFilled
                    ? 'bg-amber-500 border-amber-400 scale-110 shadow-lg shadow-amber-500/50'
                    : 'bg-slate-800/80 border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Status / Error Message */}
        <div className="h-6 mb-4 flex items-center justify-center">
          {errorMsg ? (
            <p className="text-xs font-semibold text-rose-400 animate-pulse">{errorMsg}</p>
          ) : isLoading ? (
            <p className="text-xs font-semibold text-amber-400 animate-pulse">Authenticating...</p>
          ) : (
            <p className="text-xs text-slate-500">Default PINs: Admin (1234) | Cashier (5678)</p>
          )}
        </div>

        {/* Touch Keypad Grid (3x4) */}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num)}
              className="h-16 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 text-2xl font-semibold text-slate-100 transition-all duration-150 border border-slate-700/50 shadow-md flex items-center justify-center cursor-pointer"
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            className="h-16 rounded-2xl bg-slate-800/40 hover:bg-rose-950/40 active:bg-rose-900/60 text-xs font-bold tracking-wider text-rose-400 uppercase transition-all duration-150 border border-slate-800 flex items-center justify-center cursor-pointer"
          >
            Clear
          </button>

          {/* 0 Button */}
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-16 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 text-2xl font-semibold text-slate-100 transition-all duration-150 border border-slate-700/50 shadow-md flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={handleDelete}
            className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-700/50 active:bg-slate-700 text-slate-300 transition-all duration-150 border border-slate-800 flex items-center justify-center cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2H10.828a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}
