import { useState } from 'react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function Registration({ onRegistered, onNavigate }) {
    const [mode, setMode] = useState('register'); // 'register' | 'login'
    
    // Register Form State
    const [restaurantName, setRestaurantName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [branch, setBranch] = useState('Main Branch');
    const [location, setLocation] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Login Form State
    const [loginIdentifier, setLoginIdentifier] = useState(''); // Restaurant ID or Phone
    const [loginPassword, setLoginPassword] = useState('');

    // UI Status
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successData, setSuccessData] = useState(null);

    const handleRegister = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!restaurantName.trim()) return setErrorMsg('Restaurant name is required.');
        if (!ownerName.trim()) return setErrorMsg('Owner name is required.');
        if (!phone.trim() || phone.length < 10) return setErrorMsg('Please enter a valid 10-digit phone number.');
        if (!location.trim()) return setErrorMsg('Location / City is required.');
        if (!password || password.length < 4) return setErrorMsg('Password must be at least 4 characters.');
        if (password !== confirmPassword) return setErrorMsg('Passwords do not match.');

        setIsLoading(true);

        const payload = {
            restaurant_name: restaurantName.trim(),
            owner_name: ownerName.trim(),
            phone: phone.trim(),
            branch: branch.trim() || 'Main Branch',
            location: location.trim(),
            password: password
        };

        try {
            let result = null;
            if (ipcRenderer && ipcRenderer.invoke) {
                result = await ipcRenderer.invoke('register-restaurant', payload);
            } else if (window.electronAPI && window.electronAPI.registerRestaurant) {
                result = await window.electronAPI.registerRestaurant(payload);
            } else {
                // Direct Browser / Web Client registration with Supabase sync
                const randId = `D360-${(location || 'IND').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'POS')}-${Math.floor(1000 + Math.random() * 9000)}`;
                const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                
                // Save locally
                localStorage.setItem('dine360_is_registered', 'true');
                localStorage.setItem('dine360_restaurant_id', randId);
                localStorage.setItem('dine360_restaurant_name', restaurantName);
                localStorage.setItem('dine360_owner_name', ownerName);
                localStorage.setItem('dine360_phone', phone);
                localStorage.setItem('dine360_branch', branch);
                localStorage.setItem('dine360_location', location);
                localStorage.setItem('dine360_plan_expiry_date', trialEnd);
                localStorage.setItem('dine360_plan_status', 'trial');

                // Sync directly to Supabase cloud
                try {
                    const { supabase } = await import('./lib/supabase.js');
                    await supabase.from('restaurants').upsert({
                        restaurant_id: randId,
                        name: restaurantName,
                        phone: phone,
                        owner_name: ownerName,
                        branch: branch || 'Main Branch',
                        location: location,
                        password_hash: password,
                        plan_status: 'trial',
                        plan_validity_days: 7,
                        trial_start_date: new Date().toISOString(),
                        trial_end_date: trialEnd,
                        plan_expiry_date: trialEnd,
                        is_active: true
                    });
                    console.log('[Supabase] Browser registration synced to cloud:', randId);
                } catch (sbErr) {
                    console.warn('[Supabase] Browser cloud sync error:', sbErr);
                }

                result = {
                    success: true,
                    restaurant_id: randId,
                    restaurant_name: restaurantName,
                    plan_validity_days: 7,
                    days_remaining: 7
                };
            }

            if (result && result.success) {
                setSuccessData(result);
            } else {
                setErrorMsg(result?.error || 'Registration failed. Please try again.');
            }
        } catch (err) {
            console.error('Registration Error:', err);
            setErrorMsg('System error during registration. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!loginIdentifier.trim()) return setErrorMsg('Please enter your Restaurant ID or Phone number.');
        if (!loginPassword) return setErrorMsg('Please enter your password.');

        setIsLoading(true);

        const isPhone = /^\d+$/.test(loginIdentifier.trim());
        const payload = {
            restaurant_id: isPhone ? '' : loginIdentifier.trim(),
            phone: isPhone ? loginIdentifier.trim() : '',
            password: loginPassword
        };

        try {
            let result = null;
            if (ipcRenderer && ipcRenderer.invoke) {
                result = await ipcRenderer.invoke('login-restaurant', payload);
            } else if (window.electronAPI && window.electronAPI.loginRestaurant) {
                result = await window.electronAPI.loginRestaurant(payload);
            } else {
                // Browser dev fallback
                localStorage.setItem('dine360_is_registered', 'true');
                result = { success: true, restaurant_id: loginIdentifier };
            }

            if (result && result.success) {
                if (onRegistered) {
                    onRegistered();
                } else if (onNavigate) {
                    onNavigate('pos');
                }
            } else {
                setErrorMsg(result?.error || 'Invalid credentials. Please verify your Restaurant ID and Password.');
            }
        } catch (err) {
            console.error('Login Error:', err);
            setErrorMsg('System error during login.');
        } finally {
            setIsLoading(false);
        }
    };

    // Registration Success / Generated ID Modal Screen
    if (successData) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-slate-950 to-slate-950 pointer-events-none" />
                
                <div className="relative z-10 w-full max-w-lg bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-5">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h2 className="text-2xl font-extrabold text-white mb-1">Registration Complete!</h2>
                    <p className="text-sm text-slate-400 mb-6">Your 7-Day Free Trial has been activated successfully.</p>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 mb-6 text-left space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Restaurant ID</span>
                            <span className="text-sm font-mono font-bold text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-500/30">
                                {successData.restaurant_id}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Restaurant Name</span>
                            <span className="text-sm font-semibold text-slate-200">{successData.restaurant_name}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trial Period</span>
                            <span className="text-sm font-bold text-emerald-400">7 Days Full Access</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Auto-Login</span>
                            <span className="text-xs font-semibold text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800">
                                Enabled on this Device
                            </span>
                        </div>
                    </div>

                    <div className="p-3 bg-amber-950/40 border border-amber-500/20 rounded-xl mb-6 text-xs text-amber-300/90 text-left flex items-start gap-2.5">
                        <span className="text-base">💡</span>
                        <span>Please note down your <strong>Restaurant ID</strong> ({successData.restaurant_id}). You can use it to log in on other terminals or the Owner Mobile App.</span>
                    </div>

                    <button
                        onClick={() => {
                            if (onRegistered) {
                                onRegistered();
                            } else if (onNavigate) {
                                onNavigate('pos');
                            }
                        }}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-extrabold rounded-xl text-base transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                    >
                        <span>Start POS Terminal →</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans relative overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 w-full max-w-4xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden my-6">
                
                {/* Header Branding */}
                <div className="px-8 pt-8 pb-6 border-b border-slate-800/80 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <span className="text-2xl font-black text-slate-950">D</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                                Dine360 POS
                                <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                    v1.0
                                </span>
                            </h1>
                            <p className="text-xs text-slate-400">Next-Gen Restaurant POS & Cloud Intelligence</p>
                        </div>
                    </div>

                    {/* Mode Toggle Tabs */}
                    <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 self-start md:self-auto">
                        <button
                            type="button"
                            onClick={() => { setMode('register'); setErrorMsg(''); }}
                            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mode === 'register' 
                                    ? 'bg-amber-500 text-slate-950 shadow-md' 
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            ✨ New Restaurant (7-Day Trial)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setErrorMsg(''); }}
                            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mode === 'login' 
                                    ? 'bg-amber-500 text-slate-950 shadow-md' 
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            🔐 Existing Login
                        </button>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12">
                    
                    {/* Left Features Showcase */}
                    <div className="lg:col-span-4 p-8 bg-slate-950/60 border-r border-slate-800/60 flex flex-col justify-between space-y-6">
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 border border-emerald-800/80 rounded-full text-emerald-400 text-xs font-bold mb-4">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                7-Day Free Trial Included
                            </div>
                            <h2 className="text-lg font-bold text-white mb-2">Get Started in Seconds</h2>
                            <p className="text-xs text-slate-400 leading-relaxed mb-6">
                                Experience ultra-fast billing, kitchen order tickets (KOT), real-time inventory management, and cloud sync.
                            </p>

                            <div className="space-y-3.5">
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0 text-amber-400 text-xs">
                                        ⚡
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-200">Zero Setup Delay</h3>
                                        <p className="text-[11px] text-slate-400">Instant registration with auto-generated Restaurant ID.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0 text-amber-400 text-xs">
                                        🔄
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-200">Direct Auto-Login</h3>
                                        <p className="text-[11px] text-slate-400">Login once — subsequent app boots open directly into POS.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0 text-amber-400 text-xs">
                                        ☁️
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-200">Cloud & Mobile Ready</h3>
                                        <p className="text-[11px] text-slate-400">PostgreSQL / Supabase architecture for Owner Mobile Dashboard.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                            🔒 <strong>Hardware Binding Protection</strong> ensures database isolation and seamless offline continuity.
                        </div>
                    </div>

                    {/* Right Form Area */}
                    <div className="lg:col-span-8 p-8">
                        {errorMsg && (
                            <div className="mb-6 p-3.5 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-300 flex items-center gap-2 animate-fade-in">
                                <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {mode === 'register' ? (
                            <form onSubmit={handleRegister} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Restaurant Name <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={restaurantName}
                                            onChange={(e) => setRestaurantName(e.target.value)}
                                            placeholder="e.g. Royal Spice"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Owner Name <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={ownerName}
                                            onChange={(e) => setOwnerName(e.target.value)}
                                            placeholder="e.g. Ramesh Kumar"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Phone Number <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="e.g. 9876543210"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Branch / Outlet Name
                                        </label>
                                        <input
                                            type="text"
                                            value={branch}
                                            onChange={(e) => setBranch(e.target.value)}
                                            placeholder="e.g. Jubilee Hills or Main Branch"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Location / City / Address <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            placeholder="e.g. Road No 36, Jubilee Hills, Hyderabad"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Create Password <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                            Confirm Password <span className="text-rose-400">*</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                                    >
                                        {isLoading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                                <span>Creating Workspace & Activating 7-Day Trial...</span>
                                            </>
                                        ) : (
                                            <span>Register & Start 7-Day Free Trial →</span>
                                        )}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleLogin} className="space-y-5 max-w-md mx-auto py-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Restaurant ID or Phone Number
                                    </label>
                                    <input
                                        type="text"
                                        value={loginIdentifier}
                                        onChange={(e) => setLoginIdentifier(e.target.value)}
                                        placeholder="e.g. D360-HYD-8421 or 9876543210"
                                        className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                        required
                                    />
                                </div>

                                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
                                    💡 Logging in binds this terminal to your cloud account and enables <strong>Persistent Auto-Login</strong>.
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                            <span>Authenticating Terminal...</span>
                                        </>
                                    ) : (
                                        <span>Sign In & Open POS →</span>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}