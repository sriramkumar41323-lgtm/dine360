import { useState } from 'react';

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
    activeTicketId = null
}) {
    const [isProcessingHold, setIsProcessingHold] = useState(false);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const cgst = subtotal * 0.025;
    const sgst = subtotal * 0.025;
    const grandTotal = subtotal + cgst + sgst;

    const currentTableObj = tables.find(t => t.id === selectedTable);
    const tableNumber = currentTableObj ? (currentTableObj.num || String(currentTableObj.id)) : String(selectedTable || '01');

    const handleHoldAndPrintKOT = async () => {
        if (!cart || cart.length === 0) {
            alert("Cart is empty! Cannot hold order.");
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
            activeTicketId
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
                    holdRes = { success: true, ticketId: null };
                }
            }

            if (!holdRes || !holdRes.success) {
                alert(`Failed to hold/update ticket: ${holdRes?.error || 'Database error'}`);
                setIsProcessingHold(false);
                return;
            }

            const effectiveTicketId = holdRes.ticketId || activeTicketId;

            // Print KOT - passes full cart array to backend
            const printPayload = {
                ...cartData,
                ticketId: effectiveTicketId,
                activeTicketId: effectiveTicketId
            };

            let printKotRes;
            if (ipcRenderer && ipcRenderer.invoke) {
                printKotRes = await ipcRenderer.invoke('print-kot', printPayload, selectedPrinter || undefined);
            } else if (window.electronAPI && window.electronAPI.printKot) {
                printKotRes = await window.electronAPI.printKot(printPayload, selectedPrinter || undefined);
            } else {
                console.log('Web fallback print-kot:', printPayload);
                printKotRes = { success: true };
            }

            if (printKotRes && printKotRes.message === 'No new items to print to kitchen') {
                alert('No new items to print to kitchen.');
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
        <div className="w-[30%] h-full bg-white flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-20">
            {/* Cart Header */}
            <div className="p-4 border-b border-gray-200">
                <div className={`flex bg-gray-100 p-1 rounded-lg ${orderType === 'Dine-In' ? 'mb-4' : ''}`}>
                    {["Dine-In", "Takeaway", "Delivery"].map(type => (
                        <button
                            key={type}
                            onClick={() => setOrderType && setOrderType(type)}
                            className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all cursor-pointer ${orderType === type ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                {orderType === 'Dine-In' && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                            <span>Table Selection:</span>
                            {activeTicketId ? (
                                <span className="bg-orange-100 text-orange-800 border border-orange-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                                    Ticket #{activeTicketId} Active
                                </span>
                            ) : (
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                                    New Order
                                </span>
                            )}
                        </div>
                        <select
                            value={selectedTable}
                            onChange={(e) => setSelectedTable && setSelectedTable(Number(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 font-semibold cursor-pointer"
                        >
                            {tables.map(t => (
                                <option key={t.id} value={t.id}>
                                    Table {t.num}{t.bill > 0 ? ` (₹${t.bill.toLocaleString()})` : ' (Available)'}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-auto p-4">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 font-medium gap-2">
                        <span className="text-3xl">🛒</span>
                        <span>Cart is empty</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cart.map((item, index) => {
                            const isSent = Boolean(item.kot_printed === 1 || item.kot_printed === true);
                            return (
                                <div
                                    key={item.cartKey || item.ticket_item_id || `${item.id}-${item.kot_printed}-${index}`}
                                    className={`flex justify-between items-center p-2.5 rounded-xl border transition-all ${
                                        isSent
                                            ? 'bg-emerald-50/40 border-emerald-200/80 text-gray-800'
                                            : 'bg-amber-50/50 border-amber-300 shadow-2xs text-gray-900'
                                    }`}
                                >
                                    <div className="flex-1 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                            <h4 className="text-sm font-bold leading-tight">{item.name}</h4>
                                            {isSent ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    ✓ Sent to Kitchen
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                                    ⏳ New (Unprinted)
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-medium">₹{item.price}</p>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex items-center bg-white rounded-lg p-0.5 border border-gray-200 shadow-2xs">
                                            <button
                                                type="button"
                                                onClick={() => updateQty && updateQty(item, -1, index)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-md text-gray-900 font-bold hover:bg-gray-200 transition-colors cursor-pointer"
                                            >
                                                -
                                            </button>
                                            <span className="w-7 text-center text-sm font-bold text-gray-900">{item.qty}</span>
                                            <button
                                                type="button"
                                                onClick={() => updateQty && updateQty(item, 1, index)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-md text-gray-900 font-bold hover:bg-gray-200 transition-colors cursor-pointer"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div className="w-16 text-right font-bold text-gray-900">
                                            ₹{(item.price * item.qty).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Billing & Action Area */}
            <div className="bg-gray-50 p-6 border-t border-gray-200">
                <div className="space-y-2 mb-4 text-sm">
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
                    <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between text-xl font-black text-gray-900">
                        <span>Total</span>
                        <span className={accentText}>₹{grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                    {["Cash", "UPI", "Card"].map(pay => (
                        <button key={pay} className="py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer">
                            {pay}
                        </button>
                    ))}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-col gap-2.5">
                    {/* Button 1: "Pay & Print Bill" (Green) */}
                    <button
                        type="button"
                        onClick={onPayAndPrint}
                        disabled={cart.length === 0}
                        className={`w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer`}
                    >
                        💳 Pay & Print Bill
                    </button>

                    {/* Button 2: "Hold & Print KOT" (Orange/Yellow) */}
                    {orderType === 'Dine-In' && (
                        <button
                            type="button"
                            onClick={handleHoldAndPrintKOT}
                            disabled={cart.length === 0 || isProcessingHold}
                            className={`w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer`}
                        >
                            {isProcessingHold ? (
                                <span>⏳ Holding & Printing...</span>
                            ) : (
                                <span>📝 Hold & Print KOT</span>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
