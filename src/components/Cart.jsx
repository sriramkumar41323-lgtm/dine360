import { useState } from 'react';
import { getNextDailyTicket } from '../utils/ticketSequence';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function Cart({
    cart = [],
    orderType = 'Dine-In',
    setOrderType,
    selectedTable,
    setSelectedTable,
    tables = [],
    updateQty,
    accentText = 'text-orange-500',
    onPayAndPrint,
    onHoldAndPrintSuccess,
    selectedPrinter = '',
    activeTicketId = null,
    captain = 'Captain Ramesh',
    setCaptain,
    isTableLocked = false,
    onPrintBill,
    onOpenSplitModal,
    onUnlockTable,
    onBrowseMenu
}) {
    const [isProcessingHold, setIsProcessingHold] = useState(false);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const cgst = subtotal * 0.025;
    const sgst = subtotal * 0.025;
    const grandTotal = subtotal + cgst + sgst;

    const currentTableObj = tables.find(t => t.id === selectedTable);
    const tableNumber = currentTableObj ? (currentTableObj.num || String(currentTableObj.id)) : (selectedTable ? `T-${selectedTable}` : (orderType || 'Takeaway'));
    const tableSection = currentTableObj?.section || (orderType === 'Takeaway' ? 'Takeaway Counter' : 'Main Dining');

    const unprintedItemsCount = cart.filter(i => !i.kot_printed || i.kot_printed === 0).length;
    const hasExistingKOT = cart.some(i => i.kot_printed === 1 || i.kot_printed === true);
    const kotSequence = hasExistingKOT ? 2 : 1;

    // Action button states mapping cashier workflow
    const hasItems = cart.length > 0;
    const hasUnsentItems = hasItems && unprintedItemsCount > 0;
    const allKotSent = hasItems && unprintedItemsCount === 0;
    const isBillPrinted = Boolean(isTableLocked);

    // Primary next-step conditional triggers (Available for both Dine-In and Takeaway)
    const isKotPrimary = Boolean((selectedTable || orderType === 'Takeaway' || orderType === 'Delivery') && hasUnsentItems && !isBillPrinted);
    const isPrintPrimary = Boolean(selectedTable && allKotSent && !isBillPrinted);
    const isSettlePrimary = Boolean(selectedTable && hasItems && isBillPrinted);

    // Send to Kitchen (Hold & Print KOT)
    const handleHoldAndPrintKOT = async () => {
        if (!cart || cart.length === 0) {
            alert("Cart is empty! Cannot send to kitchen.");
            return;
        }

        if (isTableLocked) {
            alert("Table is currently locked because the bill was already printed. Please unlock the table to add more items.");
            return;
        }

        setIsProcessingHold(true);

        const cartData = {
            orderType: orderType || 'Dine-In',
            order_type: orderType || 'Dine-In',
            tableNumber: tableNumber,
            table_number: tableNumber,
            selectedTable,
            subtotal,
            tax: cgst + sgst,
            grandTotal,
            grand_total: grandTotal,
            paymentMethod: 'Hold',
            payment_method: 'Hold',
            cartItems: cart,
            items: cart,
            status: 'open',
            totalPaid: 0,
            total_paid: 0,
            activeTicketId,
            captain: captain || 'Captain Ramesh',
            kotNumber: kotSequence
        };

        try {
            let holdRes;
            if (activeTicketId) {
                // Update existing open ticket
                if (ipcRenderer && ipcRenderer.invoke) {
                    holdRes = await ipcRenderer.invoke('update-open-ticket', activeTicketId, cartData);
                } else if (window.electronAPI && window.electronAPI.updateOpenTicket) {
                    holdRes = await window.electronAPI.updateOpenTicket(activeTicketId, cartData);
                } else {
                    console.log('Web fallback update-open-ticket:', activeTicketId, cartData);
                    holdRes = { success: true, ticketId: activeTicketId };
                }
            } else {
                // Insert new held ticket
                if (ipcRenderer && ipcRenderer.invoke) {
                    holdRes = await ipcRenderer.invoke('hold-ticket', cartData);
                } else if (window.electronAPI && window.electronAPI.holdTicket) {
                    holdRes = await window.electronAPI.holdTicket(cartData);
                } else {
                    console.log('Web fallback hold-ticket:', cartData);
                    const next = getNextDailyTicket();
                    holdRes = { success: true, ticketId: next.dbTicketId, dailySeq: next.dailySeq };
                }
            }

            if (!holdRes || !holdRes.success) {
                alert(`Failed to hold/update ticket: ${holdRes?.error || 'Database error'}`);
                setIsProcessingHold(false);
                return;
            }

            const effectiveTicketId = holdRes.ticketId || activeTicketId;

            // Print KOT - with station routing and captain info
            const printPayload = {
                ...cartData,
                ticketId: effectiveTicketId,
                activeTicketId: effectiveTicketId,
                captain: captain || 'Captain Ramesh',
                kotNumber: kotSequence
            };

            let printKotRes;
            if (ipcRenderer && ipcRenderer.invoke) {
                printKotRes = await ipcRenderer.invoke('print-kot', printPayload, selectedPrinter || undefined);
            } else if (window.electronAPI && window.electronAPI.printKot) {
                printKotRes = await window.electronAPI.printKot(printPayload, selectedPrinter || undefined);
            } else {
                console.log('Web fallback print-kot:', printPayload);
                printKotRes = { success: true, message: 'KOT printed (Web simulation)' };
            }

            if (onHoldAndPrintSuccess) {
                onHoldAndPrintSuccess(cartData, effectiveTicketId, printKotRes);
            }
        } catch (err) {
            console.error('Error during Hold & Print KOT workflow:', err);
            alert(`Error: ${err.message || 'Workflow error'}`);
        } finally {
            setIsProcessingHold(false);
        }
    };

    return (
        <div className="w-[30%] min-w-[320px] h-full bg-white flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-20">
            {/* Cart Header */}
            <div className="p-4 border-b border-gray-200 space-y-3">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {["Dine-In", "Takeaway", "Delivery"].map(type => (
                        <button
                            key={type}
                            onClick={() => {
                                if (setOrderType) setOrderType(type);
                                if (type !== 'Dine-In' && onBrowseMenu) onBrowseMenu();
                            }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${orderType === type ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                {/* Locked Table Header (No dropdown) */}
                {orderType === 'Dine-In' && (
                    <div className="space-y-2">
                        {selectedTable ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                                        Selected Table
                                    </span>
                                    <h3 className="text-base font-black text-gray-900 leading-tight">
                                        Table {tableNumber.replace(/^Table\s+/i, '')} ({tableSection})
                                    </h3>
                                </div>
                                {activeTicketId ? (
                                    <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                                        Ticket #{activeTicketId}
                                    </span>
                                ) : (
                                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                                        🟢 New Order
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-xs font-bold text-center">
                                ⚠️ No Table Selected
                            </div>
                        )}

                        {/* Waiter / Captain Selector */}
                        {selectedTable && (
                            <div className="flex items-center justify-between text-xs pt-0.5 px-1">
                                <span className="font-bold text-gray-500">Captain:</span>
                                <select
                                    value={captain}
                                    onChange={(e) => setCaptain && setCaptain(e.target.value)}
                                    className="bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold py-1 px-2 text-gray-800 focus:ring-1 focus:ring-orange-500"
                                >
                                    <option value="Captain Ramesh">Captain Ramesh</option>
                                    <option value="Captain Suresh">Captain Suresh</option>
                                    <option value="Captain Priya">Captain Priya</option>
                                    <option value="Captain Rajesh">Captain Rajesh</option>
                                    <option value="Cashier / Self">Cashier / Self</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Table Locked Banner if Bill Printed */}
            {isTableLocked && (
                <div className="bg-blue-50 border-y border-blue-200 px-4 py-2.5 flex items-center justify-between text-xs text-blue-900 animate-fade-in">
                    <div className="flex items-center gap-1.5 font-bold">
                        <span>🔒</span>
                        <span>Bill Printed • Table Locked</span>
                    </div>
                    <button
                        type="button"
                        onClick={onUnlockTable}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
                    >
                        Unlock
                    </button>
                </div>
            )}

            {/* Cart Body / Items Area */}
            <div className="flex-1 overflow-auto p-4">
                {/* 1. Dine-In Empty State: No Table Selected */}
                {orderType === 'Dine-In' && !selectedTable ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
                        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-3xl mb-3 shadow-2xs">
                            🍽️
                        </div>
                        <h4 className="text-sm font-bold text-gray-900 mb-1">Select a Table</h4>
                        <p className="text-xs text-gray-500 font-medium max-w-[210px] leading-relaxed">
                            Please select a table from the left to start ordering.
                        </p>
                    </div>
                ) : cart.length === 0 ? (
                    /* 2. Table Selected but Cart has no items yet */
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 font-medium gap-2 p-6 text-center select-none">
                        <span className="text-3xl">🛒</span>
                        <span className="text-sm font-bold text-gray-700">Cart is empty</span>
                        <span className="text-xs text-gray-400">Click items from menu to add</span>
                    </div>
                ) : (
                    /* 3. Cart Items List */
                    <div className="space-y-2.5">
                        {cart.map((item, index) => {
                            const isSent = Boolean(item.kot_printed === 1 || item.kot_printed === true);
                            return (
                                <div
                                    key={item.cartKey || item.ticket_item_id || `${item.id}-${item.kot_printed}-${index}`}
                                    className={`flex justify-between items-center p-2.5 rounded-xl border transition-all ${isSent
                                        ? 'bg-emerald-50/40 border-emerald-200 text-gray-800'
                                        : 'bg-amber-50/50 border-amber-300 shadow-2xs text-gray-900'
                                    }`}
                                >
                                    <div className="flex-1 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                            <h4 className="text-sm font-bold leading-tight">{item.name}</h4>
                                            {isSent ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    ✓ Sent (KOT)
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                                    ⏳ New KOT
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-medium">₹{item.price}</p>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex items-center bg-white rounded-lg p-0.5 border border-gray-200 shadow-2xs">
                                            <button
                                                type="button"
                                                disabled={isTableLocked}
                                                onClick={() => updateQty && updateQty(item, -1, index)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-md text-gray-900 font-bold hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                -
                                            </button>
                                            <span className="w-7 text-center text-sm font-bold text-gray-900">{item.qty}</span>
                                            <button
                                                type="button"
                                                disabled={isTableLocked}
                                                onClick={() => updateQty && updateQty(item, 1, index)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-md text-gray-900 font-bold hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div className="w-16 text-right font-black text-gray-900 text-sm">
                                            ₹{(item.price * item.qty).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Billing Summary & Action Buttons */}
            <div className="bg-gray-50 p-5 border-t border-gray-200 space-y-3">
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span className="font-semibold text-gray-900">₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span>CGST (2.5%)</span>
                        <span className="font-semibold text-gray-900">₹{cgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span>SGST (2.5%)</span>
                        <span className="font-semibold text-gray-900">₹{sgst.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-lg font-black text-gray-900">
                        <span>Grand Total</span>
                        <span className="text-orange-600">₹{grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                {/* Conditional Action Buttons with Strict Visual Hierarchy */}
                {orderType === 'Dine-In' ? (
                    <div className="space-y-2 pt-1">
                        {/* 1. Send to Kitchen (KOT): Highlighted Bright Orange if items unsent */}
                        <button
                            type="button"
                            onClick={handleHoldAndPrintKOT}
                            disabled={!isKotPrimary || isProcessingHold}
                            className={`w-full py-3 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                isKotPrimary
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md ring-2 ring-orange-300 cursor-pointer animate-pulse-subtle'
                                    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                            }`}
                            title={isKotPrimary ? 'Send new items to Kitchen (KOT)' : 'No unsent items in cart'}
                        >
                            {isProcessingHold ? (
                                <span>⏳ Routing to Kitchen & Bar...</span>
                            ) : (
                                <span>📝 Send to Kitchen (KOT {unprintedItemsCount > 0 ? `+${unprintedItemsCount}` : ''})</span>
                            )}
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                            {/* 2. Print Bill: Highlighted if KOT is sent & bill not yet printed */}
                            <button
                                type="button"
                                onClick={onPrintBill}
                                disabled={!isPrintPrimary}
                                className={`py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                    isPrintPrimary
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md ring-2 ring-blue-300 font-black cursor-pointer'
                                        : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                                }`}
                                title={isPrintPrimary ? 'Print bill check for customer' : 'Send KOT first before printing bill'}
                            >
                                🧾 Print Bill
                            </button>

                            {/* 3. Settle: Highlighted Bright Green if Bill is printed */}
                            <button
                                type="button"
                                onClick={onOpenSplitModal}
                                disabled={!isSettlePrimary}
                                className={`py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                    isSettlePrimary
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300 font-black cursor-pointer'
                                        : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                                }`}
                                title={isSettlePrimary ? 'Settle payment' : 'Print bill before settling'}
                            >
                                💳 Settle
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Takeaway / Quick Order */
                    <div className="space-y-2 pt-1">
                        {/* 1. Takeaway KOT: Send to Kitchen */}
                        <button
                            type="button"
                            onClick={handleHoldAndPrintKOT}
                            disabled={!isKotPrimary || isProcessingHold}
                            className={`w-full py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                isKotPrimary
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md ring-2 ring-orange-300 cursor-pointer animate-pulse-subtle'
                                    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                            }`}
                            title={isKotPrimary ? 'Send Takeaway items to Kitchen (KOT)' : 'No new items to send to Kitchen'}
                        >
                            {isProcessingHold ? (
                                <span>⏳ Routing Takeaway to Kitchen...</span>
                            ) : (
                                <span>📝 Send Takeaway to Kitchen (KOT {unprintedItemsCount > 0 ? `+${unprintedItemsCount}` : ''})</span>
                            )}
                        </button>

                        {/* 2. Takeaway Settle */}
                        <button
                            type="button"
                            onClick={onOpenSplitModal}
                            disabled={cart.length === 0}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            💳 Pay & Settle Order
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
