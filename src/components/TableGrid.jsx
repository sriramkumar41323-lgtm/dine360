import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { QRCodeCanvas } from 'qrcode.react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

const TABLE_SECTIONS = ["All", "Main Dining", "AC Hall", "Outdoor / Terrace", "VIP Section"];

export default function TableGrid({
    selectedTable,
    onSelectTable,
    activeTicketId,
    refreshTrigger,
    restaurantId = (localStorage.getItem('dine360_restaurant_id') || 'D360-RJY-1997'),
    tables = [],
    tableCarts = {},
    onPrintBill,
    onSettleTable,
    onShiftTable,
    onMergeTables,
    onUnlockTable,
    onNavigate
}) {
    const [activeSection, setActiveSection] = useState("All");
    const [statusFilter, setStatusFilter] = useState("All"); // "All" | "empty" | "occupied" | "bill_printed"
    const [openTickets, setOpenTickets] = useState([]);
    const [tablesList, setTablesList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nowTime, setNowTime] = useState(Date.now());

    // Modals state
    const [qrModalTable, setQrModalTable] = useState(null);
    const [shiftModalOpen, setShiftModalOpen] = useState(false);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);

    const [shiftFromTableId, setShiftFromTableId] = useState('');
    const [shiftToTableId, setShiftToTableId] = useState('');

    const [mergeSourceTableId, setMergeSourceTableId] = useState('');
    const [mergeTargetTableId, setMergeTargetTableId] = useState('');

    // Timer updater every 20 seconds to keep table occupancy timers active
    useEffect(() => {
        const timer = setInterval(() => setNowTime(Date.now()), 20000);
        return () => clearInterval(timer);
    }, []);

    // Fetch dynamic tables from Supabase database
    const fetchTablesFromDB = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('restaurant_tables').select('*').order('created_at', { ascending: true });
            if (data && data.length > 0) {
                const effectiveId = restaurantId || localStorage.getItem('dine360_restaurant_id');
                const matched = effectiveId ? data.filter(t => t.restaurant_id === effectiveId) : [];
                const tablesToDisplay = matched.length > 0 ? matched : data;

                // Sort tables naturally
                const sorted = [...tablesToDisplay].sort((a, b) => {
                    const numA = parseInt((a.table_name || a.name || '').replace(/\D/g, ''), 10);
                    const numB = parseInt((b.table_name || b.name || '').replace(/\D/g, ''), 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return (a.table_name || a.name || '').localeCompare(b.table_name || b.name || '', undefined, { numeric: true });
                });

                const formatted = sorted.map((t, index) => ({
                    id: t.id,
                    num: t.table_name || t.name || t.num || `Table - ${index + 1}`,
                    cap: t.seating_capacity || t.cap || t.capacity || 4,
                    section: t.section || (index % 3 === 0 ? "AC Hall" : index % 4 === 0 ? "VIP Section" : "Main Dining")
                }));
                setTablesList(formatted);
            } else {
                // Fallback default tables if none registered yet
                setTablesList([
                    { id: 1, num: "T1", cap: 2, section: "Main Dining" },
                    { id: 2, num: "T2", cap: 4, section: "Main Dining" },
                    { id: 3, num: "T3", cap: 4, section: "Main Dining" },
                    { id: 4, num: "T4", cap: 6, section: "AC Hall" },
                    { id: 5, num: "T5", cap: 4, section: "AC Hall" },
                    { id: 6, num: "T6", cap: 8, section: "VIP Section" },
                    { id: 7, num: "T7", cap: 4, section: "Outdoor / Terrace" },
                    { id: 8, num: "T8", cap: 4, section: "Outdoor / Terrace" }
                ]);
            }
        } catch (err) {
            console.error('Failed to fetch tables from DB:', err);
        }
    }, []);

    const fetchOpenTickets = useCallback(async () => {
        setLoading(true);
        try {
            let res;
            if (ipcRenderer && ipcRenderer.invoke) {
                res = await ipcRenderer.invoke('get-open-tickets');
            } else if (window.electronAPI && window.electronAPI.getOpenTickets) {
                res = await window.electronAPI.getOpenTickets();
            } else {
                res = { success: true, tickets: [] };
            }

            let loadedTickets = [];
            if (res && res.success) {
                loadedTickets = res.tickets || [];
            } else if (Array.isArray(res)) {
                loadedTickets = res;
            } else if (res && Array.isArray(res.tickets)) {
                loadedTickets = res.tickets;
            }

            // Realtime Sync with Supabase restaurant_orders
            try {
                const { data: dbOrders } = await supabase
                    .from('restaurant_orders')
                    .select('*')
                    .in('status', ['Pending', 'pending']);
                if (dbOrders && dbOrders.length > 0) {
                    const mapped = dbOrders.map(o => ({
                        ticket_id: o.id,
                        table_id: o.table_id,
                        table_number: o.table_name,
                        status: 'occupied',
                        grand_total: o.total_amount,
                        created_at: o.created_at,
                        items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || [])
                    }));
                    loadedTickets = [...loadedTickets, ...mapped];
                }
            } catch (supaErr) {
                console.warn('Error fetching restaurant_orders in TableGrid:', supaErr);
            }

            setOpenTickets(loadedTickets);
        } catch (err) {
            console.error('Failed to fetch open tickets in TableGrid:', err);
            setOpenTickets([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        async function loadData() {
            if (isMounted) {
                await fetchTablesFromDB();
                await fetchOpenTickets();
            }
        }
        loadData();
        return () => {
            isMounted = false;
        };
    }, [fetchTablesFromDB, fetchOpenTickets, refreshTrigger]);

    // Match table definition with open tickets from database (normalizing names like "Table - 1", "T1", "1")
    const getOpenTicketForTable = useCallback((table) => {
        const cleanTableStr = String(table.num || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const tableDigits = String(table.num || '').replace(/\D+/g, '');
        const tableIdStr = String(table.id).trim();

        return openTickets.find(t => {
            if (!t.table_number && !t.table_id) return false;
            const openNumStr = String(t.table_number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const openDigits = String(t.table_number || '').replace(/\D+/g, '');
            const openId = String(t.table_id || '').trim();

            return (
                (openId && openId === tableIdStr) ||
                (openNumStr && openNumStr === cleanTableStr) ||
                (tableDigits && openDigits && tableDigits === openDigits)
            );
        });
    }, [openTickets]);

    // Compute Table State: 'empty' | 'occupied' | 'bill_printed'
    const getTableState = useCallback((table) => {
        // 1. Direct in-memory active cart check from POS
        const activeItems = tableCarts?.[table.id] || [];
        if (activeItems.length > 0) {
            const posTable = tables?.find(t => String(t.id) === String(table.id));
            if (posTable?.status === 'bill_printed') return 'bill_printed';
            return 'occupied';
        }

        // 2. POS tables status check (normalized to lowercase)
        const posTable = tables?.find(t => String(t.id) === String(table.id));
        if (posTable && posTable.status && posTable.status.toLowerCase() !== 'empty') {
            return posTable.status.toLowerCase();
        }

        // 3. Database / Electron / Supabase live ticket check
        const ticket = getOpenTicketForTable(table);
        if (!ticket) return 'empty';
        if (ticket.status === 'bill_printed') return 'bill_printed';
        return 'occupied';
    }, [tableCarts, tables, getOpenTicketForTable]);

    const getTableBill = (table, ticket) => {
        if (ticket && ticket.grand_total) return Number(ticket.grand_total);
        const activeItems = tableCarts?.[table.id] || [];
        if (activeItems.length > 0) {
            const sub = activeItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
            return Math.round(sub * 1.05);
        }
        const posTable = tables?.find(t => String(t.id) === String(table.id));
        if (posTable && posTable.bill) return Number(posTable.bill);
        return 0;
    };

    // Format Seated Timer (e.g., "45 mins", "12m", "1h 10m")
    const getElapsedTimer = (ticket) => {
        if (!ticket) return null;
        const created = ticket.created_at ? new Date(ticket.created_at).getTime() : nowTime;
        const diffMs = Math.max(0, nowTime - created);
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just seated';
        if (mins < 60) return `${mins} mins`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hrs}h ${remMins}m`;
    };

    // Counters for 4-State Workflow Header
    const counts = useMemo(() => {
        let empty = 0;
        let occupied = 0;
        let billPrinted = 0;

        tablesList.forEach(t => {
            const state = getTableState(t);
            if (state === 'empty') empty++;
            else if (state === 'bill_printed') billPrinted++;
            else occupied++;
        });

        return { empty, occupied, billPrinted, total: tablesList.length };
    }, [tablesList, getTableState]);

    // Handle shift submission
    const handleConfirmShift = () => {
        if (!shiftFromTableId || !shiftToTableId) {
            alert('Please select both Source and Destination tables.');
            return;
        }
        if (shiftFromTableId === shiftToTableId) {
            alert('Destination table must be different from Source table.');
            return;
        }

        const fromTable = tablesList.find(t => String(t.id) === String(shiftFromTableId));
        const toTable = tablesList.find(t => String(t.id) === String(shiftToTableId));
        const ticket = getOpenTicketForTable(fromTable);

        if (onShiftTable) {
            onShiftTable(fromTable, toTable, ticket);
        }
        setShiftModalOpen(false);
    };

    // Handle merge submission
    const handleConfirmMerge = () => {
        if (!mergeSourceTableId || !mergeTargetTableId) {
            alert('Please select both tables to merge.');
            return;
        }
        if (mergeSourceTableId === mergeTargetTableId) {
            alert('Source and Target tables cannot be the same.');
            return;
        }

        const sourceTable = tablesList.find(t => String(t.id) === String(mergeSourceTableId));
        const targetTable = tablesList.find(t => String(t.id) === String(mergeTargetTableId));
        const sourceTicket = getOpenTicketForTable(sourceTable);
        const targetTicket = getOpenTicketForTable(targetTable);

        if (onMergeTables) {
            onMergeTables(sourceTable, targetTable, sourceTicket, targetTicket);
        }
        setMergeModalOpen(false);
    };

    const filteredTables = tablesList.filter(table => {
        const matchesSection = activeSection === "All" || table.section === activeSection;
        const state = getTableState(table);
        const matchesStatus = statusFilter === "All" || state === statusFilter;
        return matchesSection && matchesStatus;
    });

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Top Toolbar: Lifecycle Status Counters & Quick Action Controls */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
                {/* Simplified Status Filters with Dot Indicators */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setStatusFilter("All")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${statusFilter === "All" ? "bg-slate-900 text-white border-slate-900 shadow-xs" : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"}`}
                    >
                        All Tables ({counts.total})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("empty")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${statusFilter === "empty" ? "bg-emerald-600 text-white border-emerald-600 shadow-xs" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"}`}
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Available ({counts.empty})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("occupied")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${statusFilter === "occupied" ? "bg-orange-500 text-white border-orange-500 shadow-xs" : "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"}`}
                    >
                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                        Occupied ({counts.occupied})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("bill_printed")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${statusFilter === "bill_printed" ? "bg-blue-600 text-white border-blue-600 shadow-xs" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}`}
                    >
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Billed ({counts.billPrinted})
                    </button>
                </div>

                {/* Operations: Shift Table, Merge Tables, Refresh */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            const firstOccupied = tablesList.find(t => getTableState(t) !== 'empty');
                            const firstEmpty = tablesList.find(t => getTableState(t) === 'empty');
                            setShiftFromTableId(firstOccupied ? String(firstOccupied.id) : '');
                            setShiftToTableId(firstEmpty ? String(firstEmpty.id) : '');
                            setShiftModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        title="Shift Customer from one table to another"
                    >
                        <span>🔀</span> Shift
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            const occupied = tablesList.filter(t => getTableState(t) !== 'empty');
                            setMergeSourceTableId(occupied[0] ? String(occupied[0].id) : '');
                            setMergeTargetTableId(occupied[1] ? String(occupied[1].id) : '');
                            setMergeModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        title="Merge two tables into one master bill"
                    >
                        <span>🔗</span> Merge
                    </button>

                    <button
                        type="button"
                        onClick={() => { fetchTablesFromDB(); fetchOpenTickets(); }}
                        className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                        <span>🔄</span> Refresh
                    </button>

                    {onNavigate && (
                        <button
                            type="button"
                            onClick={() => onNavigate('tables')}
                            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                            title="Manage, Edit, and Delete Tables"
                        >
                            <span>❖</span> Setup Tables
                        </button>
                    )}
                </div>
            </div>

            {/* Section Category Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {TABLE_SECTIONS.map(sec => (
                    <button
                        key={sec}
                        onClick={() => setActiveSection(sec)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${activeSection === sec
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {sec}
                    </button>
                ))}
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div className="py-1.5 text-xs text-center font-semibold text-amber-800 bg-amber-50 rounded-lg border border-amber-200 animate-pulse">
                    Syncing live tables & KOT timers...
                </div>
            )}

            {/* Visual Floor Plan Grid (Matching Image 2 Card Style with Orange Hover Glow) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 flex-1 overflow-y-auto pr-1">
                {filteredTables.map(table => {
                    const openTicket = getOpenTicketForTable(table);
                    const state = getTableState(table); // 'empty' | 'occupied' | 'bill_printed'
                    const isSelected = selectedTable === table.id;
                    const elapsed = getElapsedTimer(openTicket);
                    const billAmount = getTableBill(table, openTicket);
                    const cartItems = tableCarts?.[table.id] || openTicket?.items || openTicket?.cartItems || [];

                    // Exact Image 2 Card Design:
                    // Crisp white card, subtle border, rounded-2xl, smooth orange hover glow!
                    let cardBorderClasses = 'border-gray-200 hover:border-orange-500 hover:ring-2 hover:ring-orange-400/40 hover:bg-orange-50/15';
                    if (isSelected) {
                        cardBorderClasses = 'border-orange-500 ring-2 ring-orange-500 bg-orange-50/25 shadow-md';
                    } else if (state === 'occupied') {
                        cardBorderClasses = 'border-amber-300 bg-amber-50/20 hover:border-orange-500 hover:ring-2 hover:ring-orange-400/40';
                    } else if (state === 'bill_printed') {
                        cardBorderClasses = 'border-blue-300 bg-blue-50/20 hover:border-blue-500 hover:ring-2 hover:ring-blue-400/40';
                    }

                    return (
                        <div
                            key={table.id}
                            onClick={() => onSelectTable && onSelectTable(table.id, openTicket, table)}
                            className={`bg-white border rounded-2xl p-4 shadow-xs transition-all duration-200 flex flex-col justify-between cursor-pointer transform hover:-translate-y-0.5 select-none ${cardBorderClasses}`}
                        >
                            <div>
                                {/* Top Row: Status Dot Icon Box (matching Image 2) & Section */}
                                <div className="flex justify-between items-start mb-2">
                                    {state === 'occupied' ? (
                                        <div className="w-4 h-4 border border-orange-500 rounded flex items-center justify-center p-0.5 bg-orange-50" title="Occupied / Running KOT">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                                        </div>
                                    ) : state === 'bill_printed' ? (
                                        <div className="w-4 h-4 border border-blue-600 rounded flex items-center justify-center p-0.5 bg-blue-50" title="Bill Printed">
                                            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                        </div>
                                    ) : (
                                        <div className="w-4 h-4 border border-emerald-600 rounded flex items-center justify-center p-0.5 bg-emerald-50" title="Available">
                                            <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                                        </div>
                                    )}
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate max-w-[90px]">
                                        {table.section}
                                    </span>
                                </div>

                                {/* Middle: Table Name & Capacity / Live Bill */}
                                <h3 className="font-bold text-gray-900 leading-tight mb-1 text-base">
                                    {table.num}
                                </h3>
                                
                                {state !== 'empty' && billAmount > 0 ? (
                                    <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="font-black text-gray-900 text-sm">₹{billAmount}</span>
                                        <span className="text-[10px] font-bold text-gray-500">
                                            {elapsed ? `⏱️ ${elapsed}` : `${cartItems.length} items`}
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 font-semibold text-xs">
                                        👥 Capacity: {table.cap}
                                    </p>
                                )}
                            </div>

                            {/* Bottom Action Pill (Exact match to Image 2's bottom pill button) */}
                            <div className="mt-3 w-full">
                                {state === 'occupied' ? (
                                    <div className="w-full py-2 bg-orange-50 text-orange-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border border-orange-200">
                                        🟠 Occupied ({cartItems.length} items)
                                    </div>
                                ) : state === 'bill_printed' ? (
                                    <div className="w-full py-2 bg-blue-50 text-blue-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border border-blue-200">
                                        🔵 Billed (Locked)
                                    </div>
                                ) : (
                                    <div className="w-full py-2 bg-gray-50 hover:bg-orange-500 hover:text-white text-gray-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 border border-gray-100">
                                        + Select Table
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Self-Ordering QR Table Modal */}
            {qrModalTable && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border border-gray-200">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900 text-base">Self-Ordering QR Table</h3>
                            <button
                                type="button"
                                onClick={() => setQrModalTable(null)}
                                className="text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                            <h4 className="text-lg font-black text-orange-950">{qrModalTable.num}</h4>
                            <p className="text-xs text-orange-700 font-semibold">{qrModalTable.section} • {qrModalTable.cap} Guests</p>
                        </div>

                        {/* QR Code Canvas with working external URL for phones */}
                        <div className="flex justify-center p-4 bg-white rounded-xl border border-gray-200 shadow-inner">
                            <QRCodeCanvas
                                value={`https://royal-spice-website-weld.vercel.app/?table_id=${qrModalTable.id}&res_id=${restaurantId}`}
                                size={190}
                                level="H"
                                marginSize={2}
                            />
                        </div>

                        <p className="text-xs text-gray-500">
                            Customers can scan this QR code with any mobile camera to view the live menu and order from their table!
                        </p>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="flex-1 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                🖨️ Print QR Stand
                            </button>
                            <button
                                type="button"
                                onClick={() => setQrModalTable(null)}
                                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shift Table Modal */}
            {shiftModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-200">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🔀</span>
                                <h3 className="font-bold text-gray-900 text-base">Shift Table (Transfer Order)</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShiftModalOpen(false)}
                                className="text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-gray-600">
                            Transfer an open order, KOTs, and billing from one table to another without losing items.
                        </p>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Move From (Source Table):</label>
                                <select
                                    value={shiftFromTableId}
                                    onChange={(e) => setShiftFromTableId(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800"
                                >
                                    <option value="">-- Select Active Table --</option>
                                    {tablesList.filter(t => getTableState(t) !== 'empty').map(t => {
                                        const ticket = getOpenTicketForTable(t);
                                        return (
                                            <option key={t.id} value={t.id}>
                                                {t.num} ({t.section}) - Running: ₹{Number(ticket?.grand_total || 0).toFixed(2)}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Move To (Destination Table):</label>
                                <select
                                    value={shiftToTableId}
                                    onChange={(e) => setShiftToTableId(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800"
                                >
                                    <option value="">-- Select Empty Table --</option>
                                    {tablesList.filter(t => getTableState(t) === 'empty').map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.num} ({t.section}) - Capacity: {t.cap}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShiftModalOpen(false)}
                                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmShift}
                                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                Confirm Table Shift
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Merge Tables Modal */}
            {mergeModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-200">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🔗</span>
                                <h3 className="font-bold text-gray-900 text-base">Merge Tables</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMergeModalOpen(false)}
                                className="text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-gray-600">
                            Combine two open tickets and their KOTs into one master bill. The source table will be reset to Empty.
                        </p>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Source Table (Will be merged & freed):</label>
                                <select
                                    value={mergeSourceTableId}
                                    onChange={(e) => setMergeSourceTableId(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800"
                                >
                                    <option value="">-- Select Source Table --</option>
                                    {tablesList.filter(t => getTableState(t) !== 'empty').map(t => {
                                        const ticket = getOpenTicketForTable(t);
                                        return (
                                            <option key={t.id} value={t.id}>
                                                {t.num} ({t.section}) - Bill: ₹{Number(ticket?.grand_total || 0).toFixed(2)}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Target Table (Master Bill Table):</label>
                                <select
                                    value={mergeTargetTableId}
                                    onChange={(e) => setMergeTargetTableId(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800"
                                >
                                    <option value="">-- Select Master Target Table --</option>
                                    {tablesList.filter(t => getTableState(t) !== 'empty' && String(t.id) !== String(mergeSourceTableId)).map(t => {
                                        const ticket = getOpenTicketForTable(t);
                                        return (
                                            <option key={t.id} value={t.id}>
                                                {t.num} ({t.section}) - Bill: ₹{Number(ticket?.grand_total || 0).toFixed(2)}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setMergeModalOpen(false)}
                                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMerge}
                                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                Confirm Merge Tables
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}