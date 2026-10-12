import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { formatDisplayTicketNumber } from './utils/ticketSequence';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

export default function AdminDashboard({ onNavigate, currentUser }) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [backupStatus, setBackupStatus] = useState(null);
    const [reservations, setReservations] = useState([]);
    const [isStoreOpen, setIsStoreOpen] = useState(true);
    const [isTogglingStore, setIsTogglingStore] = useState(false);
    const [storeStatusMsg, setStoreStatusMsg] = useState(null);
    const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'reservations'
    const [resFilter, setResFilter] = useState('All');
    const [resSearch, setResSearch] = useState('');

    // ─── Fetch Store Open/Closed Status ────────────────────────────────────────
    const fetchStoreStatus = useCallback(async () => {
        try {
            const resId = localStorage.getItem('dine360_restaurant_id') || 'D360-RJY-1997';
            const { data, error } = await supabase
                .from('restaurants')
                .select('is_active')
                .eq('restaurant_id', resId)
                .maybeSingle();
            if (!error && data) {
                if (typeof data.is_active === 'boolean') {
                    setIsStoreOpen(data.is_active);
                }
            }
        } catch (err) {
            console.error('Error fetching store status:', err);
        }
    }, []);

    // ─── Toggle Store Open/Closed Online ────────────────────────────────────────
    const handleToggleStoreStatus = async () => {
        setIsTogglingStore(true);
        try {
            const resId = localStorage.getItem('dine360_restaurant_id') || 'D360-RJY-1997';
            const nextState = !isStoreOpen;
            const { error } = await supabase
                .from('restaurants')
                .update({ is_active: nextState, updated_at: new Date().toISOString() })
                .eq('restaurant_id', resId);
            if (error) throw error;
            setIsStoreOpen(nextState);
            setStoreStatusMsg(nextState ? 'Store is now OPEN online for customers' : 'Store is now CLOSED online (Bookings blocked)');
            setTimeout(() => setStoreStatusMsg(null), 3500);
        } catch (err) {
            console.error('Failed to toggle store status:', err);
            alert('Failed to update store status. Check connection.');
        } finally {
            setIsTogglingStore(false);
        }
    };

    // ─── Fetch All Table Reservations ───────────────────────────────────────────
    const fetchReservations = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('table_reservations')
                .select('*')
                .order('booking_date', { ascending: false })
                .order('start_time', { ascending: true });
            if (!error && data) {
                setReservations(data);
            }
        } catch (err) {
            console.error('Error loading table reservations:', err);
        }
    }, []);

    // ─── Update Reservation Status (Confirmed / Completed / Cancelled) ──────────
    const handleUpdateReservationStatus = async (id, newStatus) => {
        try {
            const { error } = await supabase
                .from('table_reservations')
                .update({ status: newStatus })
                .eq('id', id);
            if (error) throw error;
            setReservations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        } catch (err) {
            console.error('Error updating reservation:', err);
            alert('Could not update reservation status.');
        }
    };

    // ─── Delete Reservation ─────────────────────────────────────────────────────
    const handleDeleteReservation = async (id) => {
        if (!window.confirm('Are you sure you want to delete this table reservation?')) return;
        try {
            const { error } = await supabase
                .from('table_reservations')
                .delete()
                .eq('id', id);
            if (error) throw error;
            setReservations(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error('Error deleting reservation:', err);
            alert('Could not delete reservation.');
        }
    };

    useEffect(() => {
        fetchStoreStatus();
        fetchReservations();

        // Realtime subscription for instant multi-device syncing
        const resChannel = supabase
            .channel('admin_dashboard_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_reservations' }, () => {
                fetchReservations();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, () => {
                fetchStoreStatus();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(resChannel);
        };
    }, [fetchStoreStatus, fetchReservations]);

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
        } //else {
        //     setTimeout(() => {
        //         setMetrics({
        //             summary: {
        //                 total_revenue: 1102.5,
        //                 total_orders: 2,
        //                 avg_order_value: 551.25,
        //                 dine_in_revenue: 630,
        //                 takeaway_revenue: 472.5,
        //                 today_revenue: 1102.5,
        //                 today_orders: 2
        //             },
        //             topItems: [
        //                // { name: 'Butter Chicken', category: 'Main Course', total_qty: 1, total_sales: 450 },
        //                // { name: 'Paneer Tikka', category: 'Starters', total_qty: 1, total_sales: 280 },
        //                // { name: 'Garlic Naan', category: 'Breads', total_qty: 2, total_sales: 120 }
        //             ],
        //             categories: [
        //                 // { category: 'Main Course', total_qty: 1, total_sales: 450 },
        //                 // { category: 'Starters', total_qty: 1, total_sales: 280 },
        //                 // { category: 'Breads', total_qty: 2, total_sales: 120 }
        //             ],
        //             recentTickets: [
        //                 // { ticket_id: 4, order_type: 'Takeaway', subtotal: 450, tax: 22.5, grand_total: 472.5, payment_method: 'Cash', created_at: '2026-08-06 01:01:40', item_summary: 'Butter Chicken (x1)' },
        //                 // { ticket_id: 1, order_type: 'Dine-In', subtotal: 600, tax: 30, grand_total: 630, payment_method: 'Cash', created_at: '2026-08-06 00:40:24', item_summary: 'Paneer Tikka (x1), Garlic Naan (x2)' }
        //             ]
        //         });
        //         setLoading(false);
        //     }, 0);
        // }
    };

    // ─── Direct Supabase Dashboard Fetch (Browser Mode) ─────────────────────────
    const fetchDashboardFromSupabase = useCallback(async () => {
        setLoading(true);
        try {
            const restaurantId = localStorage.getItem('dine360_restaurant_id');

            // 1. Fetch all completed QR orders from restaurant_orders
            const { data: qrOrders } = await supabase
                .from('restaurant_orders')
                .select('*')
                .eq('status', 'Completed')
                .order('created_at', { ascending: false });

            // 2. Fetch all settled cashier tickets from sales_tickets
            const { data: cashierTickets } = await supabase
                .from('sales_tickets')
                .select('*')
                .eq('status', 'paid')
                .order('created_at', { ascending: false });

            // 3. Fetch all ticket items for top-item analytics
            const { data: ticketItems } = await supabase
                .from('sales_ticket_items')
                .select('*');

            // 4. Fetch menu/inventory to map real categories
            const { data: inventoryItems } = await supabase
                .from('inventory')
                .select('item_id, name, category');

            const itemCatLookup = {};
            (inventoryItems || []).forEach(inv => {
                if (inv.name) itemCatLookup[inv.name.trim().toLowerCase()] = inv.category;
                if (inv.item_id) itemCatLookup[`id_${inv.item_id}`] = inv.category;
            });

            // Map cashier ticket items by ticket_id for Items Summary
            const itemsByTicket = {};
            (ticketItems || []).forEach(ti => {
                if (!itemsByTicket[ti.ticket_id]) itemsByTicket[ti.ticket_id] = [];
                itemsByTicket[ti.ticket_id].push(`${ti.item_name} (x${ti.quantity || 1})`);
            });

            // Indian Standard Time (IST) Today date calculation in 'YYYY-MM-DD'
            const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const isTodayInIST = (isoStr) => {
                if (!isoStr) return false;
                try {
                    return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayIST;
                } catch {
                    return false;
                }
            };

            // ── Aggregate QR Orders ──
            const qrList = (qrOrders || []);
            const qrRevenue = qrList.reduce((s, o) => s + Number(o.total_amount || 0), 0);
            const qrToday = qrList.filter(o => isTodayInIST(o.created_at));
            const qrTodayRevenue = qrToday.reduce((s, o) => s + Number(o.total_amount || 0), 0);
            const qrDineIn = qrList.filter(o => (o.order_type || 'Dine-In') === 'Dine-In');
            const qrTakeaway = qrList.filter(o => (o.order_type || '') !== 'Dine-In');

            // ── Aggregate Cashier Tickets ──
            const cashList = (cashierTickets || []);
            const cashRevenue = cashList.reduce((s, t) => s + Number(t.grand_total || 0), 0);
            const cashToday = cashList.filter(t => isTodayInIST(t.created_at));
            const cashTodayRevenue = cashToday.reduce((s, t) => s + Number(t.grand_total || 0), 0);
            const cashDineIn = cashList.filter(t => t.order_type === 'Dine-In');
            const cashTakeaway = cashList.filter(t => t.order_type !== 'Dine-In');

            const totalRevenue = qrRevenue + cashRevenue;
            const totalOrders = qrList.length + cashList.length;
            const todayRevenue = qrTodayRevenue + cashTodayRevenue;
            const todayOrders = qrToday.length + cashToday.length;

            // ── Top Items from ticket_items + QR JSON items ──
            const itemMap = {};

            // From cashier sales_ticket_items
            (ticketItems || []).forEach(i => {
                const key = i.item_name || 'Unknown';
                const cat = itemCatLookup[key.trim().toLowerCase()] || itemCatLookup[`id_${i.item_id}`] || 'Main Course';
                if (!itemMap[key]) itemMap[key] = { name: key, category: cat, total_qty: 0, total_sales: 0 };
                itemMap[key].total_qty += Number(i.quantity || 1);
                itemMap[key].total_sales += Number(i.price_at_time || 0) * Number(i.quantity || 1);
            });

            // From QR restaurant_orders JSON items
            qrList.forEach(order => {
                let items = order.items;
                if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
                (items || []).forEach(i => {
                    const key = i.name || 'Unknown';
                    const cat = i.category || itemCatLookup[key.trim().toLowerCase()] || 'Main Course';
                    if (!itemMap[key]) itemMap[key] = { name: key, category: cat, total_qty: 0, total_sales: 0 };
                    itemMap[key].total_qty += Number(i.qty || i.quantity || 1);
                    itemMap[key].total_sales += Number(i.price || 0) * Number(i.qty || i.quantity || 1);
                });
            });

            const allItems = Object.values(itemMap);
            const topItems = [...allItems].sort((a, b) => b.total_sales - a.total_sales).slice(0, 8);

            // ── Category aggregation ──
            const catMap = {};
            allItems.forEach(i => {
                const cat = (i.category && i.category !== '-') ? i.category : 'General';
                if (!catMap[cat]) catMap[cat] = { category: cat, total_qty: 0, total_sales: 0 };
                catMap[cat].total_qty += i.total_qty;
                catMap[cat].total_sales += i.total_sales;
            });
            const categories = Object.values(catMap).sort((a, b) => b.total_sales - a.total_sales);

            // ── Recent Tickets (QR + Cashier merged, sorted by date) ──
            const recentQR = qrList.slice(0, 20).map(o => {
                let items = o.items;
                if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
                const summary = (items || []).map(i => `${i.name} (x${i.qty || i.quantity || 1})`).join(', ');
                return {
                    ticket_id: `QR-${o.id?.slice(0, 6)}`,
                    order_type: o.order_type || 'Dine-In',
                    subtotal: Number(o.total_amount || 0),
                    tax: 0,
                    grand_total: Number(o.total_amount || 0),
                    payment_method: 'QR Order',
                    created_at: o.created_at,
                    item_summary: summary || 'QR Order'
                };
            });

            const recentCash = cashList.slice(0, 20).map(t => {
                const summary = itemsByTicket[t.ticket_id]?.join(', ');
                return {
                    ticket_id: t.ticket_id,
                    order_type: t.order_type,
                    subtotal: Number(t.subtotal || 0),
                    tax: Number(t.tax || 0),
                    grand_total: Number(t.grand_total || 0),
                    payment_method: t.payment_method || 'Cash',
                    created_at: t.created_at,
                    item_summary: summary || t.item_summary || 'Cashier Order'
                };
            });

            const recentTickets = [...recentQR, ...recentCash]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 30);

            setMetrics({
                summary: {
                    total_revenue: totalRevenue,
                    total_orders: totalOrders,
                    avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                    dine_in_revenue: qrDineIn.reduce((s, o) => s + Number(o.total_amount || 0), 0) +
                                     cashDineIn.reduce((s, t) => s + Number(t.grand_total || 0), 0),
                    takeaway_revenue: qrTakeaway.reduce((s, o) => s + Number(o.total_amount || 0), 0) +
                                      cashTakeaway.reduce((s, t) => s + Number(t.grand_total || 0), 0),
                    today_revenue: todayRevenue,
                    today_orders: todayOrders
                },
                topItems,
                categories,
                recentTickets
            });
        } catch (err) {
            console.error('Dashboard Supabase fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

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
            // Browser mode: Direct Supabase fetch
            fetchDashboardFromSupabase();
        }

        return () => {
            isMounted = false;
        };
    }, [fetchDashboardFromSupabase]);

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

    // Format timestamps to clean Indian Standard Time (IST)
    const formatIST = (isoString) => {
        if (!isoString) return 'N/A';
        try {
            return new Date(isoString).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return isoString;
        }
    };

    // Helper to format 24h TIME string to 12h AM/PM
    const formatTime12h = (timeStr) => {
        if (!timeStr) return '';
        try {
            const parts = timeStr.split(':');
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hour12 = h % 12 || 12;
            return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
        } catch {
            return timeStr;
        }
    };

    const formatReservationSlot = (startTime, endTime) => {
        if (!startTime) return 'Not Specified';
        const s = formatTime12h(startTime);
        if (!endTime) return `${s} (Approx 75m)`;
        const e = formatTime12h(endTime);
        return `${s} – ${e}`;
    };

    const todayDateIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const filteredReservations = reservations.filter(r => {
        const q = (resSearch || '').toLowerCase().trim();
        const matchesSearch = !q ||
            (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
            (r.phone && r.phone.includes(q)) ||
            (r.table_id && r.table_id.toLowerCase().includes(q));

        if (!matchesSearch) return false;
        if (resFilter === 'Today') return r.booking_date === todayDateIST;
        if (resFilter === 'Confirmed') return r.status === 'Confirmed' || r.status === 'Pending';
        if (resFilter === 'Completed') return r.status === 'Completed';
        if (resFilter === 'Cancelled') return r.status === 'Cancelled';
        return true;
    });

    const activeReservationsCount = reservations.filter(r => r.status === 'Confirmed' || r.status === 'Pending').length;
    const todayReservationsCount = reservations.filter(r => r.booking_date === todayDateIST).length;

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
                        <p className="text-xs text-gray-500 font-medium">Real-time revenue metrics & Table Reservations audit</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>👤 {currentUser?.name || 'Staff'} ({currentUser?.role === 'manager' ? 'Manager' : 'Cashier'})</span>
                    </div>

                    {/* Store Open / Closed Status Live Toggle */}
                    <button
                        onClick={handleToggleStoreStatus}
                        disabled={isTogglingStore}
                        className={`px-3 py-1.5 rounded-lg border font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                            isStoreOpen 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 animate-pulse'
                        }`}
                        title="Click to toggle restaurant Open/Closed status on website"
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${isStoreOpen ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200'}`}></span>
                        <span>{isTogglingStore ? 'Updating...' : isStoreOpen ? '🟢 Store: OPEN' : '🔴 Store: CLOSED'}</span>
                    </button>

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
                        onClick={() => {
                            loadDataFromIPC(true);
                            fetchReservations();
                            fetchStoreStatus();
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        🔄 Refresh
                    </button>
                    <button
                        onClick={() => onNavigate('lock')}
                        className="px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                    >
                        🔒 Lock Terminal
                    </button>
                </div>
            </header>

            {/* Subheader Tab Navigation */}
            <div className="bg-white border-b border-gray-200 px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab('sales')}
                        className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'sales'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <span>📊 Sales & Financials</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('reservations')}
                        className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'reservations'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <span>🍽️ Table Reservations</span>
                        {activeReservationsCount > 0 && (
                            <span className="bg-amber-400 text-slate-900 text-xs px-2 py-0.5 rounded-full font-extrabold shadow-xs">
                                {activeReservationsCount}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-3 text-xs">
                    {storeStatusMsg && (
                        <span className="font-bold px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full animate-pulse">
                            ✓ {storeStatusMsg}
                        </span>
                    )}
                    <span className="text-gray-500 font-medium hidden sm:inline">
                        Online Booking Status: <strong className={isStoreOpen ? 'text-emerald-700' : 'text-rose-700'}>{isStoreOpen ? 'Accepting Reservations' : 'Online Store Closed'}</strong>
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-600 font-medium text-sm">Loading Sales Metrics...</p>
                    </div>
                </div>
            ) : (
                <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
                    {activeTab === 'reservations' ? (
                        <div className="space-y-6">
                            {/* Reservation Stat Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Bookings</span>
                                    <div className="text-3xl font-extrabold text-gray-900 mt-2">{reservations.length}</div>
                                    <span className="text-xs text-gray-500 mt-2">All time customer bookings</span>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-500">Today's Bookings</span>
                                    <div className="text-3xl font-extrabold text-blue-700 mt-2">{todayReservationsCount}</div>
                                    <span className="text-xs text-gray-500 mt-2">Reserved for {todayDateIST}</span>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Active / Confirmed</span>
                                    <div className="text-3xl font-extrabold text-emerald-700 mt-2">{activeReservationsCount}</div>
                                    <span className="text-xs text-gray-500 mt-2">Awaiting customer arrival</span>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Completed / Cancelled</span>
                                    <div className="text-3xl font-extrabold text-gray-600 mt-2">
                                        {reservations.filter(r => r.status === 'Completed' || r.status === 'Cancelled').length}
                                    </div>
                                    <span className="text-xs text-gray-500 mt-2">Finished or released tables</span>
                                </div>
                            </div>

                            {/* Reservations Table Container */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                            <span>🍽️ Table Reservations Audit</span>
                                            <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                                                Live Sync
                                            </span>
                                        </h3>
                                        <p className="text-xs text-gray-500">View reserved tables, scheduled time ranges & conflict preventions</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex bg-white border border-gray-200 rounded-lg p-1 text-xs font-semibold text-gray-600">
                                            {['All', 'Today', 'Confirmed', 'Completed', 'Cancelled'].map((f) => (
                                                <button
                                                    key={f}
                                                    onClick={() => setResFilter(f)}
                                                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                                                        resFilter === f
                                                            ? 'bg-emerald-600 text-white shadow-xs'
                                                            : 'hover:bg-gray-100 text-gray-600'
                                                    }`}
                                                >
                                                    {f}
                                                </button>
                                            ))}
                                        </div>

                                        <input
                                            type="text"
                                            placeholder="Search table, name, phone..."
                                            value={resSearch}
                                            onChange={(e) => setResSearch(e.target.value)}
                                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none w-56 font-medium"
                                        />

                                        <button
                                            onClick={fetchReservations}
                                            className="p-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                            title="Reload Reservations"
                                        >
                                            🔄
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-gray-600">
                                        <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-bold tracking-wider">
                                            <tr>
                                                <th className="px-6 py-3.5">Table</th>
                                                <th className="px-6 py-3.5">Customer</th>
                                                <th className="px-6 py-3.5">Booking Date</th>
                                                <th className="px-6 py-3.5">Reserved Time Window</th>
                                                <th className="px-6 py-3.5">Party Size</th>
                                                <th className="px-6 py-3.5">Status</th>
                                                <th className="px-6 py-3.5 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredReservations.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="text-center py-12 text-gray-400 font-medium">
                                                        <div className="text-3xl mb-2">🍽️</div>
                                                        No reservations found matching the current filter.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredReservations.map((r) => {
                                                    const isToday = r.booking_date === todayDateIST;
                                                    return (
                                                        <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-extrabold rounded-lg border border-indigo-200 text-xs">
                                                                    {r.table_id || 'Table'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-bold text-gray-900">{r.customer_name || 'Guest'}</div>
                                                                <a
                                                                    href={`tel:${r.phone}`}
                                                                    className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1 mt-0.5"
                                                                >
                                                                    📞 {r.phone}
                                                                </a>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                                                    <span>{r.booking_date}</span>
                                                                    {isToday && (
                                                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-full">
                                                                            TODAY
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] text-gray-400">
                                                                    Booked {formatIST(r.created_at)}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 font-extrabold text-xs rounded-md inline-block">
                                                                    ⏰ {formatReservationSlot(r.start_time, r.end_time)}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 font-semibold text-gray-700">
                                                                👥 {r.guests || 2} Persons
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                                    r.status === 'Confirmed' || r.status === 'Pending'
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                        : r.status === 'Completed'
                                                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                }`}>
                                                                    {r.status || 'Confirmed'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                                                                {r.status !== 'Completed' && (
                                                                    <button
                                                                        onClick={() => handleUpdateReservationStatus(r.id, 'Completed')}
                                                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold text-xs transition-colors cursor-pointer"
                                                                        title="Mark table freed & completed"
                                                                    >
                                                                        ✓ Complete
                                                                    </button>
                                                                )}
                                                                {r.status !== 'Cancelled' && (
                                                                    <button
                                                                        onClick={() => handleUpdateReservationStatus(r.id, 'Cancelled')}
                                                                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-semibold text-xs transition-colors cursor-pointer"
                                                                        title="Cancel this reservation"
                                                                    >
                                                                        ✕ Cancel
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleDeleteReservation(r.id)}
                                                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-semibold text-xs transition-colors cursor-pointer"
                                                                    title="Delete record permanently"
                                                                >
                                                                    🗑
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
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
                                                        {res.table_id?.toString().trim().toLowerCase().startsWith('table') ? res.table_id : `Table ${res.table_id}`}
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
                                                <td className="px-6 py-4 font-bold text-gray-900" title={`ID: ${t.ticket_id}`}>{formatDisplayTicketNumber(t.ticket_id)}</td>
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
                                                <td className="px-6 py-4 text-xs font-medium text-gray-500">{formatIST(t.created_at)}</td>
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
                    </>
                    )}
                </main>
            )}

            {/* Ticket Details Modal */}
            {selectedTicket && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-200">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">Ticket {formatDisplayTicketNumber(selectedTicket.ticket_id)} Details</h3>
                                <p className="text-xs text-gray-400">{formatIST(selectedTicket.created_at)}</p>
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