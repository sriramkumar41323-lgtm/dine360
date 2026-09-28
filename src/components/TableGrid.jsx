import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

const TABLE_SECTIONS = ["All", "Main Dining", "AC Hall", "Outdoor / Terrace", "VIP Section"];

export default function TableGrid({
    selectedTable,
    onSelectTable,
    activeTicketId,
    refreshTrigger,
    accentColor = "bg-orange-500",
    cardHoverClass = "hover:border-orange-300"
}) {
    const [activeSection, setActiveSection] = useState("All");
    const [openTickets, setOpenTickets] = useState([]);
    const [tablesList, setTablesList] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch dynamic tables from Supabase database
    const fetchTablesFromDB = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('restaurant_tables').select('*');
            if (data && data.length > 0) {
                const formatted = data.map((t, index) => ({
                    id: t.id,
                    num: t.name || t.table_name || t.num || `T${index + 1}`,
                    cap: t.cap || t.capacity || 4,
                    section: t.section || "Main Dining"
                }));
                setTablesList(formatted);
            } else {
                setTablesList([]);
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

            if (res && res.success) {
                setOpenTickets(res.tickets || []);
            } else if (Array.isArray(res)) {
                setOpenTickets(res);
            } else if (res && Array.isArray(res.tickets)) {
                setOpenTickets(res.tickets);
            } else {
                setOpenTickets([]);
            }
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

    // Handle Table Deletion from Supabase
    const handleDeleteTable = async (e, tableId) => {
        e.stopPropagation(); // Card click trigger avvakunda apadaniki
        if (window.confirm("Ee table ni delete cheyali anukuntunnara?")) {
            try {
                const { error } = await supabase
                    .from('restaurant_tables')
                    .delete()
                    .eq('id', tableId);

                if (!error) {
                    alert("Table successfully deleted!");
                    fetchTablesFromDB(); // List ni refresh cheyadam
                } else {
                    alert("Error deleting table: " + error.message);
                }
            } catch (err) {
                console.error('Delete table error:', err);
            }
        }
    };

    // Match table definition with open tickets from database
    const getOpenTicketForTable = (table) => {
        const rawNum = String(table.num).replace(/^T/i, '').trim();
        const rawId = String(table.id).trim();
        const padded = rawNum.padStart(2, '0');

        return openTickets.find(t => {
            if (!t.table_number) return false;
            const openStr = String(t.table_number).trim();
            const openClean = openStr.replace(/^T/i, '').replace(/^Table\s+/i, '').trim();
            return (
                openClean === rawNum ||
                openClean === rawId ||
                openClean === padded ||
                openStr === table.num ||
                openStr === `T${rawNum}` ||
                openStr === `T${padded}` ||
                openStr === `Table ${rawNum}` ||
                openStr === `Table ${padded}`
            );
        });
    };

    const handleTableClick = (table, openTicket) => {
        if (onSelectTable) {
            onSelectTable(table.id, openTicket, table);
        }
    };

    const filteredTables = activeSection === "All"
        ? tablesList
        : tablesList.filter(t => t.section === activeSection);

    return (
        <>
            {/* Section Categories Bar */}
            <div className="flex justify-between items-center pb-4 mb-4 gap-4">
                <div className="flex gap-2 overflow-x-auto">
                    {TABLE_SECTIONS.map(sec => (
                        <button
                            key={sec}
                            onClick={() => setActiveSection(sec)}
                            className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                                activeSection === sec
                                    ? `${accentColor} text-white border-transparent shadow-md`
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {sec}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={() => { fetchTablesFromDB(); fetchOpenTickets(); }}
                    className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-full text-xs font-bold text-gray-700 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div className="py-2 text-xs text-center font-semibold text-amber-800 bg-amber-50 rounded-lg border border-amber-200 mb-4 animate-pulse">
                    Fetching tables and running orders from database...
                </div>
            )}

            {/* Empty State if no tables */}
            {!loading && tablesList.length === 0 && (
                <div className="py-8 text-center text-gray-500 text-sm bg-white rounded-xl border border-gray-200">
                    No tables found. Please add tables from the "Tables & QR" section.
                </div>
            )}

            {/* Grid Layout */}
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTables.map(table => {
                    const openTicket = getOpenTicketForTable(table);
                    const isOccupied = Boolean(openTicket);
                    const isSelected = selectedTable === table.id;
                    const isActiveTicket = openTicket && openTicket.ticket_id === activeTicketId;
                    const isRunning = isOccupied || isActiveTicket;

                    return (
                        <div
                            key={table.id}
                            onClick={() => handleTableClick(table, openTicket)}
                            className={`relative bg-white border p-4 rounded-xl shadow-sm transition-all duration-200 flex flex-col justify-between cursor-pointer transform hover:-translate-y-1 hover:shadow-md ${cardHoverClass} ${
                                isSelected
                                    ? 'border-orange-500 ring-2 ring-orange-500/30 bg-orange-50/20'
                                    : isRunning
                                        ? 'border-amber-300 bg-amber-50/30'
                                        : 'border-gray-200 bg-white'
                            }`}
                        >
                            {/* Delete Table Button */}
                            <button
                                onClick={(e) => handleDeleteTable(e, table.id)}
                                className="absolute top-3 right-3 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 p-1.5 rounded-full transition-colors cursor-pointer"
                                title="Delete Table"
                            >
                                🗑️
                            </button>

                            <div>
                                {/* Status Indicator Dot & Section Label */}
                                <div className="flex justify-between items-start mb-2 pr-6">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{table.section}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        isRunning
                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                        {isRunning ? 'Occupied' : 'Available'}
                                    </span>
                                </div>

                                {/* Table Name & Details */}
                                <h3 className="font-bold text-gray-900 text-lg leading-tight mb-0.5">
                                    {table.num}
                                </h3>
                                <p className="text-gray-500 font-medium text-xs mb-2">
                                    {table.cap} Guests Capacity
                                </p>

                                {/* Running Ticket Details */}
                                {isOccupied ? (
                                    <div className="mt-2 pt-2 border-t border-amber-200/80">
                                        <div className="text-xs font-semibold text-amber-700">Running Total</div>
                                        <div className="text-lg font-extrabold text-amber-950">
                                            ₹{Number(openTicket.grand_total || 0).toFixed(2)}
                                        </div>
                                        <div className="text-[11px] font-medium text-amber-800 truncate">
                                            Ticket #{openTicket.ticket_id} ({(openTicket.items || openTicket.cartItems || []).length} items)
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                                        {isSelected ? 'Table selected for active cart' : 'Click table to begin order'}
                                    </div>
                                )}
                            </div>

                            {/* Action Button */}
                            <button className={`mt-4 w-full py-2 font-semibold rounded-lg text-sm transition-colors pointer-events-none flex items-center justify-center gap-1.5 ${
                                isRunning
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : isSelected
                                        ? 'bg-orange-500 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-900'
                            }`}>
                                {isRunning ? '📝 Retrieve Order' : isSelected ? '✓ Table Selected' : '+ Select Table'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );
}