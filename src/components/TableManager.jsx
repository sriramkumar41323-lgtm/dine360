import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; 
import { QRCodeCanvas } from 'qrcode.react';

const TableManager = ({ restaurantId, onNavigate }) => {
  const [tables, setTables] = useState([]);
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Edit Table State
  const [editingTable, setEditingTable] = useState(null);
  const [editTableName, setEditTableName] = useState('');
  const [editCapacity, setEditCapacity] = useState(4);
  const [editSection, setEditSection] = useState('Main Dining');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Effective Restaurant ID fallback
  const effectiveResId = restaurantId || localStorage.getItem('dine360_restaurant_id') || 'D360-RJY-1997';

  useEffect(() => {
    fetchTables();

    const channel = supabase
      .channel('table-manager-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        fetchTables();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const fetchTables = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error("Error fetching tables:", error);
      } else if (data && data.length > 0) {
        // Match by effective restaurant ID if available; if none match, display all active restaurant tables
        const matched = effectiveResId ? data.filter(t => t.restaurant_id === effectiveResId) : [];
        const tablesToDisplay = matched.length > 0 ? matched : data;
        
        // Sort tables naturally so Table - 1, Table - 2 ... Table - 21 are in order
        const sorted = [...tablesToDisplay].sort((a, b) => {
          const numA = parseInt((a.table_name || '').replace(/\D/g, ''), 10);
          const numB = parseInt((b.table_name || '').replace(/\D/g, ''), 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return (a.table_name || '').localeCompare(b.table_name || '', undefined, { numeric: true });
        });
        setTables(sorted);

        // Keep local storage in sync with actual restaurant ID
        if (tablesToDisplay[0]?.restaurant_id) {
          localStorage.setItem('dine360_restaurant_id', tablesToDisplay[0].restaurant_id);
        }
      } else {
        setTables([]);
      }
    } catch (err) {
      console.error("Failed to fetch tables:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!tableName.trim()) return;

    setIsAdding(true);
    try {
      const targetResId = effectiveResId || tables[0]?.restaurant_id || 'D360-RJY-1997';
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert([
          { restaurant_id: targetResId, table_name: tableName.trim(), seating_capacity: capacity }
        ])
        .select();

      if (error) {
        if (error.code === '23505') {
          alert(`Table "${tableName.trim()}" already exists! Please use a unique name.`);
        } else {
          alert("Error adding table: " + error.message);
        }
      } else {
        setTableName('');
        fetchTables(); 
      }
    } catch (err) {
      alert("Error adding table: " + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTable = async (tableId, name) => {
    if (!window.confirm(name ? `Are you sure you want to remove "${name}"?` : "Are you sure you want to remove this table?")) return;

    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', tableId);

      if (error) {
        alert("Error deleting table: " + error.message);
      } else {
        fetchTables();
      }
    } catch (err) {
      alert("Failed to delete table: " + err.message);
    }
  };

  const handleStartEdit = (table) => {
    setEditingTable(table);
    setEditTableName(table.table_name || '');
    setEditCapacity(Number(table.seating_capacity) || 4);
    setEditSection(table.section || 'Main Dining');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTableName.trim()) return;

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({
          table_name: editTableName.trim(),
          seating_capacity: editCapacity,
          section: editSection,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingTable.id);

      if (error) {
        alert("Error updating table: " + error.message);
      } else {
        setEditingTable(null);
        fetchTables();
      }
    } catch (err) {
      alert("Failed to update table: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-slate-100 text-slate-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        
        {/* Header with Back Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-orange-500">❖</span> Manage Tables & QR Codes
          </h2>
          
          <button 
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5 cursor-pointer"
          >
            ← Back to POS
          </button>
        </div>
        
        {/* Table Add Form */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm mb-8">
          <form onSubmit={handleAddTable} className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Table Name</label>
              <input 
                type="text" 
                placeholder="e.g., Table 01, VIP-A" 
                value={tableName} 
                onChange={(e) => setTableName(e.target.value)} 
                className="bg-slate-50 border border-slate-300 text-slate-900 p-2.5 rounded-lg w-64 placeholder-slate-400 focus:outline-none focus:border-orange-500" 
                required 
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Capacity</label>
              <select 
                value={capacity} 
                onChange={(e) => setCapacity(Number(e.target.value))} 
                className="bg-slate-50 border border-slate-300 text-slate-900 p-2.5 rounded-lg focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value={2}>2 Seater</option>
                <option value={4}>4 Seater</option>
                <option value={6}>6 Seater</option>
                <option value={8}>8 Seater</option>
                <option value={10}>10+ Seater</option>
              </select>
            </div>
            
            <button 
              type="submit" 
              disabled={isAdding}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-slate-950 px-6 py-2.5 rounded-lg font-bold shadow-md transition-all h-[46px] cursor-pointer flex items-center gap-2"
            >
              {isAdding ? 'Adding...' : '+ Add New Table'}
            </button>
          </form>
        </div>

        {/* Generated Tables Grid */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Loading tables...
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl">
            <p className="text-slate-500 font-medium text-base mb-1">No tables added yet</p>
            <p className="text-slate-400 text-xs">Enter a table name above and click "+ Add New Table" to generate your first QR code.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {tables.map(table => (
              <div key={table.id} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col items-center hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>
                
                {/* Action Buttons: Edit & Delete Table */}
                <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(table)}
                    className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1.5 rounded-full transition-colors cursor-pointer shadow-xs"
                    title="Edit Table Name / Capacity / Section"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTable(table.id, table.table_name)}
                    className="text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 p-1.5 rounded-full transition-colors cursor-pointer shadow-xs"
                    title="Delete Table"
                  >
                    🗑️
                  </button>
                </div>

                <h3 className="font-bold text-lg mb-4 text-slate-800 pr-14">{table.table_name}</h3>
                
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-inner mb-4">
                  <QRCodeCanvas 
                    value={`https://royal-spice-website-weld.vercel.app/?table_id=${table.id}&res_id=${table.restaurant_id || effectiveResId || 'D360-RJY-1997'}`} 
                    size={140} 
                    level="H"
                  />
                </div>
                
                <div className="w-full flex justify-between items-center px-2 mt-1">
                  <p className="text-xs text-slate-500 font-medium">Capacity: <span className="text-slate-800 font-bold">{table.seating_capacity}</span></p>
                  <p className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                    {table.status || 'Empty'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit Table Modal */}
        {editingTable && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-5">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>✏️</span> Edit Table Details
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingTable(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Table Name / Number
                  </label>
                  <input
                    type="text"
                    value={editTableName}
                    onChange={(e) => setEditTableName(e.target.value)}
                    required
                    placeholder="e.g. Table 01, VIP-1"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Seating Capacity
                  </label>
                  <select
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-semibold cursor-pointer"
                  >
                    <option value={2}>2 Seater</option>
                    <option value={4}>4 Seater</option>
                    <option value={6}>6 Seater</option>
                    <option value={8}>8 Seater</option>
                    <option value={10}>10+ Seater</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Section
                  </label>
                  <select
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-semibold cursor-pointer"
                  >
                    <option value="Main Dining">Main Dining</option>
                    <option value="AC Hall">AC Hall</option>
                    <option value="Outdoor / Terrace">Outdoor / Terrace</option>
                    <option value="VIP Section">VIP Section</option>
                  </select>
                </div>

                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingTable(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TableManager;