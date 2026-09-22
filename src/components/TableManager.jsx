import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; 
import { QRCodeCanvas } from 'qrcode.react';

const TableManager = ({ restaurantId, onNavigate }) => {
  const [tables, setTables] = useState([]);
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState(4);

  useEffect(() => {
    fetchTables();
  }, [restaurantId]);

  const fetchTables = async () => {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true });
    
    if (error) console.error("Error fetching tables:", error);
    else setTables(data);
  };

  const handleAddTable = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from('restaurant_tables')
      .insert([
        { restaurant_id: restaurantId, table_name: tableName, seating_capacity: capacity }
      ])
      .select();

    if (error) {
      alert("Error adding table: " + error.message); 
    } else {
      setTableName('');
      fetchTables(); 
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
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 px-6 py-2.5 rounded-lg font-bold shadow-md transition-all h-[46px] cursor-pointer"
            >
              + Add New Table
            </button>
          </form>
        </div>

        {/* Generated Tables Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {tables.map(table => (
            <div key={table.id} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col items-center hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>
              
              <h3 className="font-bold text-lg mb-4 text-slate-800">{table.table_name}</h3>
              
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-inner mb-4">
                <QRCodeCanvas 
                  value={`https://dine360-menu.com/order?res_id=${restaurantId}&table_id=${table.id}`} 
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

      </div>
    </div>
  );
};

export default TableManager;