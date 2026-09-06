import { useState } from 'react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function PaymentScreen({ licenseInfo, onPaymentSuccess, onLogout }) {
    const [selectedPlan, setSelectedPlan] = useState('monthly'); // 'monthly' | 'annual'
    const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'netbanking'
    const [isProcessing, setIsProcessing] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [discount, setDiscount] = useState(0);
    const [couponApplied, setCouponApplied] = useState(false);
    const [couponError, setCouponError] = useState('');

    const plans = {
        monthly: {
            id: 'monthly',
            name: 'Starter Monthly Plan',
            price: 999,
            validityDays: 30,
            description: 'Full POS features, live inventory sync, and KOT printing for 30 days.'
        },
        annual: {
            id: 'annual',
            name: 'Growth Annual Plan (Best Value)',
            price: 9999,
            validityDays: 365,
            badge: '🔥 2 Months Free',
            description: '365 days full access, Owner Mobile App access, priority cloud backup & support.'
        }
    };

    const currentPlan = plans[selectedPlan];
    const basePrice = currentPlan.price;
    const finalAmount = Math.max(0, basePrice - discount);

    const handleApplyCoupon = (e) => {
        e.preventDefault();
        setCouponError('');
        if (!couponCode.trim()) return;

        const code = couponCode.trim().toUpperCase();
        if (code === 'DINE500' || code === 'LAUNCH500') {
            setDiscount(500);
            setCouponApplied(true);
        } else if (code === 'SAVE10') {
            setDiscount(Math.round(basePrice * 0.10));
            setCouponApplied(true);
        } else {
            setCouponError('Invalid promo code.');
            setCouponApplied(false);
        }
    };

    const handleCompletePayment = async () => {
        setIsProcessing(true);

        const paymentPayload = {
            plan_name: currentPlan.name,
            amount: finalAmount,
            payment_method: paymentMethod.toUpperCase(),
            validity_days: currentPlan.validityDays,
            transaction_id: `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
        };

        try {
            let result = null;
            if (ipcRenderer && ipcRenderer.invoke) {
                result = await ipcRenderer.invoke('process-payment', paymentPayload);
            } else if (window.electronAPI && window.electronAPI.processPayment) {
                result = await window.electronAPI.processPayment(paymentPayload);
            } else {
                // Browser dev fallback
                const newExpiry = new Date(Date.now() + currentPlan.validityDays * 24 * 60 * 60 * 1000).toISOString();
                localStorage.setItem('dine360_plan_expiry_date', newExpiry);
                localStorage.setItem('dine360_plan_status', 'active');
                result = {
                    success: true,
                    days_remaining: currentPlan.validityDays,
                    plan_status: 'active'
                };
            }

            if (result && result.success) {
                if (onPaymentSuccess) {
                    onPaymentSuccess(result);
                }
            } else {
                alert('Payment processing failed. Please try again.');
            }
        } catch (err) {
            console.error('Payment Error:', err);
            alert('System error during payment execution.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans relative overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
            {/* Background Glows */}
            <div className="absolute top-10 left-1/3 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 w-full max-w-4xl bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden my-6">
                
                {/* Top Alert Banner */}
                <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-3 text-slate-950 flex items-center justify-between font-bold text-xs uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                        <span className="text-base">⏳</span>
                        <span>7-Day Free Trial Ended • Please Choose a Plan to Continue</span>
                    </div>
                    {licenseInfo?.restaurantId && (
                        <div className="bg-slate-950/20 px-2.5 py-1 rounded text-slate-950 font-mono text-[11px]">
                            ID: {licenseInfo.restaurantId}
                        </div>
                    )}
                </div>

                {/* Main Content */}
                <div className="p-8">
                    
                    {/* Header */}
                    <div className="text-center max-w-xl mx-auto mb-8">
                        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
                            Select a Subscription Plan
                        </h1>
                        <p className="text-xs text-slate-400">
                            Keep your billing, inventory sync, and kitchen operations running uninterrupted with our reliable enterprise cloud infrastructure.
                        </p>
                    </div>

                    {/* Plan Options Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                        
                        {/* Monthly Plan Card */}
                        <div
                            onClick={() => setSelectedPlan('monthly')}
                            className={`p-6 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                                selectedPlan === 'monthly'
                                    ? 'bg-slate-800/90 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h2 className="text-base font-bold text-white">{plans.monthly.name}</h2>
                                    <input
                                        type="radio"
                                        name="plan"
                                        checked={selectedPlan === 'monthly'}
                                        onChange={() => setSelectedPlan('monthly')}
                                        className="w-4 h-4 accent-amber-500"
                                    />
                                </div>
                                <div className="mb-4">
                                    <span className="text-3xl font-black text-white">₹999</span>
                                    <span className="text-xs text-slate-400 font-medium"> / month</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">{plans.monthly.description}</p>
                            </div>
                            <div className="pt-3 border-t border-slate-800 text-[11px] text-amber-400 font-semibold flex items-center gap-1.5">
                                <span>✓</span> 30 Days Plan Validity Extension
                            </div>
                        </div>

                        {/* Annual Plan Card */}
                        <div
                            onClick={() => setSelectedPlan('annual')}
                            className={`p-6 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                                selectedPlan === 'annual'
                                    ? 'bg-slate-800/90 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div className="absolute -top-3 right-6 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full shadow-md">
                                Best Value • 2 Months Free
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h2 className="text-base font-bold text-white">{plans.annual.name}</h2>
                                    <input
                                        type="radio"
                                        name="plan"
                                        checked={selectedPlan === 'annual'}
                                        onChange={() => setSelectedPlan('annual')}
                                        className="w-4 h-4 accent-amber-500"
                                    />
                                </div>
                                <div className="mb-4">
                                    <span className="text-3xl font-black text-amber-400">₹9,999</span>
                                    <span className="text-xs text-slate-400 font-medium"> / year (Save ₹1,989)</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">{plans.annual.description}</p>
                            </div>
                            <div className="pt-3 border-t border-slate-800 text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
                                <span>✓</span> 365 Days Plan Validity + Owner Mobile Sync
                            </div>
                        </div>
                    </div>

                    {/* Payment Execution Section */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        
                        {/* Left: Simulated QR Code & Payment Method */}
                        <div className="md:col-span-6 flex flex-col items-center justify-center p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center">
                            <div className="flex gap-2 mb-3 bg-slate-950 p-1 rounded-lg border border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('upi')}
                                    className={`px-3 py-1 text-xs font-bold rounded ${paymentMethod === 'upi' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
                                >
                                    UPI / QR
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('card')}
                                    className={`px-3 py-1 text-xs font-bold rounded ${paymentMethod === 'card' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
                                >
                                    Card
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('netbanking')}
                                    className={`px-3 py-1 text-xs font-bold rounded ${paymentMethod === 'netbanking' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
                                >
                                    Net Banking
                                </button>
                            </div>

                            {paymentMethod === 'upi' && (
                                <div className="p-3 bg-white rounded-xl shadow-md inline-block mb-3">
                                    {/* Mock SVG QR Code */}
                                    <svg className="w-36 h-36" viewBox="0 0 100 100" fill="currentColor">
                                        <path d="M0 0h30v30H0zM10 10h10v10H10zM70 0h30v30H70zM80 10h10v10H80zM0 70h30v30H0zM10 80h10v10H10zM40 10h10v10H40zM50 20h10v10H50zM40 30h10v10H40zM10 40h10v10H10zM30 40h10v10H30zM50 40h10v10H50zM70 40h10v10H70zM90 40h10v10H90zM40 50h10v10H40zM60 50h10v10H60zM80 50h10v10H80zM40 70h10v10H40zM50 80h10v10H50zM70 70h10v10H70zM90 70h10v10H90zM70 90h10v10H70zM80 80h10v10H80zM90 90h10v10H90z" />
                                    </svg>
                                </div>
                            )}

                            {paymentMethod === 'card' && (
                                <div className="w-full space-y-2 p-2">
                                    <input type="text" placeholder="Card Number (XXXX XXXX XXXX XXXX)" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" placeholder="MM/YY" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" />
                                        <input type="password" placeholder="CVV" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" />
                                    </div>
                                </div>
                            )}

                            {paymentMethod === 'netbanking' && (
                                <div className="w-full p-2 space-y-2">
                                    <select className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300">
                                        <option>HDFC Bank</option>
                                        <option>ICICI Bank</option>
                                        <option>State Bank of India (SBI)</option>
                                        <option>Axis Bank</option>
                                    </select>
                                </div>
                            )}

                            <p className="text-[11px] text-slate-400">
                                Scan with GPay / PhonePe / Paytm or pay via UPI ID: <span className="text-slate-200 font-mono">dine360@icici</span>
                            </p>
                        </div>

                        {/* Right: Bill Summary & Checkout Button */}
                        <div className="md:col-span-6 flex flex-col justify-between space-y-4">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Order Summary</h3>
                                <div className="space-y-1.5 text-xs text-slate-300">
                                    <div className="flex justify-between">
                                        <span>{currentPlan.name}</span>
                                        <span className="font-semibold text-white">₹{basePrice}</span>
                                    </div>
                                    {discount > 0 && (
                                        <div className="flex justify-between text-emerald-400">
                                            <span>Promo Discount</span>
                                            <span>- ₹{discount}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-2 border-t border-slate-800 font-bold text-sm text-amber-400">
                                        <span>Total Payable</span>
                                        <span>₹{finalAmount}</span>
                                    </div>
                                </div>

                                {/* Promo Code Input */}
                                <form onSubmit={handleApplyCoupon} className="mt-4 flex gap-2">
                                    <input
                                        type="text"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        placeholder="Promo Code (e.g. DINE500)"
                                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono uppercase"
                                    />
                                    <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold"
                                    >
                                        Apply
                                    </button>
                                </form>
                                {couponApplied && <p className="text-[11px] text-emerald-400 mt-1">✓ Promo coupon applied successfully!</p>}
                                {couponError && <p className="text-[11px] text-rose-400 mt-1">{couponError}</p>}
                            </div>

                            <button
                                type="button"
                                onClick={handleCompletePayment}
                                disabled={isProcessing}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                        <span>Confirming Payment & Extending License...</span>
                                    </>
                                ) : (
                                    <span>Complete Payment (₹{finalAmount}) & Unlock POS →</span>
                                )}
                            </button>

                            {onLogout && (
                                <button
                                    type="button"
                                    onClick={onLogout}
                                    className="w-full text-center text-xs text-slate-500 hover:text-slate-400 font-medium hover:underline"
                                >
                                    Switch Account / Log Out
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
