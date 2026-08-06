import { useState, useEffect } from 'react';

const ipcRenderer = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

const CATEGORIES = ["Starters", "Main Course", "Biryanis", "Breads", "Beverages"];

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

    const fetchInventory = () => {
        setLoading(true);
        if (ipcRenderer) {
            ipcRenderer.once('get-inventory-response', (event, response) => {
                if (response && response.success) {
                    setItems(response.items || []);
                } else {
                    console.error("Error loading inventory:", response?.error);
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
            // Mock browser fallback items
            setTimeout(() => {
                setItems([
                    { item_id: 1, name: "Paneer Tikka", price: 280, category: "Starters", type: "veg" },
                    { item_id: 2, name: "Chicken 65", price: 320, category: "Starters", type: "non-veg" },
                    { item_id: 3, name: "Butter Chicken", price: 450, category: "Main Course", type: "non-veg" },
                    { item_id: 4, name: "Dal Makhani", price: 290, category: "Main Course", type: "veg" }
                ]);
                setLoading(false);
            }, 0);
        }
    };

    useEffect(() => {
        let isMounted = true;
        if (ipcRenderer) {
            ipcRenderer.once('get-inventory-response', (event, response) => {
                if (isMounted && response?.success) setItems(response.items || []);
                if (isMounted) setLoading(false);
            });
            ipcRenderer.send('get-inventory');
        } else if (window.electronAPI?.getInventory) {
            const cleanup = window.electronAPI.onGetInventoryResponse((res) => {
                if (cleanup) cleanup();
                if (isMounted && res?.success) setItems(res.items || []);
                if (isMounted) setLoading(false);
            });
            window.electronAPI.getInventory();
        } else {
            setTimeout(() => {
                if (isMounted) {
                    setItems([
                        { item_id: 1, name: "Paneer Tikka", price: 280, category: "Starters", type: "veg" },
                        { item_id: 2, name: "Chicken 65", price: 320, category: "Starters", type: "non-veg" },
                        { item_id: 3, name: "Butter Chicken", price: 450, category: "Main Course", type: "non-veg" },
                        { item_id: 4, name: "Dal Makhani", price: 290, category: "Main Course", type: "veg" }
                    ]);
                    setLoading(false);
                }
            }, 0);
        }

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.price) {
            alert("Please provide a valid item name and price.");
            return;
        }

        const payload = {
            item_id: editingItemId,
            name: formData.name.trim(),
            price: Number(formData.price),
            category: formData.category,
            type: formData.type
        };

        if (editingItemId) {
            // Update Item
            if (ipcRenderer) {
                ipcRenderer.once('update-item-response', (event, res) => {
                    if (res && res.success) {
                        setStatusMessage("Item updated successfully!");
                        setFormData(DEFAULT_FORM);
                        setEditingItemId(null);
                        fetchInventory();
                    } else {
                        alert(`Error updating item: ${res?.error || 'Unknown error'}`);
                    }
                });
                ipcRenderer.send('update-item', payload);
            } else if (window.electronAPI?.updateItem) {
                const cleanup = window.electronAPI.onUpdateItemResponse((res) => {
                    if (cleanup) cleanup();
                    if (res && res.success) {
                        setStatusMessage("Item updated successfully!");
                        setFormData(DEFAULT_FORM);
                        setEditingItemId(null);
                        fetchInventory();
                    } else {
                        alert(`Error updating item: ${res?.error}`);
                    }
                });
                window.electronAPI.updateItem(payload);
            } else {
                setItems(prev => prev.map(i => i.item_id === editingItemId ? { ...payload, item_id: editingItemId } : i));
                setFormData(DEFAULT_FORM);
                setEditingItemId(null);
            }
        } else {
            // Add Item
            if (ipcRenderer) {
                ipcRenderer.once('add-item-response', (event, res) => {
                    if (res && res.success) {
                        setStatusMessage("New item added to menu!");
                        setFormData(DEFAULT_FORM);
                        fetchInventory();
                    } else {
                        alert(`Error adding item: ${res?.error || 'Unknown error'}`);
                    }
                });
                ipcRenderer.send('add-item', payload);
            } else if (window.electronAPI?.addItem) {
                const cleanup = window.electronAPI.onAddItemResponse((res) => {
                    if (cleanup) cleanup();
                    if (res && res.success) {
                        setStatusMessage("New item added to menu!");
                        setFormData(DEFAULT_FORM);
                        fetchInventory();
                    } else {
                        alert(`Error adding item: ${res?.error}`);
                    }
                });
                window.electronAPI.addItem(payload);
            } else {
                const newItem = { ...payload, item_id: Date.now() % 1000 };
                setItems(prev => [...prev, newItem]);
                setFormData(DEFAULT_FORM);
            }
        }
    };

    const handleEditClick = (item) => {
        setEditingItemId(item.item_id || item.id);
        setFormData({
            name: item.name,
            price: item.price.toString(),
            category: item.category,
            type: item.type
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteClick = (itemId, name) => {
        if (!confirm(`Are you sure you want to delete "${name}" from inventory?`)) return;

        if (ipcRenderer) {
            ipcRenderer.once('delete-item-response', (event, res) => {
                if (res && res.success) {
                    setStatusMessage(`"${name}" deleted successfully.`);
                    fetchInventory();
                } else {
                    alert(`Error deleting item: ${res?.error || 'Unknown error'}`);
                }
            });
            ipcRenderer.send('delete-item', itemId);
        } else if (window.electronAPI?.deleteItem) {
            const cleanup = window.electronAPI.onDeleteItemResponse((res) => {
                if (cleanup) cleanup();
                if (res && res.success) {
                    setStatusMessage(`"${name}" deleted successfully.`);
                    fetchInventory();
                } else {
                    alert(`Error deleting item: ${res?.error}`);
                }
            });
            window.electronAPI.deleteItem(itemId);
        } else {
            setItems(prev => prev.filter(i => (i.item_id || i.id) !== itemId));
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
                        <h2 className="font-bold text-gray-900 text-lg">
                            {editingItemId ? `✏️ Edit Item #${editingItemId}` : '➕ Add New Dish / Menu Item'}
                        </h2>
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
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Category</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                                {CATEGORIES.map(cat => (
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
        </div>
    );
}
