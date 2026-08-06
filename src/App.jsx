import { useState, useEffect } from 'react';
import ActivationScreen from './components/ActivationScreen';
import SecurityLockdown from './components/SecurityLockdown';
import UpdateBanner from './components/UpdateBanner';
import PinPad from './components/PinPad';
import Registration from './Registration';
import POS from './POS';
import AdminDashboard from './AdminDashboard';
import InventoryManager from './InventoryManager';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [isHardwareValid, setIsHardwareValid] = useState(null); // null = checking, false = mismatch, true = valid
  const [isRegistered, setIsRegistered] = useState(null); // null = loading, false = not registered, true = registered
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('pos');

  // Auto-updater states
  const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle' | 'available' | 'downloading' | 'ready'
  const [downloadPercent, setDownloadPercent] = useState(0);

  useEffect(() => {
    async function initSecurityAndActivation() {
      try {
        let hwRes = null;
        if (ipcRenderer && ipcRenderer.invoke) {
          hwRes = await ipcRenderer.invoke('verify-hardware');
        } else if (window.electronAPI && window.electronAPI.verifyHardware) {
          hwRes = await window.electronAPI.verifyHardware();
        } else {
          // Browser dev mode fallback
          const localVal = localStorage.getItem('dine360_is_registered');
          hwRes = { activated: localVal === 'true', isValid: true };
        }

        if (hwRes && (hwRes.reason === 'hardware_mismatch' || hwRes.isValid === false)) {
          setIsHardwareValid(false);
          setIsRegistered(false);
          return;
        }

        if (hwRes && hwRes.activated === true) {
          setIsHardwareValid(true);
          setIsRegistered(true);
        } else {
          setIsHardwareValid(true);
          setIsRegistered(false);
        }
      } catch (err) {
        console.error('Error during boot security verification:', err);
        setIsHardwareValid(true);
        setIsRegistered(false);
      }
    }
    initSecurityAndActivation();
  }, []);

  // Listen for OTA Auto-Updater IPC events
  useEffect(() => {
    if (ipcRenderer) {
      const handleAvailable = () => setUpdateStatus('downloading');
      const handleProgress = (event, percent) => {
        setUpdateStatus('downloading');
        setDownloadPercent(percent);
      };
      const handleDownloaded = () => setUpdateStatus('ready');

      ipcRenderer.on('update-available', handleAvailable);
      ipcRenderer.on('update-progress', handleProgress);
      ipcRenderer.on('update-downloaded', handleDownloaded);

      return () => {
        ipcRenderer.removeListener('update-available', handleAvailable);
        ipcRenderer.removeListener('update-progress', handleProgress);
        ipcRenderer.removeListener('update-downloaded', handleDownloaded);
      };
    } else if (window.electronAPI) {
      const cleanAvail = window.electronAPI.onUpdateAvailable?.(() => setUpdateStatus('downloading'));
      const cleanProg = window.electronAPI.onUpdateProgress?.((pct) => {
        setUpdateStatus('downloading');
        setDownloadPercent(pct);
      });
      const cleanDown = window.electronAPI.onUpdateDownloaded?.(() => setUpdateStatus('ready'));
      return () => {
        cleanAvail?.();
        cleanProg?.();
        cleanDown?.();
      };
    }
  }, []);

  const handleUnlock = (user) => {
    setCurrentUser(user);
    setCurrentScreen('pos');
  };

  const handleNavigate = (screen) => {
    if (screen === 'lock' || screen === 'logout' || screen === 'registration') {
      setCurrentUser(null);
      setCurrentScreen('pos');
      return;
    }

    // Role-based navigation guard for cashier
    if (currentUser?.role === 'cashier' && screen !== 'pos') {
      setCurrentScreen('pos');
      return;
    }

    setCurrentScreen(screen);
  };

  // 1. Loading state during hardware & activation check
  if (isHardwareValid === null || isRegistered === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs text-slate-400 font-medium">Verifying Hardware Binding & Cloud License Status...</p>
      </div>
    );
  }

  // 2. Hardware mismatch security lockdown screen
  if (isHardwareValid === false) {
    return <SecurityLockdown onResetActivation={() => { setIsHardwareValid(true); setIsRegistered(false); }} />;
  }

  // 3. Unregistered device setup screen
  if (isRegistered === false) {
    return <ActivationScreen onActivated={() => { setIsHardwareValid(true); setIsRegistered(true); }} />;
  }

  // 4. Registered device -> Staff PIN unlock screen
  if (!currentUser) {
    return <PinPad onUnlock={handleUnlock} />;
  }

  // 5. Authenticated application views
  const activeScreen = currentUser.role === 'cashier' ? 'pos' : currentScreen;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <UpdateBanner updateStatus={updateStatus} downloadPercent={downloadPercent} />
      <div className="flex-1">
        {activeScreen === 'pos' && (
          <POS onNavigate={handleNavigate} currentUser={currentUser} />
        )}
        {activeScreen === 'dashboard' && (
          <AdminDashboard onNavigate={handleNavigate} currentUser={currentUser} />
        )}
        {activeScreen === 'inventory' && (
          <InventoryManager onNavigate={handleNavigate} currentUser={currentUser} />
        )}
        {activeScreen === 'registration' && (
          <Registration onNavigate={handleNavigate} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}