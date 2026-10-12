import { useState, useEffect } from 'react';

export default function SplitPaymentModal({
    isOpen,
    onClose,
    tableInfo,
    cartItems = [],
    subtotal = 0,
    cgst = 0,
    sgst = 0,
    grandTotal = 0,
    activeTicketId = null,
    captain = '',
    onConfirmSettle
}) {
    const totalDue = Math.round(grandTotal);

    const [cashAmount, setCashAmount] = useState('');
    const [upiAmount, setUpiAmount] = useState('');
    const [cardAmount, setCardAmount] = useState('');
    const [otherAmount, setOtherAmount] = useState('');
    const [tipAmount, setTipAmount] = useState('');
    const [selectedCaptain, setSelectedCaptain] = useState(captain || 'Captain Ramesh');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Default to full cash for fast one-click settlement
            setCashAmount(String(totalDue));
            setUpiAmount('');
            setCardAmount('');
            setOtherAmount('');
            setTipAmount('');
            setSelectedCaptain(captain || 'Captain Ramesh');
        }
    }, [isOpen, totalDue, captain]);

    if (!isOpen) return null;

    const cash = parseFloat(cashAmount) || 0;
    const upi = parseFloat(upiAmount) || 0;
    const card = parseFloat(cardAmount) || 0;
    const other = parseFloat(otherAmount) || 0;
    const tip = parseFloat(tipAmount) || 0;

    const totalTendered = cash + upi + card + other;
    const remainingBalance = Math.max(0, totalDue - totalTendered);
    const changeDue = Math.max(0, totalTendered - totalDue);

    const isFullyPaid = totalTendered >= totalDue;

    // Presets
    const handleSetFull = (type) => {
        setCashAmount(type === 'cash' ? String(totalDue) : '');
        setUpiAmount(type === 'upi' ? String(totalDue) : '');
        setCardAmount(type === 'card' ? String(totalDue) : '');
        setOtherAmount('');
    };

    const handleSplit5050 = (type1, type2) => {
        const half = Math.round(totalDue / 2);
        const otherHalf = totalDue - half;

        setCashAmount(type1 === 'cash' ? String(half) : (type2 === 'cash' ? String(otherHalf) : ''));
        setUpiAmount(type1 === 'upi' ? String(half) : (type2 === 'upi' ? String(otherHalf) : ''));
        setCardAmount(type1 === 'card' ? String(half) : (type2 === 'card' ? String(otherHalf) : ''));
        setOtherAmount('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isFullyPaid) {
            alert(`Payment incomplete! Remaining balance: ₹${remainingBalance.toFixed(2)}`);
            return;
        }

        setIsSubmitting(true);

        // Build human-readable multi-tender summary string
        const parts = [];
        if (cash > 0) parts.push(`Cash: ₹${cash.toFixed(2)}`);
        if (upi > 0) parts.push(`UPI: ₹${upi.toFixed(2)}`);
        if (card > 0) parts.push(`Card: ₹${card.toFixed(2)}`);
        if (other > 0) parts.push(`Other: ₹${other.toFixed(2)}`);
        const paymentSummary = parts.length > 1 ? `Split: ${parts.join(', ')}` : (parts[0] || 'Cash');

        const tenderDetails = {
            paymentSummary,
            cash,
            upi,
            card,
            other,
            tip,
            totalTendered,
            changeDue,
            captain: selectedCaptain
        };

        try {
            await onConfirmSettle(tenderDetails);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl">💳</span>
                            <h2 className="text-lg font-bold">Split Billing & Multi-Tender Settlement</h2>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                            Table: <strong className="text-amber-400 font-bold">{tableInfo?.num || tableInfo?.name || 'Selected'}</strong>
                            {activeTicketId ? ` • Ticket #${activeTicketId}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer text-lg"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    {/* Amount Banner */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center">
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Grand Total Due</span>
                            <div className="text-3xl font-black text-slate-900">₹{totalDue.toFixed(2)}</div>
                            <div className="text-xs text-slate-500">
                                Subtotal: ₹{subtotal.toFixed(2)} + GST: ₹{(cgst + sgst).toFixed(2)} ({cartItems.length} items)
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xs font-bold text-slate-500 block">Captain / Waiter</span>
                            <select
                                value={selectedCaptain}
                                onChange={(e) => setSelectedCaptain(e.target.value)}
                                className="mt-1 bg-white border border-slate-300 rounded-lg text-xs font-bold py-1.5 px-2.5 text-slate-800 focus:ring-2 focus:ring-orange-500"
                            >
                                <option value="Captain Ramesh">Captain Ramesh</option>
                                <option value="Captain Suresh">Captain Suresh</option>
                                <option value="Captain Priya">Captain Priya</option>
                                <option value="Captain Rajesh">Captain Rajesh</option>
                                <option value="Cashier">Cashier</option>
                            </select>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                            ⚡ Quick Split Presets
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                            <button
                                type="button"
                                onClick={() => handleSetFull('cash')}
                                className="py-2 px-1 text-center bg-white hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                                💵 100% Cash
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetFull('upi')}
                                className="py-2 px-1 text-center bg-white hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                                📱 100% UPI
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetFull('card')}
                                className="py-2 px-1 text-center bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                                💳 100% Card
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSplit5050('cash', 'upi')}
                                className="py-2 px-1 text-center bg-white hover:bg-amber-50 hover:border-amber-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                                ⚡ 50 Cash / 50 UPI
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSplit5050('card', 'upi')}
                                className="py-2 px-1 text-center bg-white hover:bg-amber-50 hover:border-amber-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                                ⚡ 50 Card / 50 UPI
                            </button>
                        </div>
                    </div>

                    {/* Multi-Tender Inputs */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                            Tender Breakdown
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-3 rounded-xl border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200 transition-all">
                                <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-1">
                                    <span>💵 Cash (₹)</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={cashAmount}
                                    onChange={(e) => setCashAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full text-lg font-black text-slate-900 bg-transparent outline-hidden"
                                />
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
                                <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 mb-1">
                                    <span>📱 UPI / QR (₹)</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={upiAmount}
                                    onChange={(e) => setUpiAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full text-lg font-black text-slate-900 bg-transparent outline-hidden"
                                />
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
                                <label className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-1">
                                    <span>💳 Credit / Debit Card (₹)</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={cardAmount}
                                    onChange={(e) => setCardAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full text-lg font-black text-slate-900 bg-transparent outline-hidden"
                                />
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-slate-200 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200 transition-all">
                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                                    <span>💼 Other / Voucher (₹)</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={otherAmount}
                                    onChange={(e) => setOtherAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full text-lg font-black text-slate-900 bg-transparent outline-hidden"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Calculation Summary Bar */}
                    <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Total Tendered:</span>
                            <span className="font-bold text-white text-sm">₹{totalTendered.toFixed(2)}</span>
                        </div>

                        {remainingBalance > 0 ? (
                            <div className="flex justify-between items-center bg-red-950/70 border border-red-800 p-2.5 rounded-lg">
                                <span className="text-xs font-bold text-red-300">Remaining Balance:</span>
                                <span className="text-base font-black text-red-400 animate-pulse">
                                    ₹{remainingBalance.toFixed(2)}
                                </span>
                            </div>
                        ) : (
                            <div className="flex justify-between items-center bg-emerald-950/70 border border-emerald-800 p-2.5 rounded-lg">
                                <span className="text-xs font-bold text-emerald-300">
                                    {changeDue > 0 ? 'Change Due to Customer:' : 'Payment Status:'}
                                </span>
                                <span className="text-base font-black text-emerald-400">
                                    {changeDue > 0 ? `₹${changeDue.toFixed(2)}` : '✓ Exact Paid in Full'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="py-3 px-4 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                    >
                        Cancel (Esc)
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isFullyPaid || isSubmitting}
                        className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {isSubmitting ? (
                            <span>⏳ Settling & Printing Receipt...</span>
                        ) : (
                            <span>✓ Confirm Settle & Print Receipt</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
