import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Receipt from './Receipt';
import Cart from './components/Cart';
import TableGrid from './components/TableGrid';
import SplitPaymentModal from './components/SplitPaymentModal';
import { supabase } from './supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { getNextDailyTicket, formatDisplayTicketNumber } from './utils/ticketSequence';

// Vercel Live Website Supabase backend credentials
const VERCEL_SUPABASE_URL = 'https://dfijxyaapeyphtqzsctu.supabase.co';
const VERCEL_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmaWp4eWFhcGV5cGh0cXpzY3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NjU0MzQsImV4cCI6MjEwNDM0MTQzNH0.J_gG6FTBZ-wXZb0wpaK0ocJp0V0vLlCg1PxmOUNO3zY';

const DEFAULT_CATEGORIES = ["All", "Starters", "Main Course", "Biryanis", "Breads", "Beverages", "Desserts"];

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function POS({
    onNavigate,
    currentUser,
    activeTicketId: propActiveTicketId,
    setActiveTicketId: propSetActiveTicketId
}) {
    const isManager = currentUser?.role === 'manager';
    const [menuItems, setMenuItems] = useState([]);
    const [view, setView] = useState("menu"); // "menu" | "dine-in"
    const [activeCategory, setActiveCategory] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef(null);

    // Sidebar drawer state
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Tables dynamic ga database nunchi load avthayi
    const [tables, setTables] = useState([
        { id: 1, num: "T1", cap: 4, section: "Main Dining", status: "empty", bill: 0 },
        { id: 2, num: "T2", cap: 4, section: "Main Dining", status: "empty", bill: 0 },
        { id: 3, num: "T3", cap: 4, section: "Main Dining", status: "empty", bill: 0 },
        { id: 4, num: "T4", cap: 6, section: "AC Hall", status: "empty", bill: 0 },
        { id: 5, num: "T5", cap: 4, section: "AC Hall", status: "empty", bill: 0 },
        { id: 6, num: "T6", cap: 8, section: "VIP Section", status: "empty", bill: 0 },
        { id: 7, num: "T7", cap: 4, section: "Outdoor / Terrace", status: "empty", bill: 0 },
        { id: 8, num: "T8", cap: 4, section: "Outdoor / Terrace", status: "empty", bill: 0 }
    ]);

    const [orderType, setOrderType] = useState("Dine-In");
    const [selectedTable, setSelectedTable] = useState(null);
    const [captain, setCaptain] = useState("Captain Ramesh");
    const [lockedTables, setLockedTables] = useState({}); // tableId -> boolean

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
    const [liveOrderNotification, setLiveOrderNotification] = useState(null);

    // Audio chime generator: Plays /ding.wav with HTML5 Audio and Web Audio API fallback
    const playOrderChime = () => {
        // 1. Primary: Direct HTML5 Audio element with static /ding.wav
        try {
            const ding = new Audio('/ding.wav');
            ding.volume = 1.0;
            const p = ding.play();
            if (p !== undefined) {
                p.catch(e => console.warn('HTML5 Audio play warning:', e));
            }
        } catch (e) {
            console.warn('Audio tag error:', e);
        }

        // 2. Secondary: Web Audio API Oscillator synthesizer
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = window.__dine360AudioCtx || new AudioCtx();
                window.__dine360AudioCtx = ctx;

                const runOscillators = () => {
                    const now = ctx.currentTime;
                    // First chime note: D5 (587.33 Hz)
                    const osc1 = ctx.createOscillator();
                    const gain1 = ctx.createGain();
                    osc1.type = 'sine';
                    osc1.frequency.setValueAtTime(587.33, now);
                    gain1.gain.setValueAtTime(0.7, now);
                    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                    osc1.connect(gain1);
                    gain1.connect(ctx.destination);
                    osc1.start(now);
                    osc1.stop(now + 0.35);

                    // Second chime note: A5 (880 Hz)
                    const osc2 = ctx.createOscillator();
                    const gain2 = ctx.createGain();
                    osc2.type = 'sine';
                    osc2.frequency.setValueAtTime(880, now + 0.16);
                    gain2.gain.setValueAtTime(0.8, now + 0.16);
                    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
                    osc2.connect(gain2);
                    gain2.connect(ctx.destination);
                    osc2.start(now + 0.16);
                    osc2.stop(now + 0.75);
                };

                if (ctx.state === 'suspended') {
                    ctx.resume().then(runOscillators).catch(runOscillators);
                } else {
                    runOscillators();
                }
            }
        } catch (e) {
            console.warn('Web Audio error:', e);
        }
    };

    // Pre-unlock AudioContext on first user interaction
    useEffect(() => {
        const unlock = () => {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    if (!window.__dine360AudioCtx) {
                        window.__dine360AudioCtx = new AudioCtx();
                    }
                    if (window.__dine360AudioCtx.state === 'suspended') {
                        window.__dine360AudioCtx.resume();
                    }
                }
            } catch (e) {}
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, []);

    // Split Billing / Multi-Tender Modal State
    const [splitModalOpen, setSplitModalOpen] = useState(false);
    const [splitModalData, setSplitModalData] = useState(null);

    // Real-time Live Clock
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Fetch Tables & Live QR Orders from Supabase
    useEffect(() => {
        // Triggered on grid refresh
        if (typeof syncTablesAndOrders === 'function') {
            syncTablesAndOrders();
        }
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

    // 100% Dynamic Supabase Inventory Fetcher with Local SQLite Fallback
    const fetchInventoryFromCloud = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('inventory')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (!error && data) {
                const mapped = data.map(i => ({
                    ...i,
                    id: i.item_id || i.id,
                    item_id: i.item_id || i.id,
                    price: Number(i.price) || 0
                }));
                setMenuItems(mapped);
                return;
            }
        } catch (err) {
            console.warn('Error fetching inventory from Supabase:', err);
        }

        // Offline fallback to local Electron SQLite
        if (ipcRenderer) {
            ipcRenderer.once('get-inventory-response', (event, response) => {
                if (response && response.success) {
                    setMenuItems((response.items || []).map(i => ({ ...i, id: i.item_id || i.id })));
                }
            });
            ipcRenderer.send('get-inventory');
        } else if (window.electronAPI?.getInventory) {
            const cleanup = window.electronAPI.onGetInventoryResponse((res) => {
                if (cleanup) cleanup();
                if (res && res.success) {
                    setMenuItems((res.items || []).map(i => ({ ...i, id: i.item_id || i.id })));
                }
            });
            window.electronAPI.getInventory();
        } else {
            setMenuItems([]);
        }
    }, []);

    // Initial mount & Supabase Realtime Listener for instant menu sync
    useEffect(() => {
        fetchInventoryFromCloud();

        const invChannel = supabase
            .channel('pos-inventory-realtime-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
                console.log('🔄 Realtime inventory update in POS:', payload);
                fetchInventoryFromCloud();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(invChannel);
        };
    }, [fetchInventoryFromCloud]);

    // Keep tables ref updated so subscription never tears down and reconnects
    const tablesRef = useRef(tables);
    useEffect(() => {
        tablesRef.current = tables;
    }, [tables]);

    // Tracks processed order IDs to avoid duplicate chimes
    const acknowledgedOrdersRef = useRef(new Set());
    const isFirstSyncRef = useRef(true);
    const kotSentTablesRef = useRef(new Set());

    // Rock-Solid Realtime & Polling Sync between Supabase restaurant_orders and POS Table Carts
    const syncTablesAndOrders = useCallback(async () => {
        try {
            // 1. Fetch tables definition from Supabase
            const { data: dbTables, error: tErr } = await supabase
                .from('restaurant_tables')
                .select('*')
                .order('created_at', { ascending: true });

            if (tErr) console.warn('Error fetching tables:', tErr);

            // 2. Fetch all active live orders (Pending or KOT_Printed) from restaurant_orders
            const { data: pendingOrders, error: oErr } = await supabase
                .from('restaurant_orders')
                .select('*')
                .in('status', ['Pending', 'pending', 'KOT_Printed', 'kot_printed'])
                .order('created_at', { ascending: true });

            if (oErr) console.warn('Error fetching pending orders:', oErr);

            const activeTables = (dbTables && dbTables.length > 0) ? dbTables : (tablesRef.current || []);

            // 3. Map orders to tables and accumulate cart items
            const newTableCarts = {};
            const newTableLocks = {};
            const tableBills = {};
            let newlyArrivedOrder = null;

            (pendingOrders || []).forEach(order => {
                // Match table by UUID or Name
                const targetTableNum = String(order.table_id || order.table_name || '1').trim();
                const matched = activeTables.find(t =>
                    String(t.id).trim() === targetTableNum ||
                    String(t.num || '').toLowerCase() === targetTableNum.toLowerCase() ||
                    String(t.name || '').toLowerCase() === targetTableNum.toLowerCase() ||
                    String(t.table_name || '').toLowerCase() === targetTableNum.toLowerCase() ||
                    String(t.num || '').replace(/\D+/g, '') === targetTableNum.replace(/\D+/g, '')
                ) || activeTables[0];

                const tId = matched ? matched.id : targetTableNum;
                const isTableAlreadySentKOT = kotSentTablesRef.current.has(String(tId)) ||
                                              kotSentTablesRef.current.has(String(targetTableNum)) ||
                                              (matched && kotSentTablesRef.current.has(String(matched.num)));

                // Check if this is a brand new order we haven't chimed for yet
                if (!acknowledgedOrdersRef.current.has(order.id)) {
                    acknowledgedOrdersRef.current.add(order.id);
                    if (!isFirstSyncRef.current) {
                        newlyArrivedOrder = order;
                    }
                }

                // Parse items
                let rawItems = order.items;
                if (typeof rawItems === 'string') {
                    try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
                }

                if (!newTableCarts[tId]) newTableCarts[tId] = [];

                (rawItems || []).forEach((item, idx) => {
                    const name = item.name || 'Item';
                    const price = Number(item.price) || 0;
                    const qty = Number(item.qty || item.quantity || 1);
                    const isItemKotPrinted = (Number(item.kot_printed) === 1 || isTableAlreadySentKOT) ? 1 : 0;

                    const existing = newTableCarts[tId].find(i => i.name === name && i.price === price && i.kot_printed === isItemKotPrinted);
                    if (existing) {
                        existing.qty += qty;
                    } else {
                        newTableCarts[tId].push({
                            id: item.id || item.item_id || `${tId}_${idx + 1}`,
                            name,
                            price,
                            qty,
                            kot_printed: isItemKotPrinted
                        });
                    }
                });

                const bill = Math.round(Number(order.total_amount) || newTableCarts[tId].reduce((s, i) => s + (i.price * i.qty), 0));
                tableBills[tId] = (tableBills[tId] || 0) + bill;
                if (order.status === 'bill_printed') {
                    newTableLocks[tId] = true;
                }
            });

            isFirstSyncRef.current = false;

            // 4. Update formatted tables state
            if (activeTables.length > 0) {
                const formattedTables = activeTables.map((t, index) => {
                    const hasPending = Boolean(newTableCarts[t.id] && newTableCarts[t.id].length > 0);
                    return {
                        id: t.id,
                        num: t.name || t.table_name || t.num || `T${index + 1}`,
                        cap: t.cap || t.capacity || t.seating_capacity || 4,
                        section: t.section || (index % 3 === 0 ? "AC Hall" : index % 4 === 0 ? "VIP Section" : "Main Dining"),
                        status: hasPending ? 'occupied' : (t.status || 'empty').toLowerCase(),
                        bill: tableBills[t.id] || t.bill || 0
                    };
                });
                setTables(formattedTables);
            }

            // 5. Merge carts into tableCarts state
            setTableCarts(prev => {
                const merged = { ...prev };
                Object.keys(newTableCarts).forEach(tId => {
                    merged[tId] = newTableCarts[tId];
                });
                return merged;
            });

            // 6. Merge locks only for tables that have bill_printed status
            if (Object.keys(newTableLocks).length > 0) {
                setLockedTables(prev => ({
                    ...prev,
                    ...newTableLocks
                }));
            }

            // 7. If a new order was detected during polling or realtime:
            if (newlyArrivedOrder) {
                playOrderChime();
                const targetTableNum = String(newlyArrivedOrder.table_id || newlyArrivedOrder.table_name || '1').trim();
                const matched = activeTables.find(t => String(t.id).trim() === targetTableNum || String(t.num || '').replace(/\D+/g, '') === targetTableNum.replace(/\D+/g, ''));
                let itemsList = newlyArrivedOrder.items;
                if (typeof itemsList === 'string') {
                    try { itemsList = JSON.parse(itemsList); } catch (e) { itemsList = []; }
                }
                setLiveOrderNotification({
                    tableId: matched ? matched.id : targetTableNum,
                    tableNum: matched ? (matched.num || matched.table_name || `Table ${targetTableNum}`) : `Table ${targetTableNum}`,
                    itemsCount: (itemsList || []).reduce((sum, item) => sum + (Number(item.qty || item.quantity || 1)), 0),
                    amount: Math.round(Number(newlyArrivedOrder.total_amount) || 0),
                    items: itemsList,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        } catch (err) {
            console.error('Error in syncTablesAndOrders:', err);
        }
    }, [playOrderChime]);

    // Initial mount sync & 4-second Polling interval (failsafe guarantee)
    useEffect(() => {
        syncTablesAndOrders();
        const pollInterval = setInterval(() => {
            syncTablesAndOrders();
        }, 4000);
        return () => clearInterval(pollInterval);
    }, [syncTablesAndOrders]);

    // Persistent Realtime listener for customer portal QR orders
    useEffect(() => {
        // Channel 1: Primary Supabase (restaurant_orders table)
        const primaryChannel = supabase
            .channel('pos-realtime-ro')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'restaurant_orders' }, payload => {
                console.log('✅ Realtime INSERT on restaurant_orders!', payload.new);
                playOrderChime();
                syncTablesAndOrders();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
                console.log('✅ Realtime INSERT on orders!', payload.new);
                playOrderChime();
                syncTablesAndOrders();
            })
            .subscribe((status, err) => {
                console.log('📡 Primary Supabase realtime status:', status, err || '');
            });

        // Channel 2: Live Vercel website Supabase client (https://dfijxyaapeyphtqzsctu.supabase.co)
        let vercelClient = null;
        let vercelChannel = null;
        try {
            vercelClient = createClient(VERCEL_SUPABASE_URL, VERCEL_SUPABASE_KEY);
            vercelChannel = vercelClient
                .channel('pos-realtime-vercel-site')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
                    console.log('✅ Realtime INSERT from Vercel orders!', payload.new);
                    playOrderChime();
                    syncTablesAndOrders();
                })
                .subscribe((status, err) => {
                    console.log('📡 Vercel site realtime status:', status, err || '');
                });
        } catch (err) {
            console.warn('Vercel Supabase channel init error:', err);
        }

        return () => {
            supabase.removeChannel(primaryChannel);
            if (vercelClient && vercelChannel) {
                vercelClient.removeChannel(vercelChannel);
            }
        };
    }, [syncTablesAndOrders, playOrderChime]);

    const isCurrentTableLocked = Boolean(selectedTable && lockedTables[selectedTable]);
    const cart = orderType === 'Dine-In' ? (selectedTable ? (tableCarts[selectedTable] || []) : []) : quickCart;

    // Physical Keyboard Shortcuts (F2: Dine-in, F3: Takeaway, F4: Print KOT, Spacebar: Search)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Spacebar: Focus search input (unless currently typing in an input/textarea)
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
                e.preventDefault();
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
                return;
            }

            if (e.key === 'F2') {
                e.preventDefault();
                setView("dine-in");
                setOrderType("Dine-In");
            } else if (e.key === 'F3') {
                e.preventDefault();
                setView("menu");
                setOrderType("Takeaway");
            } else if (e.key === 'Escape') {
                setIsSidebarOpen(false);
                setSplitModalOpen(false);
                if (searchInputRef.current && document.activeElement === searchInputRef.current) {
                    searchInputRef.current.blur();
                    setSearchQuery("");
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSetOrderType = (type) => {
        setOrderType(type);
        if (type !== 'Dine-In') {
            setView('menu');
            setSelectedTable(null);
        }
    };

    // Global Hardware Barcode / QR Scanner Gun Listener
    useEffect(() => {
        let scannerBuffer = '';
        let lastScanKeyTime = Date.now();

        const handleBarcodeScanner = (e) => {
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
                return;
            }

            const now = Date.now();
            if (now - lastScanKeyTime > 150) {
                scannerBuffer = '';
            }
            lastScanKeyTime = now;

            if (e.key === 'Enter') {
                if (scannerBuffer.length >= 2) {
                    e.preventDefault();
                    const code = scannerBuffer.trim().toLowerCase();
                    scannerBuffer = '';

                    // Find item by ID, item_id, barcode, or exact name
                    const matchedItem = menuItems.find(item =>
                        String(item.id).toLowerCase() === code ||
                        String(item.item_id).toLowerCase() === code ||
                        String(item.barcode || '').toLowerCase() === code ||
                        item.name.toLowerCase() === code
                    );

                    if (matchedItem) {
                        addToCart(matchedItem);
                        setPrintStatus(`🎯 Scanned & Added: ${matchedItem.name}`);
                        setTimeout(() => setPrintStatus(null), 3000);
                    } else {
                        setPrintStatus(`⚠️ Scanned Code "${code}" not found in Menu!`);
                        setTimeout(() => setPrintStatus(null), 3500);
                    }
                }
            } else if (e.key && e.key.length === 1) {
                scannerBuffer += e.key;
            }
        };

        window.addEventListener('keydown', handleBarcodeScanner);
        return () => window.removeEventListener('keydown', handleBarcodeScanner);
    }, [menuItems, selectedTable, orderType, isCurrentTableLocked, tableCarts]);

    const addToCart = (item) => {
        if (orderType === 'Dine-In') {
            if (!selectedTable) {
                alert("Please select a table from the Floor Plan first!");
                setView("dine-in");
                return;
            }

            if (isCurrentTableLocked) {
                alert(`Table is currently locked because the bill was already printed. Unlock table to add more items.`);
                return;
            }

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
            if (!selectedTable) return;
            if (isCurrentTableLocked) {
                alert("Table is locked. Unlock to modify items.");
                return;
            }

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
                status: newCart.length > 0 ? (lockedTables[selectedTable] ? 'bill_printed' : 'occupied') : 'empty',
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

    const handleSelectTable = (tableId, openTicketObj, tableObj) => {
        setOrderType("Dine-In");
        setSelectedTable(tableId);

        if (openTicketObj) {
            setActiveTicketId(openTicketObj.ticket_id);
            const isTableSent = kotSentTablesRef.current.has(String(tableId)) || 
                                (tableObj && kotSentTablesRef.current.has(String(tableObj.num)));
            const fetchedItems = (openTicketObj.items || openTicketObj.cartItems || []).map(i => ({
                ...i,
                id: i.item_id || i.id,
                qty: i.qty || i.quantity || 1,
                kot_printed: (isTableSent || Number(i.kot_printed) === 1) ? 1 : 0
            }));
            setTableCarts(prev => ({ ...prev, [tableId]: fetchedItems }));

            const isBillPrinted = openTicketObj.status === 'bill_printed';
            setLockedTables(prev => ({ ...prev, [tableId]: isBillPrinted }));
            setTables(prev => prev.map(t => t.id === tableId ? {
                ...t,
                status: isBillPrinted ? 'bill_printed' : 'occupied',
                bill: openTicketObj.grand_total
            } : t));
        } else {
            setActiveTicketId(null);
            // Preserve existing table cart
            setTableCarts(prev => ({ ...prev, [tableId]: prev[tableId] || [] }));
            setLockedTables(prev => ({
                ...prev,
                [tableId]: false
            }));
        }

        // Direct ga menu view open avvali
        setView("menu");
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
                setLockedTables(prev => ({ ...prev, [targetTable]: false }));
                kotSentTablesRef.current.delete(String(targetTable));
                const matchedT = tables.find(t => t.id === targetTable || String(t.num) === String(targetTable));
                if (matchedT) {
                    kotSentTablesRef.current.delete(String(matchedT.id));
                    kotSentTablesRef.current.delete(String(matchedT.num));
                }
            } else {
                setQuickCart([]);
            }
        }
        setCompletedTicket(null);
        setActiveTicketId(null);
        setRefreshGridTrigger(prev => prev + 1);
    };

    // State 2 -> State 2 (Hold & KOT Printed)
    const handleHoldAndPrintSuccess = (cartData, ticketId, printKotRes) => {
        const targetTable = selectedTable;
        if (orderType === 'Dine-In') {
            const updatedItems = (cartData.cartItems || cartData.items || []).map(i => ({
                ...i,
                kot_printed: 1
            }));

            // Track that KOT has been approved by Cashier
            if (targetTable) {
                kotSentTablesRef.current.add(String(targetTable));
                const matchedT = tables.find(t => t.id === targetTable || String(t.num) === String(targetTable));
                if (matchedT) {
                    kotSentTablesRef.current.add(String(matchedT.id));
                    kotSentTablesRef.current.add(String(matchedT.num));
                }
            }

            setTableCarts(prev => ({ ...prev, [targetTable]: updatedItems }));
            setTables(prev => prev.map(t => t.id === targetTable ? {
                ...t,
                status: 'occupied',
                bill: Math.round(cartData.grandTotal)
            } : t));
        } else {
            // For Takeaway: keep items in quickCart marked as kot_printed: 1 so cashier can settle later
            const updatedItems = (cartData.cartItems || cartData.items || []).map(i => ({
                ...i,
                kot_printed: 1
            }));
            setQuickCart(updatedItems);
        }

        // Update Supabase restaurant_orders: update items JSON array to have kot_printed: 1
        // Note: status stays 'Pending' to comply with Postgres CHECK (status IN ('Pending', 'Completed', 'Cancelled'))
        if (targetTable) {
            try {
                const currentCart = tableCarts[targetTable] || cartData.cartItems || cartData.items || [];
                const updatedItems = currentCart.map(i => ({
                    ...i,
                    kot_printed: 1
                }));
                const matchedT = tables.find(t => t.id === targetTable || String(t.num) === String(targetTable));
                const tableIdQuery = matchedT ? matchedT.id : targetTable;

                supabase
                    .from('restaurant_orders')
                    .update({ 
                        items: updatedItems,
                        updated_at: new Date().toISOString() 
                    })
                    .or(`table_id.eq.${tableIdQuery},table_id.eq.${targetTable}`)
                    .eq('status', 'Pending')
                    .then(({ error }) => {
                        if (error) console.warn('Error setting kot_printed in Supabase:', error);
                    });
            } catch (err) {
                console.warn('Supabase KOT update error:', err);
            }
        }

        setActiveTicketId(ticketId);
        setRefreshGridTrigger(prev => prev + 1);

        if (printKotRes && printKotRes.message) {
            setPrintStatus(printKotRes.message);
        } else {
            setPrintStatus(`Ticket #${ticketId} KOT Routed Successfully to Kitchen!`);
        }
        setTimeout(() => setPrintStatus(null), 4000);
    };

    // State 3: Print Bill (Locks Table, Changes to Blue)
    const handlePrintBill = async (tableOrNull, openTicketOrNull) => {
        const targetTableId = tableOrNull ? tableOrNull.id : selectedTable;
        const currentTableObj = tables.find(t => t.id === targetTableId) || tableOrNull;
        const tableNumberStr = currentTableObj ? (currentTableObj.num || String(currentTableObj.id)) : String(targetTableId || '01');
        const items = openTicketOrNull?.items || openTicketOrNull?.cartItems || tableCarts[targetTableId] || cart;
        const ticketId = openTicketOrNull?.ticket_id || activeTicketId;

        if (!items || items.length === 0) {
            alert("No items in bill to print!");
            return;
        }

        const bSub = items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0);
        const bCgst = bSub * 0.025;
        const bSgst = bSub * 0.025;
        const bGrandTotal = bSub + bCgst + bSgst;

        // Print physical bill receipt
        await handlePrintReceipt();

        // Update ticket in database to status: 'bill_printed'
        if (ticketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('update-open-ticket', ticketId, {
                        status: 'bill_printed',
                        grandTotal: bGrandTotal
                    });
                } else if (window.electronAPI?.updateOpenTicket) {
                    await window.electronAPI.updateOpenTicket(ticketId, {
                        status: 'bill_printed',
                        grandTotal: bGrandTotal
                    });
                }
            } catch (err) {
                console.warn('Update ticket to bill_printed error:', err);
            }
        }

        // Lock table and update state to Blue (bill_printed)
        setLockedTables(prev => ({ ...prev, [targetTableId]: true }));
        setTables(prev => prev.map(t => t.id === targetTableId ? { ...t, status: 'bill_printed', bill: Math.round(bGrandTotal) } : t));
        setRefreshGridTrigger(prev => prev + 1);

        setPrintStatus(`🧾 Bill Printed for Table ${tableNumberStr}! Table locked (State 3: Bill Printed)`);
        setTimeout(() => setPrintStatus(null), 4000);
    };

    // Unlock table (State 3 -> State 2)
    const handleUnlockTable = async (table, openTicket) => {
        const tableId = table.id;
        const ticketId = openTicket?.ticket_id || activeTicketId;

        setLockedTables(prev => ({ ...prev, [tableId]: false }));

        if (ticketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('update-open-ticket', ticketId, { status: 'open' });
                } else if (window.electronAPI?.updateOpenTicket) {
                    await window.electronAPI.updateOpenTicket(ticketId, { status: 'open' });
                }
            } catch (err) {
                console.warn('Unlock table error:', err);
            }
        }

        setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'occupied' } : t));
        setRefreshGridTrigger(prev => prev + 1);
        setPrintStatus(`🔓 Table ${table.num} unlocked! Staff can now add items to KOT.`);
        setTimeout(() => setPrintStatus(null), 3500);
    };

    // Open Split Billing & Multi-Tender Modal (State 4)
    const handleOpenSplitModal = (tableOrNull, openTicketOrNull) => {
        const targetTableId = tableOrNull ? tableOrNull.id : selectedTable;
        const tableObj = tables.find(t => t.id === targetTableId) || tableOrNull;
        const items = openTicketOrNull?.items || openTicketOrNull?.cartItems || tableCarts[targetTableId] || cart;
        const ticketId = openTicketOrNull?.ticket_id || activeTicketId;

        if (!items || items.length === 0) {
            alert("Cart is empty! Cannot settle.");
            return;
        }

        const s = items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0);
        const c = s * 0.025;
        const g = s * 0.025;
        const tot = s + c + g;

        setSplitModalData({
            tableInfo: tableObj,
            items,
            subtotal: s,
            cgst: c,
            sgst: g,
            grandTotal: tot,
            ticketId,
            orderType: orderType || (tableObj ? 'Dine-In' : 'Takeaway')
        });
        setSplitModalOpen(true);
    };

    // Confirm Settlement (Multi-Tender) -> State 4: Back to Green (Empty)
    const handleConfirmSettle = async (tenderDetails) => {
        if (!splitModalData) return;

        const { tableInfo, items, subtotal: s, cgst: c, sgst: g, grandTotal: tot, ticketId, orderType: modalOrderType } = splitModalData;
        const currentOrderType = modalOrderType || orderType || (tableInfo ? 'Dine-In' : 'Takeaway');
        const targetTable = tableInfo?.id || selectedTable;
        const tableNumberStr = currentOrderType === 'Dine-In' ? (tableInfo?.num || String(targetTable || '01')) : 'Takeaway';

        const paymentSummary = tenderDetails.paymentSummary;

        // Cash drawer pulse if cash was paid
        if (tenderDetails.cash > 0) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('open-cash-drawer');
                } else if (window.electronAPI?.openCashDrawer) {
                    await window.electronAPI.openCashDrawer();
                }
            } catch (err) {
                console.warn('Cash drawer error:', err);
            }
        }

        // Close ticket in SQLite/Supabase database
        if (ticketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('close-ticket', ticketId, paymentSummary);
                } else if (window.electronAPI?.closeTicket) {
                    await window.electronAPI.closeTicket(ticketId, paymentSummary);
                }
            } catch (err) {
                console.error('Failed to close ticket in DB:', err);
            }
        }

        // ── Browser Mode: Write to Supabase sales_tickets + sales_ticket_items ──
        // This is required so Admin Dashboard revenue/analytics works correctly.
        if (!ipcRenderer && !window.electronAPI?.closeTicket) {
            try {
                const restaurantId = localStorage.getItem('dine360_restaurant_id');
                if (restaurantId) {
                    const fallbackDailyTicket = getNextDailyTicket();
                    const safeTicketId = (typeof ticketId === 'number' && ticketId > 0 && ticketId < 2147483647)
                        ? ticketId
                        : fallbackDailyTicket.dbTicketId;
                    const dailySeq = (typeof ticketId === 'number' && ticketId >= 200000000 && ticketId <= 999999999)
                        ? parseInt(String(ticketId).slice(6), 10)
                        : (ticketId && ticketId < 10000 ? ticketId : fallbackDailyTicket.dailySeq);
                    const orderItems = items || [];
                    const bSub = orderItems.reduce((sum, i) => sum + (Number(i.price) * Number(i.qty || 1)), 0);
                    const bTax = Math.round(bSub * 0.05 * 100) / 100;
                    const bTotal = Math.round((bSub + bTax) * 100) / 100;

                    // 1. Insert into sales_tickets
                    const { error: ticketErr } = await supabase
                        .from('sales_tickets')
                        .insert({
                            restaurant_id: restaurantId,
                            ticket_id: safeTicketId,
                            order_type: currentOrderType,
                            table_number: tableNumberStr,
                            subtotal: bSub,
                            tax: bTax,
                            grand_total: bTotal,
                            payment_method: paymentSummary || 'Cash',
                            status: 'paid',
                            total_paid: bTotal
                        });

                    if (ticketErr) {
                        console.error('sales_tickets insert error:', ticketErr);
                    } else {
                        // 2. Insert line items into sales_ticket_items
                        const lineItems = orderItems.map(i => ({
                            restaurant_id: restaurantId,
                            ticket_id: safeTicketId,
                            item_id: Number(i.item_id || i.id || 0),
                            item_name: i.name || 'Item',
                            quantity: Number(i.qty || 1),
                            price_at_time: Number(i.price || 0),
                            kot_printed: Number(i.kot_printed || 1)
                        }));

                        if (lineItems.length > 0) {
                            const { error: itemErr } = await supabase
                                .from('sales_ticket_items')
                                .insert(lineItems);
                            if (itemErr) console.error('sales_ticket_items insert error:', itemErr);
                        }
                    }
                }
            } catch (err) {
                console.warn('Supabase sales_tickets write error:', err);
            }
        }

        // Print final settled receipt
        await handlePrintReceipt();

        // Reset Table to State 4: Settled / Empty (Green)
        if (orderType === 'Dine-In') {
            setTableCarts(prev => ({ ...prev, [targetTable]: [] }));
            setTables(prev => prev.map(t => t.id === targetTable ? { ...t, status: 'empty', bill: 0 } : t));
            kotSentTablesRef.current.delete(String(targetTable));
            const matchedT = tables.find(t => t.id === targetTable || String(t.num) === String(targetTable));
            if (matchedT) {
                kotSentTablesRef.current.delete(String(matchedT.id));
                kotSentTablesRef.current.delete(String(matchedT.num));
            }
            
            // Mark pending orders as Completed in Supabase
            try {
                supabase
                    .from('restaurant_orders')
                    .update({ status: 'Completed', updated_at: new Date().toISOString() })
                    .eq('table_id', targetTable)
                    .in('status', ['Pending', 'pending'])
                    .then(({ error }) => {
                        if (error) console.warn('Error marking restaurant_orders completed:', error);
                    });
            } catch (err) {
                console.warn('Supabase completion error:', err);
            }
        } else {
            setQuickCart([]);
        }

        setLockedTables(prev => ({ ...prev, [targetTable]: false }));

        const completed = {
            ticketId: ticketId || safeTicketId,
            dailySeq: dailySeq || null,
            orderType: currentOrderType,
            createdAt: new Date().toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }),
            cart: [...items],
            subtotal: s,
            cgst: c,
            sgst: g,
            grandTotal: tot,
            selectedTable: targetTable,
            tableNumber: tableNumberStr,
            paymentMethod: paymentSummary,
            captain: tenderDetails.captain || captain
        };

        setCompletedTicket(completed);
        setActiveTicketId(null);
        setSplitModalOpen(false);
        setSplitModalData(null);
        setRefreshGridTrigger(prev => prev + 1);

        setPrintStatus(`✓ Table ${tableNumberStr} Settled (${paymentSummary}) & Reset to Empty!`);
        setTimeout(() => setPrintStatus(null), 4000);
    };

    // Table Shift (Transfer)
    const handleShiftTable = async (fromTable, toTable, ticket) => {
        if (!fromTable || !toTable) return;
        const ticketId = ticket?.ticket_id || activeTicketId;
        const items = tableCarts[fromTable.id] || ticket?.items || ticket?.cartItems || [];

        // 1. Update ticket in database with new table number
        if (ticketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('update-open-ticket', ticketId, {
                        tableNumber: toTable.num,
                        table_number: toTable.num
                    });
                } else if (window.electronAPI?.updateOpenTicket) {
                    await window.electronAPI.updateOpenTicket(ticketId, {
                        tableNumber: toTable.num,
                        table_number: toTable.num
                    });
                }
            } catch (err) {
                console.error('Error shifting ticket in DB:', err);
            }
        }

        // 2. Move table carts
        setTableCarts(prev => {
            const next = { ...prev };
            next[toTable.id] = items;
            delete next[fromTable.id];
            return next;
        });

        // 3. Move table status
        const currentBill = ticket?.grand_total || (tables.find(t => t.id === fromTable.id)?.bill || 0);
        setTables(prev => prev.map(t => {
            if (t.id === fromTable.id) return { ...t, status: 'empty', bill: 0 };
            if (t.id === toTable.id) return { ...t, status: 'occupied', bill: currentBill };
            return t;
        }));

        setSelectedTable(toTable.id);
        setRefreshGridTrigger(prev => prev + 1);

        setPrintStatus(`🔀 Table Shifted: ${fromTable.num} ➔ ${toTable.num} successfully!`);
        setTimeout(() => setPrintStatus(null), 4000);
    };

    // Table Merge
    const handleMergeTables = async (sourceTable, targetTable, sourceTicket, targetTicket) => {
        if (!sourceTable || !targetTable) return;
        const sourceItems = sourceTicket?.items || sourceTicket?.cartItems || tableCarts[sourceTable.id] || [];
        const targetItems = targetTicket?.items || targetTicket?.cartItems || tableCarts[targetTable.id] || [];

        const combinedItems = [...targetItems, ...sourceItems];
        const combSubtotal = combinedItems.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0);
        const combTax = combSubtotal * 0.05;
        const combGrandTotal = combSubtotal + combTax;

        const targetTicketId = targetTicket?.ticket_id;
        const sourceTicketId = sourceTicket?.ticket_id;

        // 1. Update target ticket in DB with combined items & total
        if (targetTicketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('update-open-ticket', targetTicketId, {
                        subtotal: combSubtotal,
                        tax: combTax,
                        grandTotal: combGrandTotal,
                        cartItems: combinedItems
                    });
                } else if (window.electronAPI?.updateOpenTicket) {
                    await window.electronAPI.updateOpenTicket(targetTicketId, {
                        subtotal: combSubtotal,
                        tax: combTax,
                        grandTotal: combGrandTotal,
                        cartItems: combinedItems
                    });
                }
            } catch (err) {
                console.error('Error updating target ticket in DB:', err);
            }
        }

        // 2. Close source ticket as merged
        if (sourceTicketId) {
            try {
                if (ipcRenderer && ipcRenderer.invoke) {
                    await ipcRenderer.invoke('close-ticket', sourceTicketId, `Merged into Table ${targetTable.num}`);
                } else if (window.electronAPI?.closeTicket) {
                    await window.electronAPI.closeTicket(sourceTicketId, `Merged into Table ${targetTable.num}`);
                }
            } catch (err) {
                console.warn('Error closing merged source ticket:', err);
            }
        }

        // 3. Update React state
        setTableCarts(prev => {
            const next = { ...prev };
            next[targetTable.id] = combinedItems;
            delete next[sourceTable.id];
            return next;
        });

        setTables(prev => prev.map(t => {
            if (t.id === sourceTable.id) return { ...t, status: 'empty', bill: 0 };
            if (t.id === targetTable.id) return { ...t, status: 'occupied', bill: Math.round(combGrandTotal) };
            return t;
        }));

        setSelectedTable(targetTable.id);
        setActiveTicketId(targetTicketId || null);
        setRefreshGridTrigger(prev => prev + 1);

        setPrintStatus(`🔗 Tables Merged: ${sourceTable.num} merged into Master Table ${targetTable.num}! Total: ₹${combGrandTotal.toFixed(2)}`);
        setTimeout(() => setPrintStatus(null), 4500);
    };

    // Dynamic categories computed from active menu items and stored custom categories
    const categoriesList = useMemo(() => {
        let storedCats = [];
        try {
            const raw = localStorage.getItem('dine360_categories');
            if (raw) storedCats = JSON.parse(raw);
        } catch (e) {}
        const fromMenu = menuItems.map(i => i.category).filter(Boolean);
        const combined = [...new Set([...storedCats, ...fromMenu])];
        return combined.length > 0 ? ["All", ...combined] : DEFAULT_CATEGORIES;
    }, [menuItems]);

    // Filter items by category & search query
    const filteredItems = menuItems.filter(item => {
        const matchesCategory = activeCategory === "All" || item.category === activeCategory;
        const matchesSearch = !searchQuery.trim() || item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
        return matchesCategory && matchesSearch;
    });

    const emptyCount = tables.filter(t => t.status === 'empty').length;
    const occupiedCount = tables.filter(t => t.status === 'occupied').length;
    const billPrintedCount = tables.filter(t => t.status === 'bill_printed').length;

    return (
        <div className="flex h-screen w-full bg-gray-50 overflow-hidden relative">
            {/* Live QR Order Incoming Notification Banner */}
            {liveOrderNotification && (
                <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full px-4 animate-bounce-once">
                    <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border-2 border-orange-500/80 p-4 flex items-center justify-between gap-4 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-xl shrink-0 animate-pulse">
                                🔔
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-white text-base">New QR Order: {liveOrderNotification.tableNum}</span>
                                    <span className="bg-orange-500/20 text-orange-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-orange-500/30">Live</span>
                                </div>
                                <p className="text-xs text-slate-300">
                                    {liveOrderNotification.itemsCount} Items • <span className="font-bold text-emerald-400">₹{liveOrderNotification.amount}</span> • {liveOrderNotification.time}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setSelectedTable(liveOrderNotification.tableId);
                                    setView("menu");
                                    setLiveOrderNotification(null);
                                }}
                                className="px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                            >
                                <span>View & KOT</span> ➔
                            </button>
                            <button
                                onClick={() => setLiveOrderNotification(null)}
                                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer text-xs"
                                title="Dismiss"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sliding Sidebar Drawer */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-50 flex animate-fade-in">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
                        onClick={() => setIsSidebarOpen(false)}
                    />

                    {/* Drawer Panel */}
                    <div className="relative w-80 max-w-[85vw] bg-slate-900 text-white h-full shadow-2xl flex flex-col z-10">
                        {/* Drawer Header */}
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                            <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center font-black text-white text-base">
                                    R
                                </span>
                                <div>
                                    <h2 className="font-black text-white text-base leading-tight">Royal Spice POS</h2>
                                    <p className="text-[11px] text-slate-400">Navigation Menu</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Staff Profile Card */}
                        <div className="p-4 mx-4 mt-4 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg">
                                👤
                            </div>
                            <div className="flex-1 truncate">
                                <h4 className="font-bold text-sm text-white truncate">{currentUser?.name || 'Staff User'}</h4>
                                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                    {currentUser?.role === 'manager' ? '👑 Manager' : 'Cashier'}
                                </span>
                            </div>
                        </div>

                        {/* Navigation Links inside Drawer */}
                        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
                                Core Management
                            </div>

                            <button
                                onClick={() => { setIsSidebarOpen(false); onNavigate('dashboard'); }}
                                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition-all cursor-pointer text-left group"
                            >
                                <span className="text-lg p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                    📊
                                </span>
                                <div>
                                    <div className="font-bold">Dashboard</div>
                                    <div className="text-xs text-slate-400 font-normal">Analytics, sales & daily reports</div>
                                </div>
                            </button>

                            <button
                                onClick={() => { setIsSidebarOpen(false); onNavigate('inventory'); }}
                                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition-all cursor-pointer text-left group"
                            >
                                <span className="text-lg p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                    📦
                                </span>
                                <div>
                                    <div className="font-bold">Inventory</div>
                                    <div className="text-xs text-slate-400 font-normal">Menu items, stock & prices</div>
                                </div>
                            </button>

                            <button
                                onClick={() => { setIsSidebarOpen(false); onNavigate('tables'); }}
                                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition-all cursor-pointer text-left group"
                            >
                                <span className="text-lg p-2 rounded-lg bg-orange-500/10 text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-all">
                                    ❖
                                </span>
                                <div>
                                    <div className="font-bold">Tables & QR Code Setup</div>
                                    <div className="text-xs text-slate-400 font-normal">Configure tables & print QR codes</div>
                                </div>
                            </button>

                            <div className="border-t border-slate-800 my-3"></div>

                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
                                POS Views
                            </div>

                            <button
                                onClick={() => { setIsSidebarOpen(false); setView('dine-in'); }}
                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${view === 'dine-in' ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                            >
                                <span>🍽️</span> Dine-In Floor Plan (F2)
                            </button>

                            <button
                                onClick={() => { setIsSidebarOpen(false); setView('menu'); }}
                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${view === 'menu' ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                            >
                                <span>📋</span> Menu View
                            </button>
                        </div>

                        {/* Drawer Footer */}
                        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-950">
                            <button
                                onClick={() => { setIsSidebarOpen(false); onNavigate('lock'); }}
                                className="w-full py-2.5 px-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-red-500/30"
                            >
                                🔒 Lock Terminal
                            </button>
                            <div className="text-[10px] text-center text-slate-500">
                                Dine360 POS • Royal Spice
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* LEFT COLUMN: 70% */}
            <div className="w-[70%] h-full flex flex-col border-r border-gray-200 bg-gray-50">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-xs z-10">
                    <div className="flex items-center gap-3">
                        {/* 3-line Toggle Menu (Hamburger) to the LEFT of Royal Spice */}
                        <button
                            type="button"
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 hover:bg-slate-100 rounded-xl text-slate-700 transition-colors cursor-pointer flex flex-col justify-center items-center gap-1 w-10 h-10 border border-slate-200 shadow-2xs"
                            title="Open Sidebar Navigation (Dashboard, Inventory, Tables & QR)"
                        >
                            <span className="w-5 h-0.5 bg-slate-800 rounded-full"></span>
                            <span className="w-5 h-0.5 bg-slate-800 rounded-full"></span>
                            <span className="w-5 h-0.5 bg-slate-800 rounded-full"></span>
                        </button>

                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">Royal Spice</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="flex h-2.5 w-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                <span className="text-xs font-bold text-emerald-600">System Online</span>
                                <span className="text-xs text-gray-400 font-semibold ml-1">| {currentTime}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Current Staff Badge */}
                        <div className="bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>👤 {currentUser?.name || 'Staff'} ({currentUser?.role === 'manager' ? 'Manager' : 'Cashier'})</span>
                        </div>

                        {/* Test Bell Sound Button */}
                        <button
                            type="button"
                            onClick={() => {
                                console.log('Manual Bell Sound Test Triggered!');
                                playOrderChime();
                            }}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            title="Click to Test Kitchen Order Bell Sound"
                        >
                            <span className="text-sm">🔔</span>
                            <span>Test Bell</span>
                        </button>

                        {/* View Switcher: Menu View vs Dine In (Theme Fast Food completely removed!) */}
                        <div className="bg-gray-100 p-1 rounded-xl flex border border-gray-200 shadow-2xs">
                            <button
                                onClick={() => setView("menu")}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${view === "menu" ? "bg-white shadow-xs text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
                            >
                                Menu View
                            </button>
                            <button
                                type="button"
                                onClick={() => setView("dine-in")}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${view === "dine-in" ? "bg-white shadow-xs text-orange-600" : "text-gray-500 hover:text-gray-900"}`}
                            >
                                <span>🍽️</span> Dine In
                            </button>
                        </div>

                        {/* Lock Terminal */}
                        <button
                            onClick={() => onNavigate('lock')}
                            className="px-3 py-1.5 rounded-xl border border-red-200 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            🔒 Lock
                        </button>
                    </div>
                </header>

                {/* Print / Action Notification Toast */}
                {printStatus && (
                    <div className="mx-6 mt-3 p-3 text-xs font-bold text-center text-emerald-900 bg-emerald-50 border border-emerald-300 rounded-xl shadow-xs animate-fade-in">
                        {printStatus}
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto p-6">
                    {view === "menu" ? (
                        <>
                            {/* Search Bar & Shortcuts Pill */}
                            <div className="flex gap-3 mb-4 items-center">
                                <div className="relative flex-1">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 text-sm">
                                        🔍
                                    </span>
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search menu items... (Press Spacebar to search)"
                                        className="w-full pl-10 pr-20 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-hidden focus:ring-2 focus:ring-orange-500 shadow-2xs"
                                    />
                                    {searchQuery ? (
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    ) : (
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-[10px] font-mono text-gray-400 pointer-events-none">
                                            [Spacebar]
                                        </span>
                                    )}
                                </div>

                                <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-2xs">
                                    <span>⚡ <strong className="text-gray-800">F2</strong> Dine-In</span>
                                    <span>•</span>
                                    <span><strong className="text-gray-800">F3</strong> Takeaway</span>
                                    <span>•</span>
                                    <span><strong className="text-gray-800">F4</strong> KOT</span>
                                </div>
                            </div>

                            {/* Categories */}
                            <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
                                {categoriesList.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${activeCategory === cat ? 'bg-orange-500 text-white border-transparent shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Item Grid */}
                            {filteredItems.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {filteredItems.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => addToCart(item)}
                                            className="bg-white border border-gray-200 hover:border-orange-400 hover:bg-orange-50/20 p-4 rounded-2xl shadow-xs transition-all duration-200 flex flex-col justify-between cursor-pointer transform hover:-translate-y-0.5"
                                        >
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className={`w-4 h-4 border flex items-center justify-center p-0.5 ${item.type === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                                        <div className={`w-2 h-2 rounded-full ${item.type === 'veg' ? 'bg-green-600' : 'bg-red-600'}`}></div>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">{item.category}</span>
                                                </div>
                                                <h3 className="font-bold text-gray-900 leading-tight mb-1 text-sm">{item.name}</h3>
                                                <p className="text-gray-600 font-black text-sm">₹{Number(item.price).toFixed(2)}</p>
                                            </div>
                                            <button className="mt-3 w-full py-2 bg-gray-50 text-gray-800 font-bold rounded-xl text-xs transition-colors pointer-events-none border border-gray-100">
                                                + Add
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
                                    <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-3xl mb-3 text-orange-500">
                                        📦
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                                        {searchQuery ? 'No Matching Items' : 'Your Menu is Empty'}
                                    </h3>
                                    <p className="text-sm text-gray-500 max-w-sm mb-4">
                                        {searchQuery
                                            ? `No menu items found matching "${searchQuery}".`
                                            : 'No items found in your Supabase inventory. Add items in Inventory Manager or Supabase to begin billing.'}
                                    </p>
                                    {!searchQuery && (
                                        <button
                                            onClick={() => onNavigate && onNavigate('inventory')}
                                            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-2"
                                        >
                                            ➕ Add Items in Inventory Manager
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Complete Dine-In Visual Floor Plan (4-State Lifecycle) */
                        <TableGrid
                            selectedTable={selectedTable}
                            onSelectTable={handleSelectTable}
                            activeTicketId={activeTicketId}
                            refreshTrigger={refreshGridTrigger}
                            restaurantId={localStorage.getItem('dine360_restaurant_id') || 'D360-RJY-1997'}
                            tables={tables}
                            tableCarts={tableCarts}
                            onPrintBill={handlePrintBill}
                            onSettleTable={handleOpenSplitModal}
                            onShiftTable={handleShiftTable}
                            onMergeTables={handleMergeTables}
                            onUnlockTable={handleUnlockTable}
                            onNavigate={onNavigate}
                        />
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: 30% Cart Component */}
            <Cart
                cart={cart}
                orderType={orderType}
                setOrderType={handleSetOrderType}
                selectedTable={selectedTable}
                setSelectedTable={setSelectedTable}
                tables={tables}
                updateQty={updateQty}
                accentText="text-orange-500"
                onPayAndPrint={handleOpenSplitModal}
                onHoldAndPrintSuccess={handleHoldAndPrintSuccess}
                selectedPrinter={selectedPrinter}
                activeTicketId={activeTicketId}
                captain={captain}
                setCaptain={setCaptain}
                isTableLocked={isCurrentTableLocked}
                onPrintBill={() => handlePrintBill(null, null)}
                onOpenSplitModal={() => handleOpenSplitModal(null, null)}
                onUnlockTable={() => handleUnlockTable({ id: selectedTable, num: `Table ${selectedTable}` }, { ticket_id: activeTicketId })}
                onBrowseMenu={() => setView('menu')}
            />

            {/* Split Billing & Multi-Tender Modal */}
            {splitModalOpen && splitModalData && (
                <SplitPaymentModal
                    isOpen={splitModalOpen}
                    onClose={() => setSplitModalOpen(false)}
                    tableInfo={splitModalData.tableInfo}
                    cartItems={splitModalData.items}
                    subtotal={splitModalData.subtotal}
                    cgst={splitModalData.cgst}
                    sgst={splitModalData.sgst}
                    grandTotal={splitModalData.grandTotal}
                    activeTicketId={splitModalData.ticketId}
                    captain={captain}
                    onConfirmSettle={handleConfirmSettle}
                />
            )}

            {/* Thermal Receipt Preview Modal */}
            {completedTicket && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 flex flex-col items-center max-h-[90vh] overflow-y-auto">
                        <div className="w-full flex justify-between items-center pb-3 border-b border-gray-100 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                                <h3 className="font-bold text-gray-900 text-base">Payment Settled Successfully</h3>
                            </div>
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                Paid & Closed
                            </span>
                        </div>

                        {/* Thermal Receipt Component */}
                        <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 w-full flex justify-center overflow-x-auto">
                            <Receipt ticket={completedTicket} />
                        </div>

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
                                ➕ New Order (F2)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}