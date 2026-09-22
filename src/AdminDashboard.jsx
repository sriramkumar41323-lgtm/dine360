import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function AdminDashboard({ onNavigate, currentUser }) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [backupStatus, setBackupStatus] = useState(null);
    const [reservations, setReservations] = useState([]);

    useEffect(() => {
        async function fetchReservations() {
            const { data } = await supabase.from('table_reservations').select('*');
            if (data) setReservations(data);
        }
        fetchReservations();
    }, []);

    const handleManualBackup = async () => {
        setBackupStatus('Creating Backup...');
        try {
            let result = null;
            if (ipcRenderer && ipcRenderer.invoke) {
                result = await ipcRenderer.invoke('trigger-manual-backup');
            } else if (window.electronAPI && window.electronAPI.triggerManualBackup) {
                result = await window.electronAPI.triggerManualBackup();
            } else {
                result = { success: true, fileName: 'dine360_backup_mock.sqlite' };
            }

            if (result && result.success) {
                setBackupStatus(`Saved: ${result.fileName || 'Success'}`);
                setTimeout(() => setBackupStatus(null), 4000);
            } else {
                setBackupStatus(`Backup Failed: ${result?.error || 'Error'}`);
            }
        } catch (err) {
            console.error('Backup error:', err);
            setBackupStatus('Backup Error');
        }
    };

    const loadDataFromIPC = (showLoadingSpinner = false) => {
        if (showLoadingSpinner) setLoading(true);

        if (ipcRenderer) {
            ipcRenderer.once('get-dashboard-data-response', (event, response) => {
                if (response && response.success) {
                    setMetrics(response.data);
                }
                setLoading(false);
            });
            ipcRenderer.send('get-dashboard-data');
        } else if (window.electronAPI?.getDashboardData) {
            const cleanup = window.electronAPI.onDashboardDataResponse((res) => {
                if (cleanup) cleanup();
                if (res && res.success) {
                    setMetrics(res.data);
                }
                setLoading(false);
            });
            window.electronAPI.getDashboardData();
        } else {
            setTimeout(() => {
                setMetrics({
                    summary: {
                        total_revenue: 1102.5,
                        total_orders: 2,
                        avg_order_value: 551.25,
                        dine_in_revenue: 630,
                        takeaway_revenue: 472.5,
                        today_revenue: 1102.5,
                        today_orders: 2
                    },
                    topItems: [
                        { name: 'Butter Chicken', category: 'Main Course', total_qty: 1, total_sales: 450 },
                        { name: 'Paneer Tikka', category: 'Starters', total_qty: 1, total_sales: 280 },
                        { name: 'Garlic Naan', category: 'Breads', total_qty: 2, total_sales: 120 }
                    ],
                    categories: [
                        { category: 'Main Course', total_qty: 1, total_sales: 450 },
                        { category: 'Starters', total_qty: 1, total_sales: 280 },
                        { category: 'Breads', total_qty: 2, total_sales: 120 }
                    ],
                    recentTickets: [
                        { ticket_id: 4, order_type: 'Takeaway', subtotal: 450, tax: 22.5, grand_total: 472.5, payment_method: 'Cash', created_at: '2026-08-06 01:01:40', item_summary: 'Butter Chicken (x1)' },
                        { ticket_id: 1, order_type: 'Dine-In', subtotal: 600, tax: 30, grand_total: 630, payment_method: 'Cash', created_at: '2026-08-06 00:40:24', item_summary: 'Paneer Tikka (x1), Garlic Naan (x2)' }
                    ]
                });
                setLoading(false);
            }, 0);
        }
    };

    useEffect(() => {
        let isMounted = true;
        if (ipcRenderer) {
            ipcRenderer.once('get-dashboard-data-response', (event, response) => {
                if (isMounted && response?.success) setMetrics(response.data);
                if (isMounted) setLoading(false);
            });
            ipcRenderer.send('get-dashboard-data');
        } else if (window.electronAPI?.getDashboardData) {
            const cleanup = window.electronAPI.onDashboardDataResponse((res) => {
                if (cleanup) cleanup();
                if (isMounted && res?.success) setMetrics(res.data);
                if (isMounted) setLoading(false);
            });
            window.electronAPI.getDashboardData();
        } else {
            setTimeout(() => {
                if (isMounted) {
                    setMetrics({
                        summary: {
                            total_revenue: 1102.5,
                            total_orders: 2,
                            avg_order_value: 551.25,
                            dine_in_revenue: 630,
                            takeaway_revenue: 472.5,
                            today_revenue: 1102.5,
                            today_orders: 2
                        },
                        topItems: [
                            { name: 'Butter Chicken', category: 'Main Course', total_qty: 1, total_sales: 450 },
                            { name: 'Paneer Tikka', category: 'Starters', total_qty: 1, total_sales: 280 },
                            { name: 'Garlic Naan', category: 'Breads', total_qty: 2, total_sales: 120 }
                        ],
                        categories: [
                            { category: 'Main Course', total_qty: 1, total_sales: 450 },
                            { category: 'Starters', total_qty: 1, total_sales: 280 },
                            { category: 'Breads', total_qty: 2, total_sales: 120 }
                        ],
                        recentTickets: [
                            { ticket_id: 4, order_type: 'Takeaway', subtotal: 450, tax: 22.5, grand_total: 472.5, payment_method: 'Cash', created_at: '2026-08-06 01:01:40', item_summary: 'Butter Chicken (x1)' },
                            { ticket_id: 1, order_type: 'Dine-In', subtotal: 600, tax: 30, grand_total: 630, payment_method: 'Cash', created_at: '2026-08-06 00:40:24', item_summary: 'Paneer Tikka (x1), Garlic Naan (x2)' }
                        ]
                    });
                    setLoading(false);
                }
            }, 0);
        }

        return () => {
            isMounted = false;
        };
    }, []);

    const summary = metrics?.summary || {};
    const topItems = metrics?.topItems || [];
    const categories = metrics?.categories || [];
    const recentTickets = metrics?.recentTickets || [];

    const filteredTickets = recentTickets.filter(t => {
        const matchesType = filterType === 'All' || t.order_type === filterType;
        const matchesSearch = searchQuery === '' || 
            t.ticket_id.toString().includes(searchQuery) ||
            (t.item_summary && t.item_summary.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesType && matchesSearch;
    });

    const maxCategorySales = Math.max(...categories.map(c => c.total_sales || 0), 1);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Top Navigation Bar */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onNavigate('pos')}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center gap-2 font-semibold text-sm cursor-pointer"
                    >
                        ← Back to POS
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Admin Sales Dashboard</h1>
                        <p className="text-xs text-gray-500 font-medium">Real-time revenue metrics & Database audit</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>👤 {currentUser?.name || 'Staff'} ({currentUser?.role === 'manager' ? 'Manager' : 'Cashier'})</span>
                    </div>
                    {backupStatus && (
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 animate-pulse">
                            {backupStatus}
                        </span>
                    )}
                    <button
                        onClick={handleManualBackup}
                        className="px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        💾 Backup Now
                    </button>
                    <button
                        onClick={() => onNavigate('inventory')}
                        className="px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 font-semibold text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        📦 Manage Inventory
                    </button>
                    <button
                        onClick={() => loadDataFromIPC(true)}
                        className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        🔄 Refresh Data
                    </button>
                    <button
                        onClick={() => onNavigate('lock')}
                        className="px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                    >
                        🔒 Lock Terminal
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-600 font-medium text-sm">Loading Sales Metrics...</p>
                    </div>
                </div>
            ) : (
                <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
                    {/* Key Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Revenue</span>
                                <div className="text-3xl font-extrabold text-gray-900 mt-2">
                                    ₹{Number(summary.total_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-medium">
                                <span>Dine-In: ₹{Number(summary.dine_in_revenue || 0).toLocaleString('en-IN')}</span>
                                <span>Takeaway: ₹{Number(summary.takeaway_revenue || 0).toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Orders</span>
                                <div className="text-3xl font-extrabold text-emerald-600 mt-2">
                                    {summary.total_orders || 0}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 font-medium flex justify-between">
                                <span>Saved in Database</span>
                                <span className="text-emerald-600 font-bold">100% Persisted</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Avg Order Value</span>
                                <div className="text-3xl font-extrabold text-indigo-600 mt-2">
                                    ₹{Number(summary.avg_order_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 font-medium">
                                Per transaction average
                            </div>
                        </div>

                        <div className="bg-emerald-600 text-white p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">Today's Revenue</span>
                                <div className="text-3xl font-extrabold mt-2">
                                    ₹{Number(summary.today_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-emerald-500 text-xs text-emerald-100 font-medium flex justify-between">
                                <span>Today's Orders: {summary.today_orders || 0}</span>
                                <span className="bg-emerald-700 px-2 py-0.5 rounded font-bold">Live</span>
                            </div>
                        </div>
                    </div>

                    {/* Active Table Reservations Section */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6">
                        <h3 className="font-bold text-gray-900 text-lg mb-4">Active Table Reservations</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3.5">Customer Name</th>
                                        <th className="px-6 py-3.5">Phone</th>
                                        <th className="px-6 py-3.5">Table ID</th>
                                        <th className="px-6 py-3.5">Date & Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {reservations.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="text-center py-6 text-gray-400 font-medium">No active reservations found.</td>
                                        </tr>
                                    ) : (
                                        reservations.map(res => (
                                            <tr key={res.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 font-bold text-gray-900">{res.customer_name}</td>
                                                <td className="px-6 py-4 font-semibold text-gray-700">{res.phone}</td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                                                        Table {res.table_id}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-500">{res.booking_date} ({res.start_time})</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Middle Charts & Ranking Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900 text-base">Top Selling Dishes</h3>
                                <span className="text-xs text-gray-400 font-medium">Ranked by Quantity</span>
                            </div>
                            <div className="p-6 flex-1 divide-y divide-gray-100">
                                {topItems.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-6">No sales data available yet.</p>
                                ) : (
                                    topItems.map((item, idx) => (
                                        <div key={idx} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-gray-100 text-gray-700' : 'bg-orange-50 text-orange-700'}`}>
                                                    #{idx + 1}
                                                </span>
                                                <div>
                                                    <h4 className="font-bold text-gray-800 text-sm">{item.name}</h4>
                                                    <span className="text-xs text-gray-400 font-medium">{item.category}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="block font-extrabold text-gray-900 text-sm">{item.total_qty} sold</span>
                                                <span className="text-xs text-emerald-600 font-semibold">₹{Number(item.total_sales || 0).toLocaleString('en-IN')}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-900 text-base">Sales by Category</h3>
                                <span className="text-xs text-gray-400 font-medium">Revenue Breakdown</span>
                            </div>
                            <div className="p-6 flex-1 space-y-4">
                                {categories.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-6">No category data available yet.</p>
                                ) : (
                                    categories.map((cat, idx) => {
                                        const percent = Math.round((cat.total_sales / maxCategorySales) * 100);
                                        return (
                                            <div key={idx} className="space-y-1.5">
                                                <div className="flex justify-between text-sm">
                                                    <span className="font-bold text-gray-800">{cat.category}</span>
                                                    <span className="font-semibold text-gray-600">₹{Number(cat.total_sales || 0).toLocaleString('en-IN')} ({cat.total_qty} qty)</span>
                                                </div>
                                                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                                    <div 
                                                        className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                                        style={{ width: `${percent}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Transaction History Section */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-gray-900 text-lg">Transaction Audit Log</h3>
                                <p className="text-xs text-gray-500">Full normalized records from tickets</p>
                            </div>

                            <div className="flex items-center gap-3">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 focus:outline-none"
                                >
                                    <option value="All">All Order Types</option>
                                    <option value="Dine-In">Dine-In</option>
                                    <option value="Takeaway">Takeaway</option>
                                </select>

                                <input
                                    type="text"
                                    placeholder="Search by Ticket # or item..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none w-60 font-medium"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3.5">Ticket #</th>
                                        <th className="px-6 py-3.5">Order Type</th>
                                        <th className="px-6 py-3.5">Items Summary</th>
                                        <th className="px-6 py-3.5">Payment</th>
                                        <th className="px-6 py-3.5">Grand Total</th>
                                        <th className="px-6 py-3.5">Timestamp</th>
                                        <th className="px-6 py-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredTickets.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="text-center py-8 text-gray-400 font-medium">
                                                No tickets found matching criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTickets.map((t) => (
                                            <tr key={t.ticket_id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="px-6 py-4 font-bold text-gray-900">#{t.ticket_id}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${t.order_type === 'Dine-In' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                        {t.order_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 max-w-xs truncate font-medium text-gray-700">
                                                    {t.item_summary || 'N/A'}
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-gray-700">{t.payment_method || 'Cash'}</td>
                                                <td className="px-6 py-4 font-extrabold text-emerald-600">
                                                    ₹{Number(t.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-xs font-medium text-gray-500">{t.created_at}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => setSelectedTicket(t)}
                                                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-semibold text-xs transition-colors cursor-pointer"
                                                    >
                                                        Details
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            )}

            {/* Ticket Details Modal */}
            {selectedTicket && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-200">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">Ticket #{selectedTicket.ticket_id} Details</h3>
                                <p className="text-xs text-gray-400">{selectedTicket.created_at}</p>
                            </div>
                            <button
                                onClick={() => setSelectedTicket(null)}
                                className="text-gray-400 hover:text-gray-600 font-bold text-lg px-2 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between py-1 border-b border-gray-50">
                                <span className="text-gray-500 font-medium">Order Type</span>
                                <span className="font-bold text-gray-800">{selectedTicket.order_type}</span>
                            </div>
                            <div className="py-2 border-b border-gray-50">
                                <span className="text-gray-500 font-medium block mb-1">Purchased Items</span>
                                <div className="bg-gray-50 p-3 rounded-lg text-xs font-semibold text-gray-800 leading-relaxed">
                                    {selectedTicket.item_summary}
                                </div>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 font-medium">Subtotal</span>
                                <span className="font-semibold text-gray-800">₹{Number(selectedTicket.subtotal || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 font-medium">Tax (CGST + SGST)</span>
                                <span className="font-semibold text-gray-800">₹{Number(selectedTicket.tax || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-t border-gray-200 text-base font-extrabold text-gray-900">
                                <span>Grand Total</span>
                                <span className="text-emerald-600">₹{Number(selectedTicket.grand_total || 0).toFixed(2)}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSelectedTicket(null)}
                            className="mt-6 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm transition-colors cursor-pointer"
                        >
                            Close Details
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}