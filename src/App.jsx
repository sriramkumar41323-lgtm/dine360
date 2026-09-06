import { useState, useEffect, useCallback } from 'react';
import SecurityLockdown from './components/SecurityLockdown';
import UpdateBanner from './components/UpdateBanner';
import PinPad from './components/PinPad';
import Registration from './Registration';
import PaymentScreen from './components/PaymentScreen';
import POS from './POS';
import AdminDashboard from './AdminDashboard';
import InventoryManager from './InventoryManager';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [isHardwareValid, setIsHardwareValid] = useState(null); // null = checking, false = mismatch, true = valid
  const [isRegistered, setIsRegistered] = useState(null); // null = loading, false = not registered, true = registered
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('pos');
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Auto-updater states
  const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle' | 'available' | 'downloading' | 'ready'
  const [downloadPercent, setDownloadPercent] = useState(0);

  const checkLicenseAndSecurity = useCallback(async () => {
    try {
      let hwRes = null;
      if (ipcRenderer && ipcRenderer.invoke) {
        hwRes = await ipcRenderer.invoke('verify-hardware');
      } else if (window.electronAPI && window.electronAPI.verifyHardware) {
        hwRes = await window.electronAPI.verifyHardware();
      } else {
        // Browser dev mode fallback
        const localVal = localStorage.getItem('dine360_is_registered');
        const planExpiry = localStorage.getItem('dine360_plan_expiry_date');
        const diffMs = planExpiry ? (new Date(planExpiry) - new Date()) : (7 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const isExp = daysLeft <= 0;

        hwRes = {
          activated: localVal === 'true',
          isValid: true,
          licenseInfo: {
            isRegistered: localVal === 'true',
            restaurantId: localStorage.getItem('dine360_restaurant_id') || 'D360-DEV-1001',
            restaurantName: localStorage.getItem('dine360_restaurant_name') || 'Royal Spice POS',
            ownerName: localStorage.getItem('dine360_owner_name') || 'Owner',
            planStatus: isExp ? 'expired' : 'trial',
            daysRemaining: daysLeft,
            isExpired: isExp,
            autoLoginEnabled: true
          }
        };
      }

      if (hwRes && (hwRes.reason === 'hardware_mismatch' || hwRes.isValid === false)) {
        setIsHardwareValid(false);
        setIsRegistered(false);
        return;
      }

      const info = hwRes?.licenseInfo || {};
      setLicenseInfo(info);

      if (hwRes && hwRes.activated === true && info.isRegistered) {
        setIsHardwareValid(true);
        setIsRegistered(true);

        // Persistent Auto-Login: If auto-login enabled, log into manager/owner automatically!
        if (info.autoLoginEnabled !== false && !info.isExpired) {
          setCurrentUser({
            name: info.ownerName || info.restaurantName || 'Admin',
            role: 'manager'
          });
        }
      } else {
        setIsHardwareValid(true);
        setIsRegistered(false);
      }
    } catch (err) {
      console.error('Error during boot security verification:', err);
      setIsHardwareValid(true);
      setIsRegistered(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function runBootCheck() {
      if (isMounted) {
        await checkLicenseAndSecurity();
      }
    }
    runBootCheck();
    return () => {
      isMounted = false;
    };
  }, [checkLicenseAndSecurity]);

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
    if (screen === 'lock') {
      setCurrentUser(null);
      setCurrentScreen('pos');
      return;
    }

    if (screen === 'logout') {
      setCurrentUser(null);
      return;
    }

    if (screen === 'subscription' || screen === 'payment') {
      setShowPaymentModal(true);
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
        <p className="text-xs text-slate-400 font-medium">Connecting Terminal & Cloud License...</p>
      </div>
    );
  }

  // 2. Hardware mismatch security lockdown screen
  if (isHardwareValid === false) {
    return (
      <SecurityLockdown 
        onResetActivation={() => { 
          setIsHardwareValid(true); 
          setIsRegistered(false); 
        }} 
      />
    );
  }

  // 3. Unregistered device setup screen (7-Day Trial Registration or Existing Cloud Login)
  if (isRegistered === false) {
    return (
      <Registration 
        onRegistered={() => { 
          checkLicenseAndSecurity(); 
        }} 
        onNavigate={handleNavigate} 
      />
    );
  }

  // 4. Trial or Subscription Plan Expired -> Show Payment Screen
  if (licenseInfo?.isExpired === true || showPaymentModal) {
    return (
      <PaymentScreen
        licenseInfo={licenseInfo}
        onPaymentSuccess={() => {
          setShowPaymentModal(false);
          checkLicenseAndSecurity();
        }}
        onLogout={() => {
          setShowPaymentModal(false);
          setIsRegistered(false);
        }}
      />
    );
  }

  // 5. Explicit Staff Lockout -> Staff PIN unlock screen
  if (!currentUser) {
    return <PinPad onUnlock={handleUnlock} />;
  }

  // 6. Authenticated POS application views
  const activeScreen = currentUser.role === 'cashier' ? 'pos' : currentScreen;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <UpdateBanner updateStatus={updateStatus} downloadPercent={downloadPercent} />
      
      {/* Top Header Trial / Subscription Banner */}
      <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            {licenseInfo?.restaurantName || 'Dine360 POS'}
          </span>
          {licenseInfo?.restaurantId && (
            <span className="text-[11px] font-mono bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
              ID: {licenseInfo.restaurantId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {licenseInfo?.planStatus === 'trial' ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                ✨ 7-Day Free Trial ({licenseInfo.daysRemaining} {licenseInfo.daysRemaining === 1 ? 'day' : 'days'} left)
              </span>
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded text-[11px] uppercase cursor-pointer"
              >
                Upgrade Plan
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                👑 Active Subscription ({licenseInfo?.daysRemaining || 30} days left)
              </span>
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded text-[11px] cursor-pointer"
              >
                Extend
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1">
        {activeScreen === 'pos' && (
          <POS 
            onNavigate={handleNavigate} 
            currentUser={currentUser} 
            activeTicketId={activeTicketId}
            setActiveTicketId={setActiveTicketId}
          />
        )}
        {activeScreen === 'dashboard' && (
          <AdminDashboard onNavigate={handleNavigate} currentUser={currentUser} />
        )}
        {activeScreen === 'inventory' && (
          <InventoryManager onNavigate={handleNavigate} currentUser={currentUser} />
        )}
        {activeScreen === 'registration' && (
          <Registration 
            onRegistered={() => checkLicenseAndSecurity()} 
            onNavigate={handleNavigate} 
          />
        )}
      </div>
    </div>
  );
}