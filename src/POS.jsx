import { useState, useEffect } from 'react';
import Receipt from './Receipt';
import Cart from './components/Cart';
import TableGrid from './components/TableGrid';
import { supabase } from './supabaseClient';

const CATEGORIES = ["All", "Starters", "Main Course", "Biryanis", "Breads", "Beverages"];

const FALLBACK_MENU = [
    { id: 1, item_id: 1, name: "Paneer Tikka", price: 280, category: "Starters", type: "veg" },
    { id: 2, item_id: 2, name: "Chicken 65", price: 320, category: "Starters", type: "non-veg" },
    { id: 3, item_id: 3, name: "Butter Chicken", price: 450, category: "Main Course", type: "non-veg" },
    { id: 4, item_id: 4, name: "Dal Makhani", price: 290, category: "Main Course", type: "veg" },
    { id: 5, item_id: 5, name: "Hyderabadi Dum Biryani", price: 380, category: "Biryanis", type: "non-veg" },
    { id: 6, item_id: 6, name: "Veg Pulao", price: 250, category: "Biryanis", type: "veg" },
    { id: 7, item_id: 7, name: "Garlic Naan", price: 60, category: "Breads", type: "veg" },
    { id: 8, item_id: 8, name: "Tandoori Roti", price: 40, category: "Breads", type: "veg" },
    { id: 9, item_id: 9, name: "Fresh Lime Soda", price: 90, category: "Beverages", type: "veg" },
    { id: 10, item_id: 10, name: "Mango Lassi", price: 120, category: "Beverages", type: "veg" }
];

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function POS({
    onNavigate,
    currentUser,
    activeTicketId: propActiveTicketId,
    setActiveTicketId: propSetActiveTicketId
}) {
    const isManager = currentUser?.role === 'manager';
    const [menuItems, setMenuItems] = useState([]);
    const [theme, setTheme] = useState("fast-food");
    const [view, setView] = useState("menu");
    const [activeCategory, setActiveCategory] = useState("All");
    
    // Tables dynamic ga database nunchi load avthayi
    const [tables, setTables] = useState([
        { id: 1, num: "01", cap: 4, status: "empty", bill: 0 },
        { id: 2, num: "02", cap: 4, status: "empty", bill: 0 }
    ]);

    const [orderType, setOrderType] = useState("Dine-In");
    const [selectedTable, setSelectedTable] = useState(1);
    const [internalActiveTicketId, setInternalActiveTicketId] = useState(null);

    const activeTicketId = propActiveTicketId !== undefined && propActiveTicketId !== null ? propActiveTicketId : internalActiveTicketId;
    const setActiveTicketId = (id) => {
        if (propSetActiveTicketId) propSetActiveTicketId(id);
        setInternalActiveTicketId(id);
    };

    const [refreshGridTrigger, setRefreshGridTrigger] = useState(0);
    const [quickCart, setQuickCart] = useState([]);
    const [tableCarts, setTableCarts] = useState({});
    const [completedTicket, setCompletedTicket] = useState(null);
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState('');
    const [printStatus, setPrintStatus] = useState(null);

    // Fetch Tables from Supabase Database dynamically
    // Fetch Tables from Supabase Database dynamically
useEffect(() => {
    async function fetchTablesFromDB() {
        try {
            const { data, error } = await supabase.from('restaurant_tables').select('*');
            if (data && data.length > 0) {
                const formattedTables = data.map((t, index) => ({
                    id: t.id,
                    // Ikkada database lo table name unna columns check chesi clean ga print chesthundi
                    num: t.name || t.table_name || t.num || `Table ${index + 1}`,
                    cap: t.cap || t.capacity || 4,
                    status: t.status || 'empty',
                    bill: t.bill || 0
                }));
                setTables(formattedTables);
            }
        } catch (err) {
            console.error('Error fetching tables from DB:', err);
        }
    }
    fetchTablesFromDB();
}, [refreshGridTrigger]);

    useEffect(() => {
        let isMounted = true;
        async function fetchPrinters() {
            if (ipcRenderer && ipcRenderer.invoke) {
                try {
                    const list = await ipcRenderer.invoke('get-printers');
                    if (isMounted && Array.isArray(list)) setPrinters(list);
                } catch (err) {
                    console.error('Failed to get printers:', err);
                }
            } else if (window.electronAPI && window.electronAPI.getPrinters) {
                try {
                    const list = await window.electronAPI.getPrinters();
                    if (isMounted && Array.isArray(list)) setPrinters(list);
                } catch (err) {
                    console.error('Failed to get printers:', err);
                }
            }
        }
        fetchPrinters();
        return () => { isMounted = false; };
    }, []);

    const handlePrintReceipt = async () => {
        setPrintStatus('Sending to Printer...');
        try {
            let result = null;
            if (ipcRenderer && ipcRenderer.invoke) {
                result = await ipcRenderer.invoke('print-receipt', selectedPrinter || undefined);
            } else if (window.electronAPI && window.electronAPI.printReceipt) {
                result = await window.electronAPI.printReceipt(selectedPrinter || undefined);
            } else {
                window.print();
                result = { success: true, silent: false };
            }

            if (result && result.success) {
                const msg = result.silent === false ? 'Opened System Print Dialog' : 'Printed Successfully!';
                setPrintStatus(msg);
                setTimeout(() => setPrintStatus(null), 3500);
            } else {
                setPrintStatus(`Print Failed: ${result?.error || 'No thermal printer connected'}`);
            }
        } catch (err) {
            console.error('Printing error:', err);
            setPrintStatus(`Print Error: ${err.message || 'Printer unreachable'}`);
        }
    };

    useEffect(() => {
        let isMounted = true;

        if (ipcRenderer) {
            ipcRenderer.once('get-inventory-response', (event, response) => {
                if (isMounted && response && response.success) {
                    const fetchedItems = (response.items || []).map(i => ({
                        ...i,
                        id: i.item_id || i.id
                    }));
                    setMenuItems(fetchedItems);
                }
            });
            ipcRenderer.send('get-inventory');
        } else if (window.electronAPI?.getInventory) {
            const cleanup = window.electronAPI.onGetInventoryResponse((res) => {
                if (cleanup) cleanup();
                if (isMounted && res && res.success) {
                    const fetchedItems = (res.items || []).map(i => ({
                        ...i,
                        id: i.item_id || i.id
                    }));
                    setMenuItems(fetchedItems);
                }
            });
            window.electronAPI.getInventory();
        } else {
            setTimeout(() => {
                if (isMounted) setMenuItems(FALLBACK_MENU);
            }, 0);
        }

        return () => {
            isMounted = false;
        };
    }, []);

    // Realtime listener for customer portal orders
    useEffect(() => {
        const channel = supabase
            .channel('pos-realtime-orders')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                },
                (payload) => {
                    const newOrder = payload.new;
                    console.log('New Live Order Received from Customer:', newOrder);

                    const targetTableNum = String(newOrder.table_id || newOrder.table_name || '1');
                    const matchedTable = tables.find(t => String(t.id) === targetTableNum || t.num === targetTableNum) || tables[0];
                    const tableId = matchedTable ? matchedTable.id : 1;

                    let rawItems = newOrder.items;
                    if (typeof rawItems === 'string') {
                        try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
                    }

                    const formattedItems = (rawItems || []).map((i, idx) => ({
                        id: i.item_id || i.id || idx + 1,
                        name: i.name || 'Item',
                        price: Number(i.price) || 250,
                        qty: Number(i.qty || i.quantity || 1),
                        kot_printed: 1
                    }));

                    setTableCarts(prev => ({
                        ...prev,
                        [tableId]: [...(prev[tableId] || []), ...formattedItems]
                    }));

                    setTables(prev => prev.map(t => t.id === tableId ? {
                        ...t,
                        status: 'occupied',
                        bill: Math.round(newOrder.total_amount || newOrder.grand_total || 0)
                    } : t));

                    setRefreshGridTrigger(prev => prev + 1);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tables]);

    const accentColor = theme === "fast-food" ? "bg-orange-500 hover:bg-orange-600" : "bg-yellow-500 hover:bg-yellow-600";
    const accentText = theme === "fast-food" ? "text-orange-500" : "text-yellow-600";
    const cardHoverClass = theme === "fast-food" ? "hover:bg-orange-50 hover:border-orange-400" : "hover:bg-yellow-50 hover:border-yellow-400";
    const cart = orderType === 'Dine-In' ? (tableCarts[selectedTable] || []) : quickCart;

    const addToCart = (item) => {
        if (orderType === 'Dine-In') {
            const currentCart = tableCarts[selectedTable] || [];
            const unprintedIndex = currentCart.findIndex(c => c.id === item.id && (!c.kot_printed || c.kot_printed === 0));
            
            let newCart;
            if (unprintedIndex >= 0) {
                newCart = currentCart.map((c, idx) => 
                    idx === unprintedIndex ? { ...c, qty: c.qty + 1 } : c
                );
            } else {
                newCart = [
                    ...currentCart,
                    {
                        ...item,
                        qty: 1,
                        kot_printed: 0,
                        cartKey: `${item.id}-0-${currentCart.length}`
                    }
                ];
            }

            setTableCarts(prev => ({ ...prev, [selectedTable]: newCart }));

            const sub = newCart.reduce((sum, i) => sum + i.price * i.qty, 0);
            const tot = Math.round(sub * 1.05);
            setTables(prev => prev.map(t => t.id === selectedTable ? { ...t, status: 'occupied', bill: tot } : t));
        } else {
            const existing = quickCart.find(c => c.id === item.id);
            if (existing) {
                setQuickCart(quickCart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
            } else {
                setQuickCart([...quickCart, { ...item, qty: 1, kot_printed: 0 }]);
            }
        }
    };

    const updateQty = (targetItemOrId, delta, targetIndex) => {
        if (orderType === 'Dine-In') {
            const currentCart = tableCarts[selectedTable] || [];
            let newCart;

            if (typeof targetIndex === 'number') {
                newCart = currentCart.map((c, idx) => {
                    if (idx === targetIndex) return { ...c, qty: c.qty + delta };
                    return c;
                }).filter(c => c.qty > 0);
            } else {
                const targetId = typeof targetItemOrId === 'object' ? targetItemOrId.id : targetItemOrId;
                newCart = currentCart.map(c => {
                    if (c === targetItemOrId || c.cartKey === targetItemOrId?.cartKey || c.id === targetId) {
                        return { ...c, qty: c.qty + delta };
                    }
                    return c;
                }).filter(c => c.qty > 0);
            }

            setTableCarts(prev => ({ ...prev, [selectedTable]: newCart }));

            const sub = newCart.reduce((sum, i) => sum + i.price * i.qty, 0);
            const tot = Math.round(sub * 1.05);
            setTables(prev => prev.map(t => t.id === selectedTable ? {
                ...t,
                status: newCart.length > 0 ? 'occupied' : 'empty',
                bill: newCart.length > 0 ? tot : 0
            } : t));
        } else {
            const targetId = typeof targetItemOrId === 'object' ? targetItemOrId.id : targetItemOrId;
            setQuickCart(quickCart.map(c => {
                if (c.id === targetId) return { ...c, qty: c.qty + delta };
                return c;
            }).filter(c => c.qty > 0));
        }
    };

    const handleSelectTable = (tableId, openTicketObj) => {
        setOrderType("Dine-In");
        setSelectedTable(tableId);
        setView("menu");

        if (openTicketObj) {
            setActiveTicketId(openTicketObj.ticket_id);
            const fetchedItems = (openTicketObj.items || openTicketObj.cartItems || []).map(i => ({
                ...i,
                id: i.item_id || i.id,
                qty: i.qty || i.quantity || 1,
                kot_printed: i.kot_printed !== undefined && i.kot_printed !== null ? Number(i.kot_printed) : 1
            }));
            setTableCarts(prev => ({ ...prev, [tableId]: fetchedItems }));
            setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'occupied', bill: openTicketObj.grand_total } : t));
        } else {
            setActiveTicketId(null);
            setTableCarts(prev => ({ ...prev, [tableId]: [] }));
        }
    };

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const cgst = subtotal * 0.025;
    const sgst = subtotal * 0.025;
    const grandTotal = subtotal + cgst + sgst;

    const handleNewOrder = () => {
        if (completedTicket) {
            const targetTable = completedTicket.selectedTable;
            if (completedTicket.orderType === 'Dine-In') {
                setTableCarts(prev => ({ ...prev, [targetTable]: [] }));
                setTables(prev => prev.map(t => t.id === targetTable ? { ...t, status: 'empty', bill: 0 } : t));
            } else {
                setQuickCart([]);
            }
        }
        setCompletedTicket(null);
        setActiveTicketId(null);
        setRefreshGridTrigger(prev => prev + 1);
    };

    const handlePayAndPrint = async () => {
        if (cart.length === 0) {
            alert("Cart is empty!");
            return;
        }

        const currentTableObj = tables.find(t => t.id === selectedTable);
        const tableNumberStr = currentTableObj ? (currentTableObj.num || String(currentTableObj.id)) : String(selectedTable || '01');

        const orderData = {
            orderType: orderType || 'Dine-In',
            order_type: orderType || 'Dine-In',
            tableNumber: tableNumberStr,
            table_number: tableNumberStr,
            subtotal,
            tax: cgst + sgst,
            grandTotal,
            grand_total: grandTotal,
            paymentMethod: 'Cash',
            payment_method: 'Cash',
            cartItems: cart,
            items: cart,
            status: 'paid'
        };

        const triggerCashDrawer = async () => {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('open-cash-drawer');
                } else if (window.electronAPI && window.electronAPI.openCashDrawer) {
                    await window.electronAPI.openCashDrawer();
                }
            } catch (err) {
                console.warn('Cash drawer trigger error:', err);
            }
        };

        const onTransactionSuccess = async (ticketId) => {
            await triggerCashDrawer();
            await handlePrintReceipt();

            const targetTable = selectedTable;
            if (orderType === 'Dine-In') {
                setTableCarts(prev => ({ ...prev, [targetTable]: [] }));
                setTables(prev => prev.map(t => t.id === targetTable ? { ...t, status: 'empty', bill: 0 } : t));
            } else {
                setQuickCart([]);
            }

            const ticketObj = {
                ticketId: activeTicketId || ticketId,
                orderType: orderType || 'Dine-In',
                createdAt: new Date().toLocaleString(),
                cart: [...cart],
                subtotal,
                cgst,
                sgst,
                grandTotal,
                selectedTable
            };
            setCompletedTicket(ticketObj);
            setActiveTicketId(null);
            setRefreshGridTrigger(prev => prev + 1);
        };

        const onTransactionFailure = (errorMsg) => {
            alert(`Error saving transaction: ${errorMsg || 'Database error occurred'}`);
        };

        if (activeTicketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('update-open-ticket', activeTicketId, orderData);
                    await ipcRenderer.invoke('close-ticket', activeTicketId, 'Cash');
                } else if (window.electronAPI && window.electronAPI.closeTicket) {
                    if (window.electronAPI.updateOpenTicket) {
                        await window.electronAPI.updateOpenTicket(activeTicketId, orderData);
                    }
                    await window.electronAPI.closeTicket(activeTicketId, 'Cash');
                }
                await onTransactionSuccess(activeTicketId);
            } catch (err) {
                console.error('Failed to close open ticket:', err);
                onTransactionFailure(err.message);
            }
        } else if (ipcRenderer) {
            ipcRenderer.once('save-ticket-response', (event, response) => {
                if (response && response.success) {
                    onTransactionSuccess(response.ticketId);
                } else {
                    onTransactionFailure(response?.error);
                }
            });
            ipcRenderer.send('save-ticket', orderData);
        } else if (window.electronAPI?.saveTicket) {
            const cleanup = window.electronAPI.onSaveTicketResponse((res) => {
                if (cleanup) cleanup();
                if (res && res.success) {
                    onTransactionSuccess(res.ticketId);
                } else {
                    onTransactionFailure(res?.error);
                }
            });
            window.electronAPI.saveTicket(orderData);
        } else {
            onTransactionSuccess(Date.now());
        }
    };

    const handleHoldAndPrintSuccess = (cartData, ticketId, printKotRes) => {
        const targetTable = selectedTable;
        if (orderType === 'Dine-In') {
            const updatedItems = (cartData.cartItems || cartData.items || []).map(i => ({
                ...i,
                kot_printed: 1
            }));
            setTableCarts(prev => ({ ...prev, [targetTable]: updatedItems }));
            setTables(prev => prev.map(t => t.id === targetTable ? {
                ...t,
                status: 'occupied',
                bill: Math.round(cartData.grandTotal)
            } : t));
        } else {
            setQuickCart([]);
        }
        setActiveTicketId(ticketId);
        setView("menu");
        setRefreshGridTrigger(prev => prev + 1);

        if (printKotRes && printKotRes.message === 'No new items to print to kitchen') {
            setPrintStatus(`Ticket #${ticketId} Saved (No new items to print)`);
        } else {
            setPrintStatus(`Ticket #${ticketId} Held & KOT Printed Successfully!`);
        }
        setTimeout(() => setPrintStatus(null), 4000);
    };

    const filteredItems = activeCategory === "All" ? menuItems : menuItems.filter(i => i.category === activeCategory);

    const emptyCount = tables.filter(t => t.status === 'empty').length;
    const occupiedCount = tables.filter(t => t.status === 'occupied').length;
    const reservedCount = tables.filter(t => t.status === 'reserved').length;

    return (
        <div className="flex h-screen w-full bg-gray-50">
            {/* LEFT COLUMN: 70% */}
            <div className="w-[70%] h-full flex flex-col border-r border-gray-200 bg-gray-50">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Royal Spice</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex h-2.5 w-2.5 bg-emerald-500 rounded-full"></span>
                            <span className="text-sm font-medium text-emerald-600">System Online</span>
                            <span className="text-sm text-gray-400 ml-2">| 12:45 PM</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>👤 {currentUser?.name || 'Staff'} ({currentUser?.role === 'manager' ? 'Manager' : 'Cashier'})</span>
                        </div>
                        <div className="bg-gray-100 p-1 rounded-lg flex border border-gray-200">
                            <button onClick={() => setView("menu")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer ${view === "menu" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>Menu View</button>
                            <button 
                                type="button"
                                onClick={() => onNavigate('tables')}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                                <span>❖</span> Tables & QR
                            </button>
                        </div>
                        <button
                            onClick={() => setTheme(theme === "fast-food" ? "fine-dining" : "fast-food")}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-bold cursor-pointer ${theme === "fast-food" ? "border-orange-200 text-orange-600 bg-orange-50" : "border-yellow-200 text-yellow-700 bg-yellow-50"}`}
                        >
                            Theme: {theme === "fast-food" ? "Fast Food" : "Fine Dining"}
                        </button>
                        {isManager && (
                            <>
                                <button
                                    onClick={() => onNavigate('inventory')}
                                    className="px-3 py-1.5 rounded-lg border border-indigo-200 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    📦 Inventory
                                </button>
                                <button
                                    onClick={() => onNavigate('dashboard')}
                                    className="px-3 py-1.5 rounded-lg border border-emerald-200 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    📊 Dashboard
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => onNavigate('lock')}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            🔒 Lock Terminal
                        </button>
                    </div>
                </header>

                {/* Status Bar */}
                <div className="bg-white px-6 py-2 flex gap-4 text-sm font-medium border-b border-gray-200 shadow-sm">
                    <span className="text-emerald-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {emptyCount} Empty</span>
                    <span className="text-amber-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {occupiedCount} Occupied</span>
                    <span className="text-blue-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> {reservedCount} Reserved</span>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-auto p-6">
                    {view === "menu" ? (
                        <>
                            {/* Categories */}
                            <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${activeCategory === cat ? `${accentColor} text-white border-transparent shadow-md` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Item Grid */}
                            <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => addToCart(item)}
                                        className={`bg-white border border-gray-200 p-4 rounded-xl shadow-sm transition-all duration-200 flex flex-col justify-between cursor-pointer transform hover:-translate-y-1 hover:shadow-md ${cardHoverClass}`}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className={`w-4 h-4 border flex items-center justify-center p-0.5 ${item.type === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                                    <div className={`w-2 h-2 rounded-full ${item.type === 'veg' ? 'bg-green-600' : 'bg-red-600'}`}></div>
                                                </div>
                                            </div>
                                            <h3 className="font-semibold text-gray-900 leading-tight mb-1">{item.name}</h3>
                                            <p className="text-gray-500 font-medium">₹{item.price}</p>
                                        </div>
                                        <button className="mt-4 w-full py-2 bg-gray-100 text-gray-900 font-semibold rounded-lg text-sm transition-colors pointer-events-none">
                                            + Add
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        /* Tables Visual Grid */
                        <TableGrid
                            selectedTable={selectedTable}
                            onSelectTable={handleSelectTable}
                            activeTicketId={activeTicketId}
                            refreshTrigger={refreshGridTrigger}
                            accentColor={accentColor}
                            cardHoverClass={cardHoverClass}
                        />
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Cart Component */}
            <Cart
                cart={cart}
                orderType={orderType}
                setOrderType={setOrderType}
                selectedTable={selectedTable}
                setSelectedTable={setSelectedTable}
                tables={tables}
                updateQty={updateQty}
                accentText={accentText}
                onPayAndPrint={handlePayAndPrint}
                onHoldAndPrintSuccess={handleHoldAndPrintSuccess}
                selectedPrinter={selectedPrinter}
                activeTicketId={activeTicketId}
            />

            {/* Thermal Receipt Preview Modal */}
            {completedTicket && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 flex flex-col items-center max-h-[90vh] overflow-y-auto">
                        <div className="w-full flex justify-between items-center pb-3 border-b border-gray-100 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                                <h3 className="font-bold text-gray-900 text-base">Transaction Recorded</h3>
                            </div>
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                SQLite Saved
                            </span>
                        </div>

                        {/* Thermal Receipt Component */}
                        <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 w-full flex justify-center overflow-x-auto">
                            <Receipt ticket={completedTicket} />
                        </div>

                        {/* Thermal Printer Selection & Status */}
                        {printers.length > 0 && (
                            <div className="w-full mt-4 flex flex-col gap-1 text-xs">
                                <label className="font-semibold text-gray-700">Select Thermal Printer:</label>
                                <select
                                    value={selectedPrinter}
                                    onChange={(e) => setSelectedPrinter(e.target.value)}
                                    className="p-2 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:bg-white text-gray-800"
                                >
                                    <option value="">Default Printer (OS System Default)</option>
                                    {printers.map((p, idx) => (
                                        <option key={idx} value={p.name}>
                                            {p.name} {p.isDefault ? '(Default)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {printStatus && (
                            <div className="mt-3 text-xs font-semibold text-center text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 w-full animate-fade-in">
                                {printStatus}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3 w-full mt-4">
                            <button
                                type="button"
                                onClick={handlePrintReceipt}
                                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                                🖨️ Print Receipt
                            </button>
                            <button
                                type="button"
                                onClick={handleNewOrder}
                                className="py-3 px-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                                ➕ New Order
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}