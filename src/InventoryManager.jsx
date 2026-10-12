import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

const CATEGORIES = ["Starters", "Main Course", "Biryanis", "Breads", "Beverages", "Desserts"];

const DEFAULT_FORM = {
    name: '',
    price: '',
    category: 'Starters',
    type: 'veg'
};

export default function InventoryManager({ onNavigate, currentUser }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState(DEFAULT_FORM);
    const [editingItemId, setEditingItemId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);

    // Dynamic Categories State & Management
    const [categories, setCategories] = useState(() => {
        try {
            const stored = localStorage.getItem('dine360_categories');
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return CATEGORIES;
    });
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCatOld, setEditingCatOld] = useState(null);
    const [editingCatNew, setEditingCatNew] = useState('');

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Direct fetch from Supabase inventory table
            const { data, error } = await supabase
                .from('inventory')
                .select('*')
                .order('name', { ascending: true });

            if (!error && data) {
                setItems(data.map(i => ({ ...i, item_id: i.item_id || i.id, id: i.id || i.item_id })));
                setLoading(false);
                return;
            }
        } catch (err) {
            console.warn('Error fetching inventory from Supabase:', err);
        }

        // 2. Offline fallback to local Electron SQLite if Supabase unavailable
        if (ipcRenderer) {
            ipcRenderer.once('get-inventory-response', (event, response) => {
                if (response && response.success) {
                    setItems(response.items || []);
                }
                setLoading(false);
            });
            ipcRenderer.send('get-inventory');
        } else if (window.electronAPI?.getInventory) {
            const cleanup = window.electronAPI.onGetInventoryResponse((res) => {
                if (cleanup) cleanup();
                if (res && res.success) {
                    setItems(res.items || []);
                }
                setLoading(false);
            });
            window.electronAPI.getInventory();
        } else {
            setItems([]);
            setLoading(false);
        }
    }, []);

    // Initial mount & Supabase Realtime Listener
    useEffect(() => {
        fetchInventory();

        const channel = supabase
            .channel('inventory-realtime-all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
                console.log('🔄 Realtime inventory change:', payload);
                fetchInventory();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchInventory]);

    // Keep categories in sync with loaded items
    useEffect(() => {
        if (items.length > 0) {
            const itemCats = items.map(i => i.category).filter(Boolean);
            setCategories(prev => {
                const merged = [...new Set([...prev, ...itemCats])];
                localStorage.setItem('dine360_categories', JSON.stringify(merged));
                return merged;
            });
        }
    }, [items]);

    const handleAddCategory = (e) => {
        e.preventDefault();
        const trimmed = newCategoryName.trim();
        if (!trimmed) return;
        if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            alert(`Category "${trimmed}" already exists!`);
            return;
        }
        const updated = [...categories, trimmed];
        setCategories(updated);
        localStorage.setItem('dine360_categories', JSON.stringify(updated));
        setNewCategoryName('');
        setStatusMessage(`Category "${trimmed}" added.`);
    };

    const handleRenameCategory = async (oldName, newName) => {
        const trimmedNew = newName.trim();
        if (!trimmedNew || trimmedNew.toLowerCase() === oldName.toLowerCase()) {
            setEditingCatOld(null);
            return;
        }

        try {
            const { error } = await supabase
                .from('inventory')
                .update({ category: trimmedNew, updated_at: new Date().toISOString() })
                .eq('category', oldName);

            if (error) throw error;

            const updated = categories.map(c => c === oldName ? trimmedNew : c);
            setCategories(updated);
            localStorage.setItem('dine360_categories', JSON.stringify(updated));

            if (formData.category === oldName) {
                setFormData(prev => ({ ...prev, category: trimmedNew }));
            }

            setEditingCatOld(null);
            setEditingCatNew('');
            setStatusMessage(`Category renamed from "${oldName}" to "${trimmedNew}".`);
            fetchInventory();
        } catch (err) {
            alert('Failed to rename category: ' + err.message);
        }
    };

    const handleDeleteCategory = async (catName) => {
        const matchingCount = items.filter(i => i.category === catName).length;
        if (matchingCount > 0) {
            if (!confirm(`Warning: "${catName}" currently has ${matchingCount} items in inventory. If you delete it, those items will be reassigned to "General". Proceed?`)) {
                return;
            }
            try {
                await supabase
                    .from('inventory')
                    .update({ category: 'General', updated_at: new Date().toISOString() })
                    .eq('category', catName);
            } catch (err) {
                console.warn('Error reassigning items:', err);
            }
        } else {
            if (!confirm(`Are you sure you want to delete category "${catName}"?`)) return;
        }

        const updated = categories.filter(c => c !== catName);
        const finalCats = updated.length > 0 ? updated : ['General'];
        setCategories(finalCats);
        localStorage.setItem('dine360_categories', JSON.stringify(finalCats));
        if (formData.category === catName) {
            setFormData(prev => ({ ...prev, category: finalCats[0] }));
        }
        setStatusMessage(`Category "${catName}" removed.`);
        fetchInventory();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.price) {
            alert("Please provide a valid item name and price.");
            return;
        }

        const restaurantId = localStorage.getItem('dine360_restaurant_id') || 'D360-AND-4229';
        const priceNum = Number(formData.price);
        const payload = {
            restaurant_id: restaurantId,
            name: formData.name.trim(),
            price: priceNum,
            category: formData.category,
            type: formData.type,
            stock_qty: 100,
            is_active: true
        };

        try {
            if (editingItemId) {
                // Update in Supabase
                const { error } = await supabase
                    .from('inventory')
                    .update({
                        name: payload.name,
                        price: payload.price,
                        category: payload.category,
                        type: payload.type,
                        updated_at: new Date().toISOString()
                    })
                    .or(`id.eq.${editingItemId},item_id.eq.${editingItemId}`);

                if (error) throw error;
                setStatusMessage("Item updated successfully in Supabase!");
                
                // Sync SQLite
                if (ipcRenderer) {
                    ipcRenderer.send('update-item', { ...payload, item_id: editingItemId });
                }
            } else {
                // Insert in Supabase
                const generatedItemId = Date.now() % 1000000;
                const { error } = await supabase
                    .from('inventory')
                    .insert([{
                        ...payload,
                        item_id: generatedItemId
                    }]);

                if (error) throw error;
                setStatusMessage("New item added to Supabase!");

                // Sync SQLite
                if (ipcRenderer) {
                    ipcRenderer.send('add-item', { ...payload, item_id: generatedItemId });
                }
            }

            setFormData(DEFAULT_FORM);
            setEditingItemId(null);
            fetchInventory();
        } catch (err) {
            console.error("Error saving inventory item to Supabase:", err);
            alert(`Error: ${err.message || 'Database error occurred'}`);
        }
    };

    const handleEditClick = (item) => {
        setEditingItemId(item.id || item.item_id);
        setFormData({
            name: item.name,
            price: item.price.toString(),
            category: item.category || 'Starters',
            type: item.type || 'veg'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteClick = async (itemId, name) => {
        if (!confirm(`Are you sure you want to delete "${name}" from inventory?`)) return;

        try {
            const { error } = await supabase
                .from('inventory')
                .delete()
                .or(`id.eq.${itemId},item_id.eq.${itemId}`);

            if (error) throw error;
            setStatusMessage(`"${name}" deleted successfully.`);
            fetchInventory();
        } catch (err) {
            console.error("Error deleting from Supabase:", err);
            alert(`Error deleting item: ${err.message || 'Database error'}`);
        }

        // Sync SQLite
        if (ipcRenderer) {
            ipcRenderer.send('delete-item', itemId);
        }
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
        setFormData(DEFAULT_FORM);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center gap-2 font-semibold text-sm"
                    >
                        ← Back to Dashboard
                    </button>
                    <button
                        onClick={() => onNavigate('pos')}
                        className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-sm transition-colors"
                    >
                        🛒 Go to POS
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
                        <p className="text-xs text-gray-500 font-medium">Add, edit, or delete items in the SQLite database</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>👤 {currentUser?.name || 'Staff'} ({currentUser?.role === 'manager' ? 'Manager' : 'Cashier'})</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                        {items.length} Menu Items
                    </span>
                    <button
                        onClick={() => onNavigate('lock')}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                    >
                        🔒 Lock Terminal
                    </button>
                </div>
            </header>

            <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
                {/* Status Message Alert */}
                {statusMessage && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex justify-between items-center text-sm font-semibold">
                        <span>✅ {statusMessage}</span>
                        <button onClick={() => setStatusMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
                    </div>
                )}

                {/* Add / Edit Form Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h2 className="font-bold text-gray-900 text-lg">
                                {editingItemId ? `✏️ Edit Item #${editingItemId}` : '➕ Add New Dish / Menu Item'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsCategoryModalOpen(true)}
                                className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                title="Add, edit, rename, or delete menu categories"
                            >
                                <span>📂</span> Manage Categories ({categories.length})
                            </button>
                        </div>
                        {editingItemId && (
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-200 px-3 py-1 rounded-md"
                            >
                                Cancel Edit
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Item Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Paneer Butter Masala"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Price (₹)</label>
                            <input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="e.g. 350"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                required
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">Category</label>
                                <button
                                    type="button"
                                    onClick={() => setIsCategoryModalOpen(true)}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                >
                                    + Edit Categories
                                </button>
                            </div>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                                <option value="veg">Veg 🌱</option>
                                <option value="non-veg">Non-Veg 🍗</option>
                            </select>
                        </div>

                        <div className="md:col-span-2 lg:col-span-4 flex justify-end gap-3 pt-2">
                            {editingItemId && (
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm shadow-sm transition-colors"
                            >
                                {editingItemId ? '💾 Save Changes' : '➕ Add Item to Menu'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Inventory Table Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 text-lg">Menu Items Table</h3>
                        <span className="text-xs text-gray-400 font-medium">Stored in `inventory` table in dine360.sqlite</span>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500 font-medium">
                            Loading inventory from SQLite database...
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3.5">ID</th>
                                        <th className="px-6 py-3.5">Type</th>
                                        <th className="px-6 py-3.5">Item Name</th>
                                        <th className="px-6 py-3.5">Category</th>
                                        <th className="px-6 py-3.5">Price</th>
                                        <th className="px-6 py-3.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="text-center py-8 text-gray-400 font-medium">
                                                No menu items in database. Add one above!
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => {
                                            const id = item.item_id || item.id;
                                            return (
                                                <tr key={id} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-gray-900">#{id}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${item.type === 'veg' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                            <span className={`w-2 h-2 rounded-full ${item.type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                            {item.type === 'veg' ? 'Veg' : 'Non-Veg'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-gray-900 text-base">{item.name}</td>
                                                    <td className="px-6 py-4 font-semibold text-gray-600">{item.category}</td>
                                                    <td className="px-6 py-4 font-extrabold text-gray-900 text-base">
                                                        ₹{Number(item.price).toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right space-x-2">
                                                        <button
                                                            onClick={() => handleEditClick(item)}
                                                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-xs transition-colors"
                                                        >
                                                            ✏️ Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(id, item.name)}
                                                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs transition-colors"
                                                        >
                                                            🗑️ Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Category Management Modal */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <span>📂</span> Manage Menu Categories
                                </h3>
                                <p className="text-xs text-gray-500">Edit existing categories, rename, or create new ones</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsCategoryModalOpen(false); setEditingCatOld(null); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-base font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Add New Category Form */}
                        <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                placeholder="Enter new category name (e.g. Tandoori Specials)"
                                className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                            >
                                <span>➕</span> Add
                            </button>
                        </form>

                        {/* Categories List */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {categories.map(cat => {
                                const itemCount = items.filter(i => i.category === cat).length;
                                const isEditingThis = editingCatOld === cat;

                                return (
                                    <div
                                        key={cat}
                                        className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-white transition-all"
                                    >
                                        {isEditingThis ? (
                                            <div className="flex items-center gap-2 flex-1 mr-2">
                                                <input
                                                    type="text"
                                                    value={editingCatNew}
                                                    onChange={(e) => setEditingCatNew(e.target.value)}
                                                    className="flex-1 px-2.5 py-1.5 bg-white border border-indigo-400 rounded-lg text-xs font-bold text-gray-900 focus:outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRenameCategory(cat, editingCatNew)}
                                                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingCatOld(null)}
                                                    className="px-2 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300 cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <span className="font-bold text-gray-900 text-sm block">{cat}</span>
                                                    <span className="text-[11px] text-gray-500">{itemCount} items</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingCatOld(cat);
                                                            setEditingCatNew(cat);
                                                        }}
                                                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                                                        title="Rename Category"
                                                    >
                                                        ✏️ Rename
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteCategory(cat)}
                                                        className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                                                        title="Delete Category"
                                                    >
                                                        🗑️ Delete
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="pt-4 border-t border-gray-100 mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => { setIsCategoryModalOpen(false); setEditingCatOld(null); }}
                                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
